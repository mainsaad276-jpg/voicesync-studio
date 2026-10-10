// Storage layer.
//  • On Vercel (or anywhere with Upstash Redis env vars) the whole database is one JSON document in Redis.
//  • Locally it falls back to a JSON file in ./data.
// Every request gets its own snapshot (AsyncLocalStorage). Writes go through tx(): lock → fresh load → change → save → unlock,
// so concurrent serverless instances never overwrite each other.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const EMPTY = () => ({ users: [], voices: [], generations: [], payments: [], apiKeys: [], playground: {}, previews: {}, hiddenLib: [] });
const KEY = process.env.DB_KEY || 'voicesync:db';
const LOCK = KEY + ':lock';

// ── backends ──────────────────────────────────────────────
const RURL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function redisBackend() {
  const cmd = async (...args) => {
    const r = await fetch(RURL, { method: 'POST', headers: { Authorization: `Bearer ${RTOK}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json();
    if (j.error) throw new Error('Redis: ' + j.error);
    return j.result;
  };
  return {
    name: 'redis',
    async read() { const s = await cmd('GET', KEY); return s ? { ...EMPTY(), ...JSON.parse(s) } : EMPTY(); },
    async write(data) { await cmd('SET', KEY, JSON.stringify(data)); },
    async lock() {
      const token = crypto.randomBytes(8).toString('hex');
      for (let i = 0; i < 300; i++) {
        if (await cmd('SET', LOCK, token, 'NX', 'PX', '15000')) return token;
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
      }
      throw new Error('Database busy, please retry.');
    },
    async unlock(token) { await cmd('EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", '1', LOCK, token); },
  };
}

function fileBackend() {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'db.json');
  let chain = Promise.resolve();
  return {
    name: 'file',
    async read() { try { return { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return EMPTY(); } },
    async write(data) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); },
    lock() { let release; const p = new Promise((r) => (release = r)); const prev = chain; chain = chain.then(() => p); return prev.then(() => release); },
    async unlock(release) { release(); },
  };
}

const backend = RURL && RTOK ? redisBackend() : fileBackend();
if (process.env.VERCEL && backend.name === 'file') console.warn('⚠️  No Redis configured — data will NOT persist on Vercel. Add Upstash Redis in Vercel → Storage.');

// ── request-scoped snapshot ───────────────────────────────
const als = new AsyncLocalStorage();
const cur = () => { const s = als.getStore(); if (!s) throw new Error('db used outside request'); return s; };
const db = new Proxy({}, {
  get: (_, k) => cur().data[k],
  set: (_, k, v) => { cur().data[k] = v; return true; },
});

// Express middleware: load a snapshot for this request
const attach = () => async (req, res, next) => {
  try { const data = await backend.read(); als.run({ data }, next); } catch (e) { next(e); }
};

// Run fn against fresh data under a lock, then persist. Returns fn's result.
async function tx(fn) {
  const s = cur();
  const token = await backend.lock();
  try {
    s.data = await backend.read();
    const out = await fn(s.data);
    await backend.write(s.data);
    return out;
  } finally { await backend.unlock(token).catch(() => {}); }
}

const id = (p = '') => p + crypto.randomBytes(9).toString('base64url');
const now = () => new Date().toISOString();

module.exports = { db, tx, attach, id, now, backend };
