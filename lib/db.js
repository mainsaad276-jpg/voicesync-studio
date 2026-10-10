// Tiny JSON-file database. Good for a single server (VPS, Render with disk, Railway volume).
// Swap for Postgres/Supabase later without touching routes: keep the same function names.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const empty = { users: [], sessions: [], voices: [], generations: [], payments: [], apiKeys: [], playground: {} };
let db;
try { db = { ...empty, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { db = structuredClone(empty); }

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, FILE);
  }, 50);
}
function flush() { clearTimeout(timer); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); }
process.on('exit', flush);

const id = (p = '') => p + crypto.randomBytes(9).toString('base64url');
const now = () => new Date().toISOString();

module.exports = { db, save, flush, id, now, DATA_DIR };
