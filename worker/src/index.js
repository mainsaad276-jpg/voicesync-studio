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
  const ok = !!origin && (allowed.includes(origin) || origin === selfOrigin);
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
  return { code, rec };
}

async function proStatus(request, env, cors) {
  if (!env.PRO) return json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const code = normCode(body.code);
  const rec = await loadCode(env, code);
  if (!rec) return json(404, { valid: false, error: 'activation code not found' }, cors);
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
  try { st = JSON.parse((await env.PRO.get('settings')) || '{}') || {}; } catch { st = {}; }
  _settingsCache = st; _settingsAt = Date.now();
  return st;
}
async function withSettings(env) {
  const st = await loadSettings(env);
  return {
    ...env,
    _secretJsf: !!env.JSF_API_KEY,
    _secretAzure: !!env.AZURE_SPEECH_KEY,
    JSF_API_KEY: env.JSF_API_KEY || st.jsfKey || '',
    AZURE_SPEECH_KEY: env.AZURE_SPEECH_KEY || st.azureKey || '',
    AZURE_SPEECH_REGION: env.AZURE_SPEECH_REGION || st.azureRegion || '',
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
function today() { return new Date().toISOString().slice(0, 10); }
async function bumpDaily(env, key, max) {
  const k = key + ':' + today();
  const n = Number((await env.PRO.get(k)) || 0);
  if (n >= max) return false;
  await env.PRO.put(k, String(n + 1), { expirationTtl: 172800 });
  return true;
}

async function createCode(env, { plan, chars, days, note }) {
  let code = newCode();
  for (let i = 0; i < 3 && (await env.PRO.get('code:' + code)); i++) code = newCode();
  const now = Date.now();
  const rec = {
    plan: String(plan || 'Custom').slice(0, 40),
    chars, used: 0, clones: 0, created: now,
    expires: days ? now + days * 86400000 : null,
    note: String(note || '').slice(0, 120),
  };
  await saveCode(env, code, rec);
  return { code, rec };
}

// Free trial: one per device (and at most a few per network per day).
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;
async function proTrial(request, env, cors) {
  if (!env.PRO) return json(503, { error: 'plans are not set up yet', code: 'PLANS_OFF' }, cors);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const device = String(body.device || '');
  if (!DEVICE_RE.test(device)) return json(400, { error: 'bad device id' }, cors);
  const existing = await env.PRO.get('trial:' + device);
  if (existing) {
    const rec = await loadCode(env, existing);
    if (rec) return json(200, publicStatus(existing, rec), cors);
  }
  if (!(await bumpDaily(env, 'trialip:' + clientIp(request), Number(env.TRIALS_PER_IP_PER_DAY) || 3))) {
    return json(429, { error: 'free trial limit reached on this network today', code: 'TRIAL_LIMIT' }, cors);
  }
  const chars = Math.max(0, Math.floor(Number(env.FREE_TRIAL_CHARS) || 10000));
  const { code, rec } = await createCode(env, { plan: 'Free', chars, days: 0, note: 'free trial ' + device.slice(0, 8) });
  await env.PRO.put('trial:' + device, code);
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
  const rec = {
    id, secret, status: 'pending', created: Date.now(),
    name, phone, plan, chars, price, method, tid,
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

async function admin(request, env, cors, url) {
  if (!env.ADMIN_KEY) return json(503, { error: 'admin key not set on the Worker' }, cors);
  if (!sameKey(request.headers.get('X-Admin-Key'), env.ADMIN_KEY)) return json(401, { error: 'wrong admin key' }, cors);
  if (!env.PRO) return json(503, { error: 'plans storage (KV) not set up' }, cors);

  if (url.pathname === '/admin/codes' && request.method === 'GET') {
    const list = await env.PRO.list({ prefix: 'code:', limit: 200 });
    const out = [];
    for (const k of list.keys) {
      const code = k.name.slice(5);
      const rec = await loadCode(env, code);
      if (rec) out.push({ ...publicStatus(code, rec), note: rec.note || '', created: rec.created || null, clones: rec.clones | 0 });
    }
    out.sort((a, b) => (b.created || 0) - (a.created || 0));
    return json(200, { codes: out }, cors);
  }

  if (url.pathname === '/admin/requests' && request.method === 'GET') {
    const list = await env.PRO.list({ prefix: 'req:', limit: 500 });
    const out = [];
    for (const k of list.keys) {
      const rec = await loadReq(env, k.name.slice(4));
      if (rec) { const { secret, ...pub } = rec; out.push(pub); }
    }
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
    _settingsCache = st; _settingsAt = Date.now();
    return json(200, { ok: true, jsfKeySet: !!(env.JSF_API_KEY || st.jsfKey), azureKeySet: !!(env.AZURE_SPEECH_KEY || st.azureKey), azureRegion: env.AZURE_SPEECH_REGION || st.azureRegion || '' }, cors);
  }

  if (url.pathname === '/admin/requests/approve' && request.method === 'POST') {
    const rec = await loadReq(env, body.id);
    if (!rec) return json(404, { error: 'request not found' }, cors);
    if (rec.status === 'approved') return json(409, { error: 'already approved', code: rec.code }, cors);
    const c = await createCode(env, {
      plan: body.plan || rec.plan, chars: chars || rec.chars, days: days || 30,
      note: rec.name + ' ' + rec.phone + (rec.tid ? ' TID ' + rec.tid : ''),
    });
    rec.status = 'approved'; rec.code = c.code; rec.decided = Date.now();
    await env.PRO.put('req:' + rec.id, JSON.stringify(rec));
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
    const { code, rec } = await createCode(env, { plan: body.plan, chars, days, note: body.note });
    return json(200, { ...publicStatus(code, rec), note: rec.note }, cors);
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
        origin: origin || null, originAllowed: !!_ok,
      }, cors);
    }
    // Admin (code management) — protected by ADMIN_KEY, any allowed origin.
    if (url.pathname.startsWith('/admin/')) {
      if (!_ok) return json(403, { error: 'origin not allowed' }, cors);
      return admin(request, env, cors, url);
    }

    const isJsf = url.pathname === '/jsf/clone' || url.pathname === '/jsf/tts';
    const PRO_ROUTES = { '/pro/status': proStatus, '/pro/trial': proTrial, '/pro/request': proRequest, '/pro/request/status': proRequestStatus };
    const isPro = !!PRO_ROUTES[url.pathname];
    if (request.method !== 'POST' || (url.pathname !== '/tts' && !isJsf && !isPro)) {
      return json(404, { error: 'not found' }, cors);
    }
    if (!_ok) return json(403, { error: 'origin not allowed' }, cors);

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
