require('./lib/env');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const { db, tx, attach, id, now, backend } = require('./lib/db');
const A = require('./lib/auth');
const engine = require('./lib/upstream');
const { LIBRARY, previewText } = require('./lib/library');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// static site first — never touches the database
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC, { extensions: ['html'] }));

app.use(['/api', '/v1'], express.json({ limit: '1mb' }), attach());

// Vercel functions accept ~4.5 MB request bodies; the browser compresses larger samples before upload.
const MAX_UPLOAD = process.env.VERCEL ? 4_400_000 : 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });
const MAX_TTS = 50000;
const LANGS = ['en', 'ur', 'ar', 'hi', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'tr', 'zh', 'ja', 'ko', 'bn', 'pa', 'fa', 'id', 'ms', 'nl', 'he'];

// ── helpers ───────────────────────────────────────────────
const ok = (res, data, extra = {}, status = 200) => res.status(status).json({ success: true, ...extra, data });
const fail = (res, status, code, message, fields) => res.status(status).json({ success: false, error: { code, message, ...(fields ? { fields } : {}) } });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (e instanceof engine.EngineError) return fail(res, e.status, e.code, e.message, e.fields);
  if (e?.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'AUDIO_TOO_LARGE', 'Sample is too large. Use a shorter clip (10–30s).');
  console.error(e);
  fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
});
const clientIp = (req) => req.ip || req.socket.remoteAddress || 'x';
const me = (data, req) => data.users.find((u) => u.id === req.user.id);

function requireUser(req, res, next) {
  const u = A.userFromReq(req);
  if (!u) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  req.user = u; next();
}
function requireAdmin(req, res, next) {
  requireUser(req, res, () => (req.user.role === 'admin' ? next() : fail(res, 403, 'FORBIDDEN', 'Admins only.')));
}

// best-effort per-instance limiter (serverless instances each keep their own window)
const hits = new Map();
function limiter(key, max, windowMs) {
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return Math.ceil((windowMs - (t - arr[0])) / 1000); }
  arr.push(t); hits.set(key, arr); return 0;
}

const voiceView = (v) => ({ id: v.id, name: v.name, gender: v.gender, language: v.language, locale: v.locale || v.language, library: !!v.library, public: !!v.public, createdAt: v.createdAt, sample: v.sampleUrl ? `/api/voice-sample/${v.id}` : null, category: v.category || 'Cloned', description: v.description || '' });
const genView = (g) => ({ id: g.id, title: g.title, text: g.text, voiceId: g.voiceId, voiceName: g.voiceName, speed: g.speed, characters: g.characters, format: g.format, createdAt: g.createdAt, audio: `/api/audio/${g.id}`, download: `/api/audio/${g.id}?dl=1` });
const libraryVoices = (data) => {
  const hidden = new Set(data.hiddenLib || []);
  const prev = data.previews || {};
  return LIBRARY.filter((v) => !hidden.has(v.id)).map((v) => ({ ...v, sampleUrl: prev[v.id] || null }));
};
const visibleVoices = (data, uid) => [
  ...data.voices.filter((v) => !v.deleted && uid && v.userId === uid),
  ...data.voices.filter((v) => !v.deleted && v.public && v.userId !== uid),
  ...libraryVoices(data),
];
const STORE_TEXT = 3000; // keep stored script short so the database stays small

// core TTS used by dashboard + developer API
async function generate(req, { text, voiceId, speed, title, source, keyId }) {
  text = String(text || '').trim();
  const fields = {};
  if (!text) fields.text = 'Write something to generate.';
  if (text.length > MAX_TTS) fields.text = `Maximum ${MAX_TTS.toLocaleString()} characters per job.`;
  speed = speed === undefined || speed === '' ? 1 : Number(speed);
  if (!(speed >= 0.5 && speed <= 2)) fields.speed = 'Speed must be between 0.5 and 2.0.';
  const v = visibleVoices(db, req.user.id).find((x) => x.id === voiceId);
  if (!v) fields.voice_id = 'Voice not found. Pick one of your voices or a library voice.';
  if (Object.keys(fields).length) return { error: [422, 'VALIDATION_ERROR', 'Some fields are invalid.', fields] };
  const cost = text.length;
  // 1) reserve characters
  const short = await tx((d) => { const u = me(d, req); return A.charge(u, cost) ? null : A.balance(u); });
  if (short !== null) return { error: [402, 'INSUFFICIENT_CHARACTERS', `You need ${cost.toLocaleString()} characters but have ${short.toLocaleString()}. Top up to continue.`] };
  // 2) generate (no lock held)
  let out;
  try { out = await engine.tts({ text, voiceId: v.engineId, speed }); }
  catch (e) { await tx((d) => A.refund(me(d, req), cost)); throw e; }
  // 3) record
  return tx((d) => {
    const g = { id: id('g_'), userId: req.user.id, title: (title || text.slice(0, 60)).trim().slice(0, 120), text: text.slice(0, STORE_TEXT), voiceId: v.id, voiceName: v.name, speed, characters: cost, format: out.format, upstreamUrl: out.audioUrl, source: source || 'studio', createdAt: now() };
    d.generations.push(g);
    if (keyId) { const k = d.apiKeys.find((x) => x.id === keyId); if (k) k.lastUsed = now(); }
    return { gen: g, credits: A.creditsView(me(d, req)) };
  });
}

async function cloneFor(req, f, body) {
  const name = String(body.name || '').trim();
  const gender = ['Male', 'Female', 'Neutral', 'Unspecified'].includes(body.gender) ? body.gender : 'Unspecified';
  const language = LANGS.includes(body.language) ? body.language : 'en';
  const out = await engine.clone({ buffer: f.buffer, filename: f.originalname, mimetype: f.mimetype, name, gender, language });
  return tx((d) => {
    const v = { id: id('v_'), userId: req.user.id, engineId: out.voiceId, name, gender, language, sampleUrl: out.sampleUrl, public: false, category: 'Cloned', consentAt: now(), createdAt: now(), source: body.source || 'studio' };
    d.voices.push(v);
    return v;
  });
}
function cloneLimit(req, paidOnly) {
  const lim = req.user.role === 'admin' ? Infinity : config.cloneLimits[!paidOnly && req.user.credits.plan === 'free' ? 'free' : 'paid'];
  return db.voices.filter((v) => v.userId === req.user.id && !v.deleted).length >= lim ? lim : 0;
}

// ── public ────────────────────────────────────────────────
app.get('/api/config', (req, res) => ok(res, { ...config, languages: LANGS, maxTts: MAX_TTS, maxUpload: MAX_UPLOAD }));
app.get('/api/health', (req, res) => ok(res, { storage: backend.name, engine: !!process.env.ENGINE_API_KEY }));
app.get('/api/public-voices', (req, res) => ok(res, visibleVoices(db, null).map(voiceView)));

app.post('/api/playground', wrap(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return fail(res, 422, 'VALIDATION_ERROR', 'Write something first.');
  if (text.length > config.playgroundLimit) return fail(res, 422, 'VALIDATION_ERROR', `Playground is limited to ${config.playgroundLimit} characters. Create a free account for more.`);
  const v = visibleVoices(db, null).find((x) => x.id === req.body.voiceId);
  if (!v) return fail(res, 422, 'VALIDATION_ERROR', 'Pick a voice from the library.');
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16)}`;
  const left = await tx((d) => {
    d.playground = Object.fromEntries(Object.entries(d.playground).filter(([k]) => k.startsWith(day)));
    if ((d.playground[key] || 0) >= config.playgroundDailyPerIp) return -1;
    d.playground[key] = (d.playground[key] || 0) + 1;
    return config.playgroundDailyPerIp - d.playground[key];
  });
  if (left < 0) return fail(res, 429, 'PLAYGROUND_LIMIT', `Daily free playground limit reached. Create a free account to get ${config.freeMonthlyChars.toLocaleString()} characters every month.`);
  let out;
  try { out = await engine.tts({ text, voiceId: v.engineId, speed: 1 }); }
  catch (e) { await tx((d) => { d.playground[key] = Math.max(0, (d.playground[key] || 1) - 1); }); throw e; }
  const g = await tx((d) => { const g = { id: id('g_'), userId: null, title: 'Playground', text, voiceId: v.id, voiceName: v.name, speed: 1, characters: text.length, format: out.format, upstreamUrl: out.audioUrl, source: 'playground', createdAt: now() }; d.generations.push(g); return g; });
  ok(res, genView(g), { remainingToday: left });
}));

// audio proxy — customers never see the upstream CDN
async function pipeAudio(url, req, res, filename, dl) {
  const headers = req.headers.range ? { Range: req.headers.range } : {};
  const r = await fetch(url, { headers }).catch(() => null);
  if (!r || !r.ok) return fail(res, 404, 'AUDIO_NOT_FOUND', 'Audio file is no longer available.');
  res.status(r.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers.get(h)) res.setHeader(h, r.headers.get(h));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (dl) res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const { Readable } = require('stream');
  Readable.fromWeb(r.body).pipe(res);
}
app.get('/api/audio/:id', wrap(async (req, res) => {
  const g = db.generations.find((x) => x.id === req.params.id);
  if (!g) return fail(res, 404, 'NOT_FOUND', 'Audio not found.');
  if (g.userId) { const u = A.userFromReq(req); if (!u || (u.id !== g.userId && u.role !== 'admin')) return fail(res, 404, 'NOT_FOUND', 'Audio not found.'); }
  const safe = (g.title || 'voiceover').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'voiceover';
  await pipeAudio(g.upstreamUrl, req, res, `${config.brand.short}-${safe}.${g.format || 'wav'}`, req.query.dl);
}));
app.get('/api/voice-sample/:id', wrap(async (req, res) => {
  const v = libraryVoices(db).find((x) => x.id === req.params.id) || db.voices.find((x) => x.id === req.params.id && !x.deleted);
  if (!v || !v.sampleUrl) return fail(res, 404, 'NOT_FOUND', 'Sample not found.');
  if (!v.public) { const u = A.userFromReq(req); if (!u || (u.id !== v.userId && u.role !== 'admin')) return fail(res, 404, 'NOT_FOUND', 'Sample not found.'); }
  await pipeAudio(v.sampleUrl, req, res, `${v.name}-sample.wav`, false);
}));

// ── auth ──────────────────────────────────────────────────
app.post('/api/auth/register', wrap(async (req, res) => {
  if (limiter('reg:' + clientIp(req), 10, 3600e3)) return fail(res, 429, 'RATE_LIMITED', 'Too many sign-ups from this network. Try later.');
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fields = {};
  if (name.length < 2) fields.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email.';
  if (password.length < 8) fields.password = 'At least 8 characters.';
  if (Object.keys(fields).length) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', fields);
  const ref = String(req.body.referral || '').trim().toUpperCase();
  const u = await tx((d) => {
    if (d.users.some((x) => x.email === email)) return null;
    const referrer = ref ? d.users.find((x) => x.referralCode === ref) : null;
    const u = A.newUser(d, { name, email, password, referredBy: referrer?.id });
    if (referrer) { referrer.credits.extra += config.referralBonus; u.credits.extra += config.referralBonus; }
    return u;
  });
  if (!u) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', { email: 'An account with this email already exists.' });
  A.createSession(res, u);
  ok(res, A.publicUser(u), {}, 201);
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (limiter('login:' + clientIp(req), 20, 900e3)) return fail(res, 429, 'RATE_LIMITED', 'Too many attempts. Wait a few minutes.');
  const u = db.users.find((x) => x.email === email);
  if (!u || !A.checkPassword(String(req.body.password || ''), u.password)) return fail(res, 401, 'INVALID_LOGIN', 'Email or password is incorrect.');
  if (u.disabled) return fail(res, 403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact support.');
  A.createSession(res, u);
  ok(res, A.publicUser(u));
}));
app.post('/api/auth/logout', (req, res) => { A.destroySession(req, res); ok(res, true); });

// ── account ───────────────────────────────────────────────
app.get('/api/session', (req, res) => { const u = A.userFromReq(req); ok(res, u ? A.publicUser(u) : null); });
app.get('/api/me', requireUser, (req, res) => {
  const u = req.user;
  const gens = db.generations.filter((g) => g.userId === u.id);
  ok(res, { ...A.publicUser(u), stats: { generations: gens.length, voices: db.voices.filter((v) => v.userId === u.id && !v.deleted).length, referrals: db.users.filter((x) => x.referredBy === u.id).length, charsThisWeek: gens.filter((g) => Date.now() - Date.parse(g.createdAt) < 7 * 864e5).reduce((s, g) => s + g.characters, 0) } });
});
app.post('/api/me/profile', requireUser, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return fail(res, 422, 'VALIDATION_ERROR', 'Enter your name.', { name: 'Enter your name.' });
  const u = await tx((d) => { const u = me(d, req); u.name = name.slice(0, 80); return u; });
  ok(res, A.publicUser(u));
}));
app.post('/api/me/password', requireUser, wrap(async (req, res) => {
  if (!A.checkPassword(String(req.body.current || ''), req.user.password)) return fail(res, 422, 'VALIDATION_ERROR', 'Current password is wrong.', { current: 'Current password is wrong.' });
  if (String(req.body.next || '').length < 8) return fail(res, 422, 'VALIDATION_ERROR', 'New password needs 8+ characters.', { next: 'At least 8 characters.' });
  const u = await tx((d) => { const u = me(d, req); u.password = A.hashPassword(String(req.body.next)); u.sv = (u.sv || 0) + 1; return u; });
  A.createSession(res, u); // keep this device signed in, sign out others
  ok(res, true);
}));
app.post('/api/me/delete', requireUser, wrap(async (req, res) => {
  if (!A.checkPassword(String(req.body.password || ''), req.user.password)) return fail(res, 422, 'VALIDATION_ERROR', 'Password is wrong.');
  const uid = req.user.id;
  await tx((d) => {
    d.generations = d.generations.filter((g) => g.userId !== uid);
    d.voices.forEach((v) => { if (v.userId === uid && !v.public) v.deleted = true; });
    d.apiKeys = d.apiKeys.filter((k) => k.userId !== uid);
    d.users = d.users.filter((u) => u.id !== uid);
  });
  A.destroySession(req, res); ok(res, true);
}));

// ── voices ────────────────────────────────────────────────
app.get('/api/voices', requireUser, (req, res) => ok(res, visibleVoices(db, req.user.id).map((v) => ({ ...voiceView(v), mine: v.userId === req.user.id }))));

app.post('/api/voices/clone', requireUser, upload.single('audio'), wrap(async (req, res) => {
  const wait = limiter('clone:' + req.user.id, 10, 3600e3);
  if (wait) return fail(res, 429, 'RATE_LIMITED', `Too many clones this hour. Try again in ${Math.ceil(wait / 60)} min.`);
  const lim = cloneLimit(req);
  if (lim) return fail(res, 403, 'CLONE_LIMIT', `Your plan allows ${lim} cloned voice${lim > 1 ? 's' : ''}. Delete one or upgrade to clone more.`);
  const f = req.file;
  const name = String(req.body.name || '').trim();
  const fields = {};
  if (!f) fields.audio = 'Upload or record a voice sample.';
  else if (!/audio\/(wav|x-wav|wave|mpeg|mp3)/.test(f.mimetype) && !/\.(wav|mp3)$/i.test(f.originalname)) fields.audio = 'Upload a WAV or MP3 file.';
  if (name.length < 2 || name.length > 80) fields.name = 'Name must be 2–80 characters.';
  if (req.body.consent !== 'true') fields.consent = 'Confirm this is your voice or you have the speaker\'s permission.';
  if (Object.keys(fields).length) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', fields);
  const v = await cloneFor(req, f, req.body);
  ok(res, { ...voiceView(v), mine: true }, {}, 201);
}));
app.patch('/api/voices/:id', requireUser, wrap(async (req, res) => {
  const v = await tx((d) => {
    const v = d.voices.find((x) => x.id === req.params.id && !x.deleted && (x.userId === req.user.id || req.user.role === 'admin'));
    if (v && req.body.name) v.name = String(req.body.name).trim().slice(0, 80);
    if (v && req.body.description !== undefined) v.description = String(req.body.description).slice(0, 200);
    return v;
  });
  v ? ok(res, voiceView(v)) : fail(res, 404, 'NOT_FOUND', 'Voice not found.');
}));
app.delete('/api/voices/:id', requireUser, wrap(async (req, res) => {
  const okd = await tx((d) => { const v = d.voices.find((x) => x.id === req.params.id && !x.deleted && (x.userId === req.user.id || req.user.role === 'admin')); if (v) v.deleted = true; return !!v; });
  okd ? ok(res, true) : fail(res, 404, 'NOT_FOUND', 'Voice not found.');
}));

// ── studio ────────────────────────────────────────────────
app.post('/api/tts', requireUser, wrap(async (req, res) => {
  const wait = limiter('tts:' + req.user.id, 30, 60e3);
  if (wait) return fail(res, 429, 'RATE_LIMITED', `Slow down — try again in ${wait}s.`);
  const r = await generate(req, { text: req.body.text, voiceId: req.body.voiceId, speed: req.body.speed, title: req.body.title });
  if (r.error) return fail(res, ...r.error);
  ok(res, genView(r.gen), { credits: r.credits });
}));
app.get('/api/generations', requireUser, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = db.generations.filter((g) => g.userId === req.user.id && (!q || g.title.toLowerCase().includes(q) || g.text.toLowerCase().includes(q))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  ok(res, list.slice(0, 500).map(genView));
});
app.delete('/api/generations/:id', requireUser, wrap(async (req, res) => {
  const removed = await tx((d) => { const n = d.generations.length; d.generations = d.generations.filter((g) => !(g.id === req.params.id && g.userId === req.user.id)); return n !== d.generations.length; });
  removed ? ok(res, true) : fail(res, 404, 'NOT_FOUND', 'Not found.');
}));

// ── billing ───────────────────────────────────────────────
function itemFor(data, itemId, uid) {
  const p = config.plans.find((x) => x.id === itemId);
  if (p) {
    const firstTime = !data.payments.some((x) => x.userId === uid && x.status === 'approved' && x.kind === 'plan');
    return { kind: 'plan', id: p.id, name: `${p.name} plan (30 days)`, chars: p.chars, amount: firstTime && p.firstMonth ? p.firstMonth : p.price };
  }
  const k = config.packs.find((x) => x.id === itemId);
  if (k) return { kind: 'pack', id: k.id, name: k.name, chars: k.chars, amount: k.price };
  return null;
}
app.get('/api/billing/quote/:item', requireUser, (req, res) => {
  const it = itemFor(db, req.params.item, req.user.id);
  it ? ok(res, it) : fail(res, 404, 'NOT_FOUND', 'Unknown plan.');
});
app.get('/api/payments', requireUser, (req, res) => ok(res, db.payments.filter((p) => p.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/payments', requireUser, wrap(async (req, res) => {
  const method = String(req.body.method || '');
  const txnId = String(req.body.txnId || '').trim().slice(0, 60);
  const sender = String(req.body.sender || '').trim().slice(0, 60);
  const r = await tx((d) => {
    const it = itemFor(d, req.body.itemId, req.user.id);
    const fields = {};
    if (!it) fields.itemId = 'Pick a plan or pack.';
    if (!config.payment[method]) fields.method = 'Pick a payment method.';
    if (txnId.length < 4) fields.txnId = 'Enter the transaction / reference ID from your receipt.';
    if (d.payments.some((p) => p.txnId === txnId && p.status !== 'rejected')) fields.txnId = 'This transaction ID was already submitted.';
    if (Object.keys(fields).length) return { fields };
    const p = { id: id('p_'), invoice: 'INV-' + String(d.payments.length + 1001), userId: req.user.id, userEmail: req.user.email, kind: it.kind, itemId: it.id, itemName: it.name, chars: it.chars, amount: it.amount, method, txnId, sender, status: 'pending', createdAt: now() };
    d.payments.push(p);
    return { p };
  });
  if (r.fields) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', r.fields);
  ok(res, r.p, {}, 201);
}));

// ── API keys ──────────────────────────────────────────────
app.get('/api/keys', requireUser, (req, res) => ok(res, db.apiKeys.filter((k) => k.userId === req.user.id).map((k) => ({ id: k.id, name: k.name, preview: k.preview, createdAt: k.createdAt, lastUsed: k.lastUsed || null }))));
app.post('/api/keys', requireUser, wrap(async (req, res) => {
  const raw = 'vs_' + crypto.randomBytes(24).toString('base64url');
  const k = await tx((d) => {
    if (d.apiKeys.filter((x) => x.userId === req.user.id).length >= 5) return null;
    const k = { id: id('k_'), userId: req.user.id, name: String(req.body.name || 'Default key').slice(0, 40), hash: A.sha(raw), preview: raw.slice(0, 7) + '…' + raw.slice(-4), createdAt: now() };
    d.apiKeys.push(k); return k;
  });
  if (!k) return fail(res, 422, 'LIMIT', 'Maximum 5 keys. Delete one first.');
  ok(res, { id: k.id, name: k.name, key: raw, preview: k.preview, createdAt: k.createdAt }, {}, 201);
}));
app.delete('/api/keys/:id', requireUser, wrap(async (req, res) => { await tx((d) => { d.apiKeys = d.apiKeys.filter((k) => !(k.id === req.params.id && k.userId === req.user.id)); }); ok(res, true); }));

// ── public developer API: /v1/* ───────────────────────────
function apiAuth(req, res, next) {
  const raw = req.get('x-api-key');
  if (!raw) return fail(res, 401, 'MISSING_API_KEY', 'Send your key in the x-api-key header.');
  if (!raw.startsWith('vs_') || raw.length < 20) return fail(res, 401, 'INVALID_KEY_FORMAT', 'Keys start with vs_.');
  const k = db.apiKeys.find((x) => x.hash === A.sha(raw));
  const u = k && db.users.find((x) => x.id === k.userId);
  if (!u || u.disabled) return fail(res, 401, 'INVALID_API_KEY', 'This API key is not valid.');
  if (!['pro', 'scale'].includes(A.creditsView(u).plan) && u.role !== 'admin') return fail(res, 403, 'PLAN_REQUIRED', 'API access needs the Pro or Scale plan.');
  const wait = limiter('api:' + k.id, 50, 60e3);
  if (wait) { res.setHeader('Retry-After', wait); return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Over 50 requests/min.', retryAfterSeconds: wait } }); }
  req.user = u; req.keyId = k.id; next();
}
const creditsBlock = (c, cost) => ({ cost, used: c.used, remaining: c.remaining, total: c.remaining + c.used });
app.get('/v1/voices', apiAuth, (req, res) => ok(res, visibleVoices(db, req.user.id).map((v) => ({ voice_id: v.id, name: v.name, gender: v.gender, language: v.language, owner: v.userId === req.user.id ? 'you' : 'library' }))));
app.get('/v1/credits', apiAuth, (req, res) => ok(res, A.creditsView(req.user)));
app.post('/v1/text-to-speech', apiAuth, wrap(async (req, res) => {
  const r = await generate(req, { text: req.body.text, voiceId: req.body.voice_id, speed: req.body.speed, title: req.body.title, source: 'api', keyId: req.keyId });
  if (r.error) return fail(res, ...r.error);
  const base = `${req.protocol}://${req.get('host')}`;
  ok(res, { audio_url: `${base}/v1/audio/${r.gen.id}`, id: r.gen.id, voice_id: r.gen.voiceId, format: r.gen.format, characters: r.gen.characters, speed: r.gen.speed }, { message: 'Your audio has been generated successfully.', credits: creditsBlock(r.credits, r.gen.characters) });
}));
app.get('/v1/audio/:id', wrap(async (req, res) => {
  const g = db.generations.find((x) => x.id === req.params.id && x.source === 'api');
  if (!g) return fail(res, 404, 'NOT_FOUND', 'Audio not found.');
  await pipeAudio(g.upstreamUrl, req, res, `${g.id}.${g.format}`, req.query.dl);
}));
app.post('/v1/voice-clone', apiAuth, upload.single('audio'), wrap(async (req, res) => {
  const lim = cloneLimit(req, true);
  if (lim) return fail(res, 403, 'CLONE_LIMIT', `Your plan allows ${lim} cloned voices. Delete one first.`);
  const f = req.file; const name = String(req.body.name || '').trim();
  if (!f || name.length < 2) return fail(res, 422, 'VALIDATION_ERROR', 'audio and name are required.', { ...(!f ? { audio: 'Required' } : {}), ...(name.length < 2 ? { name: '2–80 characters' } : {}) });
  const v = await cloneFor(req, f, { ...req.body, source: 'api' });
  ok(res, { voiceId: v.id, name: v.name, language: v.language, gender: v.gender, createdAt: v.createdAt }, { message: 'Your voice has been cloned successfully.', credits: creditsBlock(A.creditsView(req.user), 0) }, 201);
}));
app.all('/v1/*', (req, res) => fail(res, 405, 'METHOD_NOT_ALLOWED', 'Unknown endpoint or method.'));

// ── admin ─────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const day = Date.now() - 864e5;
  const recent = db.generations.filter((g) => Date.parse(g.createdAt) > day);
  ok(res, {
    users: db.users.length,
    paidUsers: db.users.filter((u) => A.creditsView(u).plan !== 'free').length,
    pendingPayments: db.payments.filter((p) => p.status === 'pending').length,
    revenue: db.payments.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0),
    generations24h: recent.length,
    chars24h: recent.reduce((s, g) => s + g.characters, 0),
    voices: db.voices.filter((v) => !v.deleted).length + libraryVoices(db).length,
    storage: backend.name,
  });
});
app.get('/api/admin/users', requireAdmin, (req, res) => ok(res, db.users.map((u) => ({ ...A.publicUser(u), disabled: !!u.disabled, generations: db.generations.filter((g) => g.userId === u.id).length }))));
app.post('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const u = await tx((d) => {
    const u = d.users.find((x) => x.id === req.params.id);
    if (!u) return null;
    if (req.body.addChars) u.credits.extra = Math.max(0, u.credits.extra + (Number(req.body.addChars) || 0));
    if (req.body.role && ['user', 'admin'].includes(req.body.role)) u.role = req.body.role;
    if (req.body.disabled !== undefined) { u.disabled = !!req.body.disabled; u.sv = (u.sv || 0) + 1; }
    if (req.body.plan) {
      const p = config.plans.find((x) => x.id === req.body.plan);
      if (p) Object.assign(u.credits, { plan: p.id, monthly: p.chars, monthlyTotal: p.chars, cycleEnds: Date.now() + 30 * 864e5 });
    }
    return u;
  });
  u ? ok(res, A.publicUser(u)) : fail(res, 404, 'NOT_FOUND', 'User not found.');
}));
app.get('/api/admin/payments', requireAdmin, (req, res) => ok(res, [...db.payments].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt))));
app.post('/api/admin/payments/:id/:action', requireAdmin, wrap(async (req, res) => {
  if (!['approve', 'reject'].includes(req.params.action)) return fail(res, 400, 'BAD_ACTION', 'approve or reject');
  const p = await tx((d) => {
    const p = d.payments.find((x) => x.id === req.params.id);
    if (!p || p.status !== 'pending') return null;
    const u = d.users.find((x) => x.id === p.userId);
    if (req.params.action === 'approve' && u) {
      if (p.kind === 'plan') {
        const plan = config.plans.find((x) => x.id === p.itemId);
        if (u.credits.plan !== 'free' && Date.now() < u.credits.cycleEnds) u.credits.extra += u.credits.monthly; // keep unused paid chars
        Object.assign(u.credits, { plan: plan.id, monthly: plan.chars, monthlyTotal: plan.chars, cycleEnds: Date.now() + 30 * 864e5 });
      } else u.credits.extra += p.chars;
      p.status = 'approved';
    } else { p.status = 'rejected'; p.note = String(req.body.note || '').slice(0, 200); }
    p.reviewedAt = now();
    return p;
  });
  p ? ok(res, p) : fail(res, 404, 'NOT_FOUND', 'Pending payment not found.');
}));
app.get('/api/admin/voices', requireAdmin, (req, res) => {
  const hidden = new Set(db.hiddenLib || []);
  const prev = db.previews || {};
  ok(res, [
    ...db.voices.filter((v) => !v.deleted).map((v) => ({ ...voiceView(v), owner: db.users.find((u) => u.id === v.userId)?.email || '—' })),
    ...LIBRARY.map((v) => ({ ...voiceView({ ...v, sampleUrl: prev[v.id] }), public: !hidden.has(v.id), owner: 'Library' })),
  ]);
});
// Generate short preview clips for library voices (uses engine characters). Call repeatedly until remaining = 0.
app.post('/api/admin/previews', requireAdmin, wrap(async (req, res) => {
  const prev = db.previews || {};
  const todo = LIBRARY.filter((v) => req.body.force ? (req.body.ids || []).includes(v.id) : !prev[v.id] && (!req.body.ids || req.body.ids.includes(v.id)));
  const batch = todo.slice(0, 6);
  const made = {}; const errors = [];
  await Promise.all(batch.map(async (v) => {
    try { const out = await engine.tts({ text: previewText(v), voiceId: v.engineId, speed: 1 }); made[v.id] = out.audioUrl; }
    catch (e) { errors.push(`${v.name}: ${e.message}`); }
  }));
  if (Object.keys(made).length) await tx((d) => { d.previews = { ...(d.previews || {}), ...made }; });
  ok(res, { generated: Object.keys(made).length, remaining: todo.length - batch.length + errors.length, errors });
}));
app.post('/api/admin/voices/:id', requireAdmin, wrap(async (req, res) => {
  if (req.params.id.startsWith('lib_')) {
    const lv = LIBRARY.find((x) => x.id === req.params.id);
    if (!lv) return fail(res, 404, 'NOT_FOUND', 'Voice not found.');
    await tx((d) => { const h = new Set(d.hiddenLib || []); req.body.public ? h.delete(lv.id) : h.add(lv.id); d.hiddenLib = [...h]; });
    return ok(res, voiceView({ ...lv, public: !!req.body.public }));
  }
  const v = await tx((d) => {
    const v = d.voices.find((x) => x.id === req.params.id && !x.deleted);
    if (!v) return null;
    if (req.body.public !== undefined) v.public = !!req.body.public;
    if (req.body.category) v.category = String(req.body.category).slice(0, 30);
    if (req.body.description !== undefined) v.description = String(req.body.description).slice(0, 200);
    return v;
  });
  v ? ok(res, voiceView(v)) : fail(res, 404, 'NOT_FOUND', 'Voice not found.');
}));

// ── fallbacks ─────────────────────────────────────────────
app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown endpoint.'));
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'AUDIO_TOO_LARGE', 'Sample is too large. Use a shorter clip (10–30s).');
  console.error(err);
  fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
});
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`${config.brand.name} running → http://localhost:${PORT} (storage: ${backend.name})`));
module.exports = app;
