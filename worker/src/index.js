/*
 * VoxNova: voice proxy (Cloudflare Worker).
 *
 * The app sends { text, voice } here; this Worker calls Azure AI Speech with
 * the secret key and returns MP3 audio. The Azure key never reaches the
 * website or the APK.
 *
 * Also relays JSF Labs (jsflabs.io) voice cloning:
 *   POST /jsf/clone  multipart {audio, name, gender?, language?} -> {voiceId, name, ...}
 *   POST /jsf/tts    json {text, voice_id, speed?}                -> audio/wav
 *
 * Paid plans (activation codes + character balance, Cloudflare KV `PRO`):
 *   POST /pro/status          json {code}                      -> {valid, plan, remaining, ...}
 *   POST /admin/codes         x-admin-key; json {plan, chars, days, note} -> new code
 *   GET  /admin/codes         x-admin-key                      -> recent codes
 *   POST /admin/topup         x-admin-key; json {code, chars, days}
 *   POST /admin/user          x-admin-key; json {code, name, phone, note} -> edit a user's label
 *   GET/POST /admin/plans     x-admin-key; json {plans:[{name,chars,price,firstMonth,buyCost,badge}]} or {reset:true}
 *   GET/POST /admin/paysettings x-admin-key; json {whatsapp, methods:[{label:{en,ur}, value, name}]}
 *   GET/POST /admin/ticker    x-admin-key; json {enabled, speed, items:[{icon,en,ur,action,url}]} or {reset:true}
 *   GET  /pro/plans           public plans (no buyCost) + payment accounts + ticker for the app
 *   POST /pro/trial           json {device}  -> free trial code (FREE_TRIAL_CHARS, default 10,000)
 *   POST /pro/request         json {name, phone, plan, chars, price, method, tid, screenshot?, device}
 *   POST /pro/request/status  json {id, secret} -> {status, code?} (app activates itself when approved)
 *   GET  /admin/requests      x-admin-key -> subscription requests
 *   GET  /admin/requests/image?id=  x-admin-key -> payment screenshot
 *   POST /admin/requests/approve    x-admin-key; json {id, chars?, days?, plan?}
 *   POST /admin/requests/reject     x-admin-key; json {id, reason}
 *   GET/POST /admin/settings  x-admin-key -> API keys saved in storage (a Worker secret wins)
 *   /jsf/* need header X-VS-Code with a valid code; /jsf/tts deducts characters.
 *
 * Secrets / vars (set with wrangler, never committed):
 *   ADMIN_KEY            secret, password for the admin page (docs/admin.html)
 *   AZURE_SPEECH_KEY     secret, KEY 1 from the Azure Speech resource
 *   JSF_API_KEY          secret, JSF Labs API key (starts with jsf_)
 *   AZURE_SPEECH_REGION  var, e.g. "centralindia"
 *   ALLOWED_ORIGINS      var, comma-separated list of sites allowed to call
 * Optional binding:
 *   RATE_LIMITER         Workers rate-limit binding (see wrangler.toml)
 */

const MAX_CHARS = 3000;                       // per request; the app chunks longer scripts
const VOICE_RE = /^[a-z]{2,3}-[A-Z]{2,4}-[A-Za-z0-9]+Neural$/;
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const JSF_BASE = 'https://www.jsflabs.io/api/v1';
const JSF_MAX_CHARS = 10000;                  // per request (JSF allows 50k; keep costs predictable)
const JSF_MAX_SAMPLE = 15 * 1024 * 1024;      // 15 MB voice sample
const JSF_VOICE_RE = /^jsf_[A-Za-z0-9_\-=]{8,200}$/;
const JSF_AUDIO_HOST = /^https:\/\/([a-z0-9-]+\.)*jsflabs\.io\//;

const DEFAULT_ORIGINS = 'https://mainsaad276-jpg.github.io,https://localhost,http://localhost,capacitor://localhost,http://localhost:8000';
function corsHeaders(origin, env, selfOrigin) {
  // The app's own homes (website, Android app, local test) are always
  // allowed; ALLOWED_ORIGINS can only add more.
  const allowed = (DEFAULT_ORIGINS + ',' + String(env.ALLOWED_ORIGINS || ''))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const ok = !!origin && (allowed.includes(origin) || origin === selfOrigin ||
    // the project's own Vercel addresses (production, git-branch and preview URLs)
    /^https:\/\/voicesync-studio(-[a-z0-9-]+)?\.vercel\.app$/.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-VS-Code, X-Admin-Key',
    'Access-Control-Expose-Headers': 'X-Chars-Remaining',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    _ok: ok,
  };
}

function json(status, body, cors) {
  const { _ok, ...h } = cors;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// rate: 0.5..2 (1 = normal). pitch: semitones -12..12.
function prosody(rate, pitch) {
  const r = Math.max(0.5, Math.min(2, Number(rate) || 1));
  const p = Math.max(-12, Math.min(12, Math.round(Number(pitch) || 0)));
  const ratePct = Math.round((r - 1) * 100);
  return {
    rate: (ratePct >= 0 ? '+' : '') + ratePct + '%',
    pitch: (p >= 0 ? '+' : '') + p + 'st',
  };
}

// ---------------- JSF Labs (voice cloning) ----------------

// ---------------- Plans: activation codes + character balance ----------------
// KV key "code:<CODE>" -> {plan, chars, used, clones, created, expires, note}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_RE = /^VS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const MAX_CLONES_PER_CODE = 20;

// Server-side plan table. Approvals take characters from here, never from
// what the app sent. Order: plans saved from the admin page (KV "plans") ->
// PLANS_JSON env -> this default. buyCost = what the plan costs you to serve
// (admin only, never sent to the app).
const DEFAULT_PLAN_TABLE = [
  { id: 'starter', name: 'Starter', chars: 1000000, price: 1500, firstMonth: 1200, buyCost: 0 },
  { id: 'plus', name: 'Plus', chars: 2000000, price: 3000, firstMonth: 2700, buyCost: 0 },
  { id: 'creator', name: 'Creator', chars: 3000000, price: 4500, firstMonth: 4200, buyCost: 0, badge: 'popular' },
  { id: 'pro', name: 'Pro', chars: 5000000, price: 7500, firstMonth: 7200, buyCost: 0 },
  { id: 'studio', name: 'Studio', chars: 10000000, price: 15000, firstMonth: 14700, buyCost: 0 },
];
const MAX_PLANS = 12, MAX_PRICE = 10000000, MAX_PLAN_CHARS = 100000000;
function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20); }
// Checks a plan list. Returns {plans} or {error}.
function validatePlans(list) {
  if (!Array.isArray(list) || !list.length) return { error: 'at least one plan is needed' };
  if (list.length > MAX_PLANS) return { error: 'at most ' + MAX_PLANS + ' plans' };
  const out = [], ids = new Set(), names = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {}, at = 'plan ' + (i + 1) + ': ';
    const name = String(p.name == null ? '' : p.name).replace(/[\u0000-\u001F<>]/g, '').trim().slice(0, 30);
    if (!name) return { error: at + 'name required' };
    if (name.toLowerCase() === 'free') return { error: at + '"Free" is reserved for the free trial' };
    const id = slug(p.id) || slug(name) || ('plan' + (i + 1));
    const num = (v) => (v === '' || v == null ? 0 : Number(v));
    const chars = num(p.chars), price = num(p.price), buyCost = num(p.buyCost);
    let firstMonth = num(p.firstMonth);
    for (const [k, v, max] of [['characters', chars, MAX_PLAN_CHARS], ['price', price, MAX_PRICE], ['first month price', firstMonth, MAX_PRICE], ['buy cost', buyCost, MAX_PRICE]]) {
      if (!Number.isFinite(v) || v < 0 || v > max || Math.floor(v) !== v) return { error: at + k + ' must be a whole number 0..' + max };
    }
    if (chars < 1000) return { error: at + 'characters must be at least 1,000' };
    if (price < 1) return { error: at + 'price required' };
    if (firstMonth > price) return { error: at + 'first month price cannot be more than the price' };
    if (!firstMonth) firstMonth = price;
    if (ids.has(id) || names.has(name.toLowerCase())) return { error: at + 'duplicate plan name' };
    ids.add(id); names.add(name.toLowerCase());
    out.push({ id, name, chars, price, firstMonth, buyCost, badge: p.badge === 'popular' ? 'popular' : '' });
  }
  return { plans: out };
}
function planTable(env) {
  if (Array.isArray(env._plans) && env._plans.length) return env._plans;
  try { const t = JSON.parse(env.PLANS_JSON || 'null'); if (Array.isArray(t) && t.length) { const v = validatePlans(t); if (v.plans) return v.plans; } } catch {}
  return DEFAULT_PLAN_TABLE;
}
function planSource(env) {
  if (Array.isArray(env._plans) && env._plans.length) return 'admin';
  return env.PLANS_JSON ? 'env' : 'default';
}
// What the app may see: no buyCost.
function publicPlans(env) {
  return planTable(env).map((p) => ({ id: p.id, name: p.name, chars: p.chars, price: p.price, firstMonth: p.firstMonth || p.price, badge: p.badge || '' }));
}

// Scrolling promo ticker at the bottom of the app (KV "ticker").
const TICKER_ACTIONS = ['none', 'link', 'share', 'plans', 'whatsapp'];
function validateTicker(body) {
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001F<>]/g, ' ').trim().slice(0, n);
  const list = Array.isArray(body.items) ? body.items : [];
  if (list.length > 12) return { error: 'at most 12 messages' };
  const items = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i] || {};
    const en = clean(m.en, 120), ur = clean(m.ur, 120), icon = clean(m.icon, 8);
    if (!en && !ur) continue;
    const action = TICKER_ACTIONS.includes(m.action) ? m.action : 'none';
    let url = clean(m.url, 300);
    if (action === 'link' || (action === 'whatsapp' && url)) {
      if (!/^https:\/\/[^\s]+$/.test(url)) return { error: 'message ' + (i + 1) + ': link must start with https://' };
    } else url = '';
    items.push({ icon, en: en || ur, ur: ur || en, action, url });
  }
  const speed = ['slow', 'normal', 'fast'].includes(body.speed) ? body.speed : 'normal';
  return { ticker: { enabled: body.enabled !== false, speed, items } };
}

// Payment accounts shown on the back of the plan cards (KV "paysettings").
const MAX_METHODS = 8;
function validatePay(body) {
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) return { error: 'WhatsApp number: 10–15 digits, like 923001234567' };
  const list = Array.isArray(body.methods) ? body.methods : [];
  if (list.length > MAX_METHODS) return { error: 'at most ' + MAX_METHODS + ' payment methods' };
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001F<>]/g, ' ').trim().slice(0, n);
  const methods = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i] || {};
    const label = m.label && typeof m.label === 'object' ? m.label : { en: m.label };
    const en = clean(label.en, 40), ur = clean(label.ur, 40), value = clean(m.value, 60), name = clean(m.name, 60);
    if (!value) continue; // a method without an account number is not shown
    if (!en && !ur) return { error: 'method ' + (i + 1) + ': name (like JazzCash) required' };
    methods.push({ label: { en: en || ur, ur: ur || en }, value, name });
  }
  return { pay: { whatsapp, methods } };
}
function findPlan(env, name) {
  const n = String(name || '').trim().toLowerCase();
  return planTable(env).find((p) => p.id === n || String(p.name).toLowerCase() === n) || null;
}

// Read many keys at once (Upstash MGET on Vercel; parallel gets on Cloudflare).
async function getMany(env, keys) {
  if (!keys.length) return [];
  if (typeof env.PRO.getMany === 'function') return env.PRO.getMany(keys);
  const out = [];
  for (let i = 0; i < keys.length; i += 50) {
    const part = await Promise.all(keys.slice(i, i + 50).map((k) => env.PRO.get(k)));
    out.push(...part);
  }
  return out;
}
async function listAll(env, prefix, limit = 5000) {
  const list = await env.PRO.list({ prefix, limit });
  return list.keys.map((k) => k.name);
}
function parseJson(raw) { try { return JSON.parse(raw); } catch { return null; } }

// Daily counters for the dashboard: stat:<name>:<YYYY-MM-DD>
async function bumpStat(env, name, n = 1) {
  if (!env.PRO || !n) return;
  const k = 'stat:' + name + ':' + new Date().toISOString().slice(0, 10);
  try {
    const cur = Number((await env.PRO.get(k)) || 0);
    await env.PRO.put(k, String(cur + n), { expirationTtl: 400 * 86400 });
  } catch {}
}
function dayKeys(days) {
  const out = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) out.push(new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10));
  return out;
}

function normCode(c) { return String(c || '').trim().toUpperCase().replace(/\s+/g, ''); }
function remainingOf(rec) { return Math.max(0, (rec.chars | 0) - (rec.used | 0)); }

function newCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3 || i === 7) out += '-';
  }
  return 'VS-' + out;
}

async function loadCode(env, code) {
  if (!env.PRO || !CODE_RE.test(code)) return null;
  const raw = await env.PRO.get('code:' + code);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function saveCode(env, code, rec) {
  if (env.PRO) await env.PRO.put('code:' + code, JSON.stringify(rec));
}

function publicStatus(code, rec) {
  const expired = rec.expires && Date.now() > rec.expires;
  return {
    valid: !expired && remainingOf(rec) > 0,
    expired: !!expired,
    code,
    plan: rec.plan || '',
    chars: rec.chars | 0,
    used: rec.used | 0,
    remaining: remainingOf(rec),
    expires: rec.expires || null,
  };
}

async function requireCode(request, env, cors) {
  if (!env.PRO) return { error: json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors) };
  const code = normCode(request.headers.get('X-VS-Code'));
  if (!code) return { error: json(402, { error: 'HD voices need an active plan', code: 'NEED_PLAN' }, cors) };
  const rec = await loadCode(env, code);
  if (!rec) return { error: json(402, { error: 'activation code not found', code: 'BAD_CODE' }, cors) };
  if (rec.expires && Date.now() > rec.expires) return { error: json(402, { error: 'your plan has expired', code: 'EXPIRED' }, cors) };
  if (remainingOf(rec) <= 0) return { error: json(402, { error: 'no characters left in your plan', code: 'PLAN_BALANCE', remaining: 0 }, cors) };
  if (new URL(request.url).pathname === '/jsf/clone' && (rec.clones | 0) >= MAX_CLONES_PER_CODE) {
    return { error: json(402, { error: 'clone limit reached for this plan', code: 'CLONE_LIMIT' }, cors) };
  }
  rec.lastSeen = Date.now();
  noteClient(rec, request);
  return { code, rec };
}

async function proStatus(request, env, cors) {
  if (!env.PRO) return json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const code = normCode(body.code);
  const rec = await loadCode(env, code);
  if (!rec) return json(404, { valid: false, error: 'activation code not found' }, cors);
  if (!rec.lastSeen || Date.now() - rec.lastSeen > 10 * 60000 || (!rec.os && !rec.via)) { rec.lastSeen = Date.now(); noteClient(rec, request); await saveCode(env, code, rec); }
  return json(200, publicStatus(code, rec), cors);
}

function sameKey(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------------- API settings saved from the admin page ----------------
// KV "settings" -> {jsfKey, azureKey, azureRegion}. A real Worker secret /
// environment variable always wins over a saved value.
let _settingsCache = null, _settingsAt = 0;
async function loadSettings(env) {
  if (!env.PRO) return {};
  if (_settingsCache && Date.now() - _settingsAt < 30000) return _settingsCache;
  let st = {};
  let raws = [];
  try { raws = await getMany(env, ['settings', 'plans', 'paysettings', 'ticker']); } catch { raws = []; }
  st = parseJson(raws[0]) || {};
  Object.defineProperty(st, '_plans', { value: parseJson(raws[1]), enumerable: false });
  Object.defineProperty(st, '_pay', { value: parseJson(raws[2]), enumerable: false });
  Object.defineProperty(st, '_ticker', { value: parseJson(raws[3]), enumerable: false });
  _settingsCache = st; _settingsAt = Date.now();
  return st;
}
function dropSettingsCache() { _settingsCache = null; _settingsAt = 0; }
async function withSettings(env) {
  const st = await loadSettings(env);
  return {
    ...env,
    _secretJsf: !!env.JSF_API_KEY,
    _secretAzure: !!env.AZURE_SPEECH_KEY,
    JSF_API_KEY: env.JSF_API_KEY || st.jsfKey || '',
    AZURE_SPEECH_KEY: env.AZURE_SPEECH_KEY || st.azureKey || '',
    AZURE_SPEECH_REGION: env.AZURE_SPEECH_REGION || st.azureRegion || '',
    _plans: Array.isArray(st._plans) ? st._plans : null,
    _pay: st._pay && typeof st._pay === 'object' ? st._pay : null,
    _ticker: st._ticker && typeof st._ticker === 'object' ? st._ticker : null,
  };
}
function hint(k) { k = String(k || ''); return k ? k.slice(0, 4) + '\u2026' + k.slice(-4) : ''; }

function randomId(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || 'unknown';
}
// Where a user comes from, for the admin Users list (no IP is stored).
function clientInfo(request) {
  const h = (n) => request.headers.get(n) || '';
  const origin = h('Origin'), ua = h('User-Agent');
  let via = '';
  if (/^(capacitor|https?):\/\/localhost(:\d+)?$/.test(origin) || /; wv\)/.test(ua)) via = 'app';
  else if (/github\.io$/.test(origin)) via = 'web-github';
  else if (/vercel\.app$/.test(origin)) via = 'web-vercel';
  else if (origin) via = 'web';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  let city = h('X-Vercel-IP-City') || '';
  try { city = decodeURIComponent(city); } catch { /* keep raw */ }
  return { via, os, country: (h('X-Vercel-IP-Country') || h('CF-IPCountry')).slice(0, 2).toUpperCase().replace('XX', ''), city: cleanStr(city, 40) };
}
function noteClient(rec, request) {
  const c = clientInfo(request);
  for (const k of ['via', 'os', 'country', 'city']) if (c[k]) rec[k] = c[k];
}
function today() { return new Date().toISOString().slice(0, 10); }
async function bumpDaily(env, key, max) {
  const k = key + ':' + today();
  const n = Number((await env.PRO.get(k)) || 0);
  if (n >= max) return false;
  await env.PRO.put(k, String(n + 1), { expirationTtl: 172800 });
  return true;
}

async function createCode(env, { plan, chars, days, note, source, device, name, phone, paid, reqId }) {
  let code = newCode();
  for (let i = 0; i < 3 && (await env.PRO.get('code:' + code)); i++) code = newCode();
  const now = Date.now();
  const rec = {
    plan: String(plan || 'Custom').slice(0, 40),
    chars, used: 0, clones: 0, created: now,
    expires: days ? now + days * 86400000 : null,
    note: String(note || '').slice(0, 120),
    source: source || 'manual',
    device: device || '', name: name || '', phone: phone || '',
    paid: Math.max(0, Math.floor(Number(paid) || 0)), reqId: reqId || '',
    lastSeen: null,
  };
  await saveCode(env, code, rec);
  return { code, rec };
}

// Free trial: one per device (and at most a few per network per day).
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|vercel|facebookexternalhit|whatsapp\/|curl|wget|python-requests|node-fetch|axios/i;
async function proTrial(request, env, cors) {
  if (!env.PRO) return json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const device = String(body.device || '');
  if (!DEVICE_RE.test(device)) return json(400, { error: 'bad device id' }, cors);
  // Crawlers and page-preview bots open the site too; they get no trial (and no user row).
  if (BOT_RE.test(request.headers.get('User-Agent') || '')) return json(403, { error: 'no trial for bots', code: 'BOT' }, cors);
  const existing = await env.PRO.get('trial:' + device);
  if (existing) {
    const rec = await loadCode(env, existing);
    if (rec) { rec.lastSeen = Date.now(); noteClient(rec, request); await saveCode(env, existing, rec); return json(200, publicStatus(existing, rec), cors); }
  }
  if (!(await bumpDaily(env, 'trialip:' + clientIp(request), Number(env.TRIALS_PER_IP_PER_DAY) || 3))) {
    return json(429, { error: 'free trial limit reached on this network today', code: 'TRIAL_LIMIT' }, cors);
  }
  const chars = Math.max(0, Math.floor(Number(env.FREE_TRIAL_CHARS) || 10000));
  const { code, rec } = await createCode(env, { plan: 'Free', chars, days: 0, note: 'free trial', source: 'trial', device });
  rec.lastSeen = Date.now(); noteClient(rec, request); await saveCode(env, code, rec);
  await env.PRO.put('trial:' + device, code);
  await bumpStat(env, 'new');
  return json(200, publicStatus(code, rec), cors);
}

// Subscription requests (customer -> admin -> approve -> code).
const MAX_SHOT = 450 * 1024; // data URL size cap for the payment screenshot
function cleanStr(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n); }
async function proRequest(request, env, cors) {
  if (!env.PRO) return json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const name = cleanStr(body.name, 60);
  const phone = String(body.phone || '').replace(/[^0-9+]/g, '').slice(0, 16);
  const plan = cleanStr(body.plan, 40);
  const chars = Math.floor(Number(body.chars) || 0);
  const price = Math.floor(Number(body.price) || 0);
  const method = cleanStr(body.method, 40);
  const tid = cleanStr(body.tid, 60);
  const shot = typeof body.screenshot === 'string' ? body.screenshot : '';
  if (name.length < 2) return json(400, { error: 'name required', field: 'name' }, cors);
  if (phone.replace(/\D/g, '').length < 10) return json(400, { error: 'WhatsApp number required', field: 'phone' }, cors);
  if (!plan || chars < 1) return json(400, { error: 'plan required', field: 'plan' }, cors);
  if (!tid && !shot) return json(400, { error: 'transaction ID or screenshot required', field: 'tid' }, cors);
  if (shot && (shot.length > MAX_SHOT || !/^data:image\/(jpeg|png|webp);base64,/.test(shot))) {
    return json(413, { error: 'screenshot too large or not an image', field: 'screenshot' }, cors);
  }
  if (!(await bumpDaily(env, 'reqip:' + clientIp(request), Number(env.REQUESTS_PER_IP_PER_DAY) || 10))) {
    return json(429, { error: 'too many requests today, try tomorrow or message us on WhatsApp' }, cors);
  }
  const id = 'R' + randomId(8);
  const secret = randomId(24);
  const known = findPlan(env, plan);
  const expectChars = known ? known.chars : chars;
  const okPrices = known ? [known.price, known.firstMonth].filter(Boolean) : [price];
  const rec = {
    id, secret, status: 'pending', created: Date.now(),
    name, phone, plan: known ? known.name : plan, method, tid,
    chars: expectChars, price, claimedChars: chars,
    knownPlan: !!known, expectedPrices: okPrices,
    mismatch: !known || chars !== expectChars || !okPrices.includes(price),
    device: DEVICE_RE.test(String(body.device || '')) ? String(body.device) : '',
    hasShot: !!shot,
  };
  await env.PRO.put('req:' + id, JSON.stringify(rec));
  if (shot) await env.PRO.put('reqimg:' + id, shot);
  return json(200, { id, secret, status: 'pending' }, cors);
}
async function loadReq(env, id) {
  if (!/^R[A-Z2-9]{8}$/.test(String(id || ''))) return null;
  try { return JSON.parse((await env.PRO.get('req:' + id)) || 'null'); } catch { return null; }
}
async function proRequestStatus(request, env, cors) {
  if (!env.PRO) return json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const rec = await loadReq(env, String(body.id || '').toUpperCase());
  if (!rec || !sameKey(body.secret, rec.secret)) return json(404, { error: 'request not found' }, cors);
  const out = { id: rec.id, status: rec.status, plan: rec.plan, chars: rec.chars };
  if (rec.status === 'approved') out.code = rec.code;
  if (rec.status === 'rejected') out.reason = rec.reason || '';
  return json(200, out, cors);
}

const ADMIN_MAX_FAILS = 5;
function userRow(code, rec) {
  return {
    ...publicStatus(code, rec), note: rec.note || '', created: rec.created || null, clones: rec.clones | 0,
    source: rec.source || (rec.plan === 'Free' ? 'trial' : 'manual'), lastSeen: rec.lastSeen || null,
    device: rec.device ? rec.device.slice(0, 8) : '', name: rec.name || '', phone: rec.phone || '', paid: rec.paid | 0,
    via: rec.via || '', os: rec.os || '', country: rec.country || '', city: rec.city || '',
  };
}
async function allCodes(env) {
  const keys = await listAll(env, 'code:');
  const raws = await getMany(env, keys);
  const out = [];
  keys.forEach((k, i) => { const rec = parseJson(raws[i]); if (rec) out.push(userRow(k.slice(5), rec)); });
  return out;
}
async function allRequests(env) {
  const keys = await listAll(env, 'req:', 2000);
  const raws = await getMany(env, keys);
  const out = [];
  keys.forEach((k, i) => { const rec = parseJson(raws[i]); if (rec) { const { secret, ...pub } = rec; out.push(pub); } });
  return out;
}
async function overview(env) {
  const [users, reqs] = await Promise.all([allCodes(env), allRequests(env)]);
  const now = Date.now(), H = 3600000, D = 24 * H;
  const seen = (u) => u.lastSeen || u.created || 0;
  const paid = users.filter((u) => u.plan !== 'Free');
  const approved = reqs.filter((r) => r.status === 'approved');
  const month = new Date().toISOString().slice(0, 7);
  const plans = {};
  const blank = (name) => ({ plan: name, chars: 0, price: 0, firstMonth: 0, buyCost: 0, profit: 0, users: 0, active: 0, sales: 0, revenue: 0, cost: 0, earned: 0 });
  for (const p of planTable(env)) plans[p.name] = { ...blank(p.name), chars: p.chars, price: p.price, firstMonth: p.firstMonth || p.price, buyCost: p.buyCost | 0, profit: p.price - (p.buyCost | 0) };
  plans.Free = { ...blank('Free'), chars: Number(env.FREE_TRIAL_CHARS) || 10000 };
  for (const u of users) {
    const b = plans[u.plan] || (plans[u.plan] = blank(u.plan));
    b.users++; if (u.valid) b.active++;
  }
  const costOf = (r) => (r.buyCost != null ? r.buyCost | 0 : ((plans[r.plan] && plans[r.plan].buyCost) | 0));
  for (const r of approved) {
    const b = plans[r.plan] || (plans[r.plan] = blank(r.plan));
    b.sales++; b.revenue += r.price | 0; b.cost += costOf(r); b.earned = b.revenue - b.cost;
  }
  const inMonth = (r) => new Date(r.decided || r.created).toISOString().slice(0, 7) === month;
  const days = dayKeys(30);
  const statNames = ['new', 'chars', 'tts', 'paid', 'revenue'];
  const statKeys = [];
  for (const n of statNames) for (const d of days) statKeys.push('stat:' + n + ':' + d);
  const vals = await getMany(env, statKeys);
  const series = {};
  statNames.forEach((n, i) => { series[n] = days.map((d, j) => Number(vals[i * days.length + j] || 0)); });
  return {
    generated: now,
    users: {
      total: users.length, free: users.length - paid.length, paid: paid.length,
      paidActive: paid.filter((u) => u.valid).length,
      active24h: users.filter((u) => now - seen(u) < D).length,
      active7d: users.filter((u) => now - seen(u) < 7 * D).length,
      active30d: users.filter((u) => now - seen(u) < 30 * D).length,
      expiringSoon: paid.filter((u) => u.expires && u.expires > now && u.expires - now < 5 * D).length,
    },
    chars: { used: users.reduce((s, u) => s + u.used, 0), usedPaid: paid.reduce((s, u) => s + u.used, 0), remaining: users.reduce((s, u) => s + u.remaining, 0) },
    revenue: {
      total: approved.reduce((s, r) => s + (r.price | 0), 0),
      thisMonth: approved.filter(inMonth).reduce((s, r) => s + (r.price | 0), 0),
      payments: approved.length,
      cost: approved.reduce((s, r) => s + costOf(r), 0),
      costThisMonth: approved.filter(inMonth).reduce((s, r) => s + costOf(r), 0),
      profit: approved.reduce((s, r) => s + (r.price | 0) - costOf(r), 0),
      profitThisMonth: approved.filter(inMonth).reduce((s, r) => s + (r.price | 0) - costOf(r), 0),
    },
    requests: { pending: reqs.filter((r) => r.status === 'pending').length, approved: approved.length, rejected: reqs.filter((r) => r.status === 'rejected').length },
    plans: Object.values(plans).sort((a, b) => (a.price || 0) - (b.price || 0)),
    series: { days, ...series },
  };
}

async function admin(request, env, cors, url) {
  if (!env.ADMIN_KEY) return json(503, { error: 'admin key not set on the Worker' }, cors);
  const failKey = 'adminfail:' + clientIp(request);
  if (env.PRO) {
    const fails = Number((await env.PRO.get(failKey)) || 0);
    if (fails >= ADMIN_MAX_FAILS) return json(429, { error: 'too many wrong admin keys — wait 15 minutes', code: 'ADMIN_LOCKED' }, cors);
  }
  if (!sameKey(request.headers.get('X-Admin-Key'), env.ADMIN_KEY)) {
    if (env.PRO) {
      const fails = Number((await env.PRO.get(failKey)) || 0) + 1;
      await env.PRO.put(failKey, String(fails), { expirationTtl: 900 });
    }
    return json(401, { error: 'wrong admin key' }, cors);
  }
  if (!env.PRO) return json(503, { error: 'plans storage (KV) not set up' }, cors);

  if (url.pathname === '/admin/overview' && request.method === 'GET') {
    return json(200, await overview(env), cors);
  }
  if ((url.pathname === '/admin/codes' || url.pathname === '/admin/users') && request.method === 'GET') {
    const out = await allCodes(env);
    out.sort((a, b) => (b.lastSeen || b.created || 0) - (a.lastSeen || a.created || 0));
    return json(200, { codes: out, users: out }, cors);
  }
  if (url.pathname === '/admin/plans' && request.method === 'GET') {
    return json(200, { plans: planTable(env), source: planSource(env), defaults: DEFAULT_PLAN_TABLE, freeTrialChars: Number(env.FREE_TRIAL_CHARS) || 10000 }, cors);
  }
  if (url.pathname === '/admin/ticker' && request.method === 'GET') {
    return json(200, { ...(env._ticker || { enabled: true, speed: 'normal', items: [] }), saved: !!env._ticker }, cors);
  }
  if (url.pathname === '/admin/paysettings' && request.method === 'GET') {
    return json(200, { ...(env._pay || { whatsapp: '', methods: [] }), saved: !!env._pay }, cors);
  }

  if (url.pathname === '/admin/requests' && request.method === 'GET') {
    const out = await allRequests(env);
    out.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.created - a.created);
    return json(200, { requests: out }, cors);
  }
  if (url.pathname === '/admin/requests/image' && request.method === 'GET') {
    const id = String(url.searchParams.get('id') || '');
    if (!/^R[A-Z2-9]{8}$/.test(id)) return json(400, { error: 'bad id' }, cors);
    return json(200, { image: (await env.PRO.get('reqimg:' + id)) || '' }, cors);
  }
  if (url.pathname === '/admin/settings' && request.method === 'GET') {
    const st = await loadSettings(env);
    return json(200, {
      jsfKeySet: !!(env.JSF_API_KEY || st.jsfKey), jsfFromSecret: !!env._secretJsf, jsfHint: hint(st.jsfKey),
      azureKeySet: !!(env.AZURE_SPEECH_KEY || st.azureKey), azureFromSecret: !!env._secretAzure, azureHint: hint(st.azureKey),
      azureRegion: env.AZURE_SPEECH_REGION || st.azureRegion || '',
    }, cors);
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const chars = Math.floor(Number(body.chars) || 0);
  const days = Math.floor(Number(body.days) || 0);
  if (chars < 0 || chars > 100000000) return json(400, { error: 'chars must be 0..100,000,000' }, cors);
  if (days < 0 || days > 3660) return json(400, { error: 'days must be 0..3660' }, cors);

  if (url.pathname === '/admin/settings' && request.method === 'POST') {
    const st = { ...(await loadSettings(env)) };
    const clear = Array.isArray(body.clear) ? body.clear : [];
    if (typeof body.jsfKey === 'string' && body.jsfKey.trim()) {
      if (!/^jsf_[A-Za-z0-9_-]{8,200}$/.test(body.jsfKey.trim())) return json(400, { error: 'JSF key should start with jsf_' }, cors);
      st.jsfKey = body.jsfKey.trim();
    }
    if (typeof body.azureKey === 'string' && body.azureKey.trim()) st.azureKey = body.azureKey.trim().slice(0, 200);
    if (typeof body.azureRegion === 'string' && body.azureRegion.trim()) {
      if (!/^[a-z0-9]{3,30}$/.test(body.azureRegion.trim())) return json(400, { error: 'region like centralindia' }, cors);
      st.azureRegion = body.azureRegion.trim();
    }
    for (const k of clear) if (['jsfKey', 'azureKey', 'azureRegion'].includes(k)) delete st[k];
    await env.PRO.put('settings', JSON.stringify(st));
    dropSettingsCache();
    return json(200, { ok: true, jsfKeySet: !!(env.JSF_API_KEY || st.jsfKey), azureKeySet: !!(env.AZURE_SPEECH_KEY || st.azureKey), azureRegion: env.AZURE_SPEECH_REGION || st.azureRegion || '' }, cors);
  }

  if (url.pathname === '/admin/plans' && request.method === 'POST') {
    if (body.reset === true) {
      await env.PRO.put('plans', 'null'); dropSettingsCache();
      return json(200, { ok: true, plans: DEFAULT_PLAN_TABLE, source: env.PLANS_JSON ? 'env' : 'default' }, cors);
    }
    const v = validatePlans(body.plans);
    if (v.error) return json(400, { error: v.error }, cors);
    await env.PRO.put('plans', JSON.stringify(v.plans)); dropSettingsCache();
    return json(200, { ok: true, plans: v.plans, source: 'admin' }, cors);
  }
  if (url.pathname === '/admin/ticker' && request.method === 'POST') {
    if (body.reset === true) { await env.PRO.put('ticker', 'null'); dropSettingsCache(); return json(200, { ok: true, saved: false }, cors); }
    const v = validateTicker(body);
    if (v.error) return json(400, { error: v.error }, cors);
    await env.PRO.put('ticker', JSON.stringify(v.ticker)); dropSettingsCache();
    return json(200, { ok: true, ...v.ticker, saved: true }, cors);
  }
  if (url.pathname === '/admin/paysettings' && request.method === 'POST') {
    const v = validatePay(body);
    if (v.error) return json(400, { error: v.error }, cors);
    await env.PRO.put('paysettings', JSON.stringify(v.pay)); dropSettingsCache();
    return json(200, { ok: true, ...v.pay, saved: true }, cors);
  }

  if (url.pathname === '/admin/requests/approve' && request.method === 'POST') {
    const rec = await loadReq(env, body.id);
    if (!rec) return json(404, { error: 'request not found' }, cors);
    if (rec.status === 'approved') return json(409, { error: 'already approved', code: rec.code }, cors);
    const known = findPlan(env, body.plan || rec.plan);
    const grant = chars || (known ? known.chars : rec.chars);
    const c = await createCode(env, {
      plan: known ? known.name : (body.plan || rec.plan), chars: grant, days: days || 30,
      note: (rec.method || '') + (rec.tid ? ' TID ' + rec.tid : ''),
      source: 'request', name: rec.name, phone: rec.phone, device: rec.device, paid: rec.price, reqId: rec.id,
    });
    rec.status = 'approved'; rec.code = c.code; rec.decided = Date.now(); rec.grantedChars = grant;
    rec.buyCost = known ? (known.buyCost | 0) : 0;
    await env.PRO.put('req:' + rec.id, JSON.stringify(rec));
    await bumpStat(env, 'paid'); await bumpStat(env, 'revenue', rec.price | 0);
    const { secret, ...pub } = rec;
    return json(200, { request: pub, ...publicStatus(c.code, c.rec) }, cors);
  }
  if (url.pathname === '/admin/requests/reject' && request.method === 'POST') {
    const rec = await loadReq(env, body.id);
    if (!rec) return json(404, { error: 'request not found' }, cors);
    rec.status = 'rejected'; rec.reason = cleanStr(body.reason, 160); rec.decided = Date.now();
    await env.PRO.put('req:' + rec.id, JSON.stringify(rec));
    const { secret, ...pub } = rec;
    return json(200, { request: pub }, cors);
  }

  if (url.pathname === '/admin/codes' && request.method === 'POST') {
    if (chars < 1) return json(400, { error: 'chars required' }, cors);
    const { code, rec } = await createCode(env, {
      plan: body.plan, chars, days, note: body.note, source: 'manual',
      name: cleanStr(body.name, 60), phone: String(body.phone || '').replace(/[^0-9+]/g, '').slice(0, 16), paid: body.paid,
    });
    if (rec.paid) { await bumpStat(env, 'paid'); await bumpStat(env, 'revenue', rec.paid); }
    return json(200, { ...publicStatus(code, rec), note: rec.note }, cors);
  }

  if (url.pathname === '/admin/user' && request.method === 'POST') {
    const code = normCode(body.code);
    const rec = await loadCode(env, code);
    if (!rec) return json(404, { error: 'code not found' }, cors);
    if (body.name != null) rec.name = cleanStr(body.name, 60);
    if (body.phone != null) rec.phone = String(body.phone).replace(/[^0-9+]/g, '').slice(0, 16);
    if (body.note != null) rec.note = cleanStr(body.note, 120);
    await saveCode(env, code, rec);
    return json(200, userRow(code, rec), cors);
  }
  if (url.pathname === '/admin/topup' && request.method === 'POST') {
    const code = normCode(body.code);
    const rec = await loadCode(env, code);
    if (!rec) return json(404, { error: 'code not found' }, cors);
    rec.chars = (rec.chars | 0) + chars;
    if (days) {
      const base = rec.expires && rec.expires > Date.now() ? rec.expires : Date.now();
      rec.expires = base + days * 86400000;
    }
    if (body.plan) rec.plan = String(body.plan).slice(0, 40);
    await saveCode(env, code, rec);
    return json(200, { ...publicStatus(code, rec), note: rec.note || '' }, cors);
  }

  return json(404, { error: 'not found' }, cors);
}

async function jsfError(res, cors) {
  let j = {};
  try { j = await res.json(); } catch { j = {}; }
  const e = (j && j.error) || {};
  const status = res.status === 402 || res.status === 429 || res.status === 422 || res.status === 413 ? res.status : 502;
  return json(status, { error: e.message || 'cloning service error', code: e.code || null, status: res.status }, cors);
}

async function jsfClone(request, env, cors, acct) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > JSF_MAX_SAMPLE + 64 * 1024) return json(413, { error: 'sample too large (max 15 MB)' }, cors);
  let form;
  try { form = await request.formData(); } catch { return json(400, { error: 'send multipart/form-data' }, cors); }
  const audio = form.get('audio');
  const name = String(form.get('name') || '').trim().slice(0, 80);
  if (!audio || typeof audio === 'string') return json(400, { error: 'audio file missing' }, cors);
  if (audio.size > JSF_MAX_SAMPLE) return json(413, { error: 'sample too large (max 15 MB)' }, cors);
  if (name.length < 2) return json(400, { error: 'name must be 2-80 characters' }, cors);
  const gender = ['Male', 'Female', 'Neutral', 'Unspecified'].includes(String(form.get('gender')))
    ? String(form.get('gender')) : 'Unspecified';
  const language = /^[a-z]{2}$/.test(String(form.get('language') || '')) ? String(form.get('language')) : 'en';

  const out = new FormData();
  out.append('audio', audio, audio.name || 'sample.wav');
  out.append('name', name);
  out.append('gender', gender);
  out.append('language', language);
  const res = await fetch(JSF_BASE + '/voice-clone', {
    method: 'POST',
    headers: { 'x-api-key': env.JSF_API_KEY },
    body: out,
  });
  if (!res.ok) return jsfError(res, cors);
  const j = await res.json();
  const d = (j && j.data) || {};
  if (!JSF_VOICE_RE.test(String(d.voiceId || ''))) return json(502, { error: 'cloning service returned no voice' }, cors);
  if (acct && acct.rec) {
    acct.rec.clones = (acct.rec.clones | 0) + 1;
    await saveCode(env, acct.code, acct.rec);
  }
  return json(200, {
    voiceId: d.voiceId, name: d.name || name, language: d.language || language, gender: d.gender || gender,
    remaining: j.credits ? j.credits.remaining : null,
  }, cors);
}

async function jsfTts(request, env, cors, acct) {
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const text = String(body.text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  const voiceId = String(body.voice_id || '');
  if (!text) return json(400, { error: 'empty text' }, cors);
  if (text.length > JSF_MAX_CHARS) return json(413, { error: 'text too long (max ' + JSF_MAX_CHARS + ')' }, cors);
  if (!JSF_VOICE_RE.test(voiceId)) return json(400, { error: 'bad voice' }, cors);
  const speed = Math.max(0.5, Math.min(2, Number(body.speed) || 1));
  if (acct && acct.rec && remainingOf(acct.rec) < text.length) {
    return json(402, { error: 'not enough characters left in your plan', code: 'PLAN_BALANCE', remaining: remainingOf(acct.rec) }, cors);
  }

  const res = await fetch(JSF_BASE + '/text-to-speech', {
    method: 'POST',
    headers: { 'x-api-key': env.JSF_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId, speed }),
  });
  if (!res.ok) return jsfError(res, cors);
  const j = await res.json();
  const audioUrl = j && j.data && j.data.audio_url;
  if (!audioUrl || !JSF_AUDIO_HOST.test(audioUrl)) return json(502, { error: 'cloning service returned no audio' }, cors);

  // Fetch the hosted WAV here so the app gets the bytes directly (no CORS issues).
  const audio = await fetch(audioUrl);
  if (!audio.ok) return json(502, { error: 'could not download audio', status: audio.status }, cors);
  // Charge the plan only after JSF produced the audio.
  let remaining = j.credits && j.credits.remaining != null ? j.credits.remaining : '';
  if (acct && acct.rec) {
    acct.rec.used = (acct.rec.used | 0) + text.length;
    await saveCode(env, acct.code, acct.rec);
    remaining = remainingOf(acct.rec);
  }
  await bumpStat(env, 'chars', text.length); await bumpStat(env, 'tts');
  const { _ok, ...h } = cors;
  return new Response(audio.body, {
    status: 200,
    headers: {
      ...h,
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store',
      'X-Chars-Remaining': String(remaining),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env, url.origin);
    const { _ok, ...corsOut } = cors;
    env = await withSettings(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: _ok ? 204 : 403, headers: corsOut });
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(200, {
        ok: true, region: env.AZURE_SPEECH_REGION || null, keySet: !!env.AZURE_SPEECH_KEY,
        jsfKeySet: !!env.JSF_API_KEY, plansReady: !!env.PRO, adminKeySet: !!env.ADMIN_KEY,
      }, cors);
    }
    // Admin (code management) — protected by ADMIN_KEY, any allowed origin.
    if (url.pathname.startsWith('/admin/')) {
      if (origin && !_ok) return json(403, { error: 'origin not allowed' }, cors); // no Origin = same-site GET or non-browser
      return admin(request, env, cors, url);
    }

    // Public plan list + payment accounts for the app (never buyCost).
    if (request.method === 'GET' && url.pathname === '/pro/plans') {
      if (origin && !_ok) return json(403, { error: 'origin not allowed' }, cors);
      const pay = env._pay && (env._pay.whatsapp || (env._pay.methods || []).length) ? env._pay : null;
      return json(200, { plans: publicPlans(env), source: planSource(env), freeTrialChars: Number(env.FREE_TRIAL_CHARS) || 10000, payment: pay, ticker: env._ticker || null }, cors);
    }

    const isJsf = url.pathname === '/jsf/clone' || url.pathname === '/jsf/tts';
    const PRO_ROUTES = { '/pro/status': proStatus, '/pro/trial': proTrial, '/pro/request': proRequest, '/pro/request/status': proRequestStatus };
    const isPro = !!PRO_ROUTES[url.pathname];
    if (request.method !== 'POST' || (url.pathname !== '/tts' && !isJsf && !isPro)) {
      return json(404, { error: 'not found' }, cors);
    }
    if (origin && !_ok) return json(403, { error: 'origin not allowed' }, cors); // no Origin = same-site GET or non-browser

    if (isJsf || isPro) {
      if (env.RATE_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) return json(429, { error: 'too many requests, try again in a minute' }, cors);
      }
      if (isPro) return PRO_ROUTES[url.pathname](request, env, cors);
      if (!env.JSF_API_KEY) return json(500, { error: 'cloning service not configured' }, cors);
      const acct = await requireCode(request, env, cors);
      if (acct.error) return acct.error;
      return url.pathname === '/jsf/clone'
        ? jsfClone(request, env, cors, acct)
        : jsfTts(request, env, cors, acct);
    }
    if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
      return json(500, { error: 'voice service not configured' }, cors);
    }

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json(429, { error: 'too many requests, try again in a minute' }, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
    const text = String(body.text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    const voice = String(body.voice || '');
    if (!text) return json(400, { error: 'empty text' }, cors);
    if (text.length > MAX_CHARS) return json(413, { error: 'text too long (max ' + MAX_CHARS + ')' }, cors);
    if (!VOICE_RE.test(voice)) return json(400, { error: 'bad voice' }, cors);

    const lang = voice.split('-').slice(0, 2).join('-');
    const pr = prosody(body.rate, body.pitch);
    const ssml =
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
      `<voice name='${voice}'><prosody rate='${pr.rate}' pitch='${pr.pitch}'>${escapeXml(text)}</prosody></voice></speak>`;

    const azure = await fetch(
      `https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          'User-Agent': 'voicesync-studio-proxy',
        },
        body: ssml,
      }
    );

    if (!azure.ok) {
      // 429 = free monthly quota used up (F0) or Azure throttling.
      const status = azure.status === 429 ? 429 : 502;
      return json(status, { error: 'voice service error', status: azure.status }, cors);
    }

    return new Response(azure.body, {
      status: 200,
      headers: { ...corsOut, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  },
};
