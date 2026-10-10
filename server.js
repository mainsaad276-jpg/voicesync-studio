require('./lib/env');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const { db, save, id, now } = require('./lib/db');
const A = require('./lib/auth');
const engine = require('./lib/upstream');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const MAX_TTS = 50000;
const LANGS = ['en', 'ur', 'ar', 'hi', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'tr', 'zh', 'ja', 'ko', 'bn', 'pa', 'fa', 'id', 'ms', 'nl'];

// ── helpers ───────────────────────────────────────────────
const ok = (res, data, extra = {}, status = 200) => res.status(status).json({ success: true, ...extra, data });
const fail = (res, status, code, message, fields) => res.status(status).json({ success: false, error: { code, message, ...(fields ? { fields } : {}) } });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (e instanceof engine.EngineError) return fail(res, e.status, e.code, e.message, e.fields);
  console.error(e);
  fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
});
const clientIp = (req) => req.ip || req.socket.remoteAddress || 'x';

function requireUser(req, res, next) {
  const u = A.userFromReq(req);
  if (!u) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  req.user = u; next();
}
function requireAdmin(req, res, next) {
  requireUser(req, res, () => (req.user.role === 'admin' ? next() : fail(res, 403, 'FORBIDDEN', 'Admins only.')));
}

// simple sliding-window limiter
const hits = new Map();
function limiter(key, max, windowMs) {
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return Math.ceil((windowMs - (t - arr[0])) / 1000); }
  arr.push(t); hits.set(key, arr); return 0;
}

const voiceView = (v) => ({ id: v.id, name: v.name, gender: v.gender, language: v.language, public: !!v.public, mine: undefined, createdAt: v.createdAt, sample: v.sampleUrl ? `/api/voice-sample/${v.id}` : null, category: v.category || 'Cloned', description: v.description || '' });
const genView = (g) => ({ id: g.id, title: g.title, text: g.text, voiceId: g.voiceId, voiceName: g.voiceName, speed: g.speed, characters: g.characters, format: g.format, createdAt: g.createdAt, audio: `/api/audio/${g.id}`, download: `/api/audio/${g.id}?dl=1` });

function visibleVoices(u) {
  return db.voices.filter((v) => !v.deleted && (v.public || (u && v.userId === u.id)));
}

// core TTS used by dashboard + developer API
async function generate(u, { text, voiceId, speed, title, source }) {
  text = String(text || '').trim();
  const fields = {};
  if (!text) fields.text = 'Write something to generate.';
  if (text.length > MAX_TTS) fields.text = `Maximum ${MAX_TTS.toLocaleString()} characters per job.`;
  speed = speed === undefined || speed === '' ? 1 : Number(speed);
  if (!(speed >= 0.5 && speed <= 2)) fields.speed = 'Speed must be between 0.5 and 2.0.';
  const v = visibleVoices(u).find((x) => x.id === voiceId);
  if (!v) fields.voice_id = 'Voice not found. Pick one of your voices or a library voice.';
  if (Object.keys(fields).length) return { error: [422, 'VALIDATION_ERROR', 'Some fields are invalid.', fields] };
  const cost = text.length;
  if (!A.charge(u, cost)) return { error: [402, 'INSUFFICIENT_CHARACTERS', `You need ${cost.toLocaleString()} characters but have ${A.balance(u).toLocaleString()}. Top up to continue.`] };
  let out;
  try { out = await engine.tts({ text, voiceId: v.engineId, speed }); }
  catch (e) { A.refund(u, cost); throw e; }
  const g = { id: id('g_'), userId: u.id, title: (title || text.slice(0, 60)).trim(), text, voiceId: v.id, voiceName: v.name, speed, characters: cost, format: out.format, upstreamUrl: out.audioUrl, source: source || 'studio', createdAt: now() };
  db.generations.push(g); save();
  return { gen: g };
}

// ── public ────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const { payment, ...rest } = config;
  ok(res, { ...rest, payment: Object.fromEntries(Object.entries(payment).map(([k, v]) => [k, v])), languages: LANGS, maxTts: MAX_TTS });
});

app.get('/api/public-voices', (req, res) => ok(res, visibleVoices(null).map(voiceView)));

app.post('/api/playground', wrap(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return fail(res, 422, 'VALIDATION_ERROR', 'Write something first.');
  if (text.length > config.playgroundLimit) return fail(res, 422, 'VALIDATION_ERROR', `Playground is limited to ${config.playgroundLimit} characters. Create a free account for more.`);
  const v = visibleVoices(null).find((x) => x.id === req.body.voiceId);
  if (!v) return fail(res, 422, 'VALIDATION_ERROR', 'Pick a voice from the library.');
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16)}`;
  db.playground = Object.fromEntries(Object.entries(db.playground).filter(([k]) => k.startsWith(day)));
  if ((db.playground[key] || 0) >= config.playgroundDailyPerIp) return fail(res, 429, 'PLAYGROUND_LIMIT', 'Daily free playground limit reached. Create a free account to get 10,000 characters every month.');
  const out = await engine.tts({ text, voiceId: v.engineId, speed: Number(req.body.speed) || 1 });
  db.playground[key] = (db.playground[key] || 0) + 1;
  const g = { id: id('g_'), userId: null, title: 'Playground', text, voiceId: v.id, voiceName: v.name, speed: 1, characters: text.length, format: out.format, upstreamUrl: out.audioUrl, source: 'playground', createdAt: now() };
  db.generations.push(g); save();
  ok(res, genView(g), { remainingToday: config.playgroundDailyPerIp - db.playground[key] });
}));

// audio proxy — customers never see the upstream CDN
async function pipeAudio(url, res, filename, dl) {
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return fail(res, 404, 'AUDIO_NOT_FOUND', 'Audio file is no longer available.');
  res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/wav');
  if (r.headers.get('content-length')) res.setHeader('Content-Length', r.headers.get('content-length'));
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
  await pipeAudio(g.upstreamUrl, res, `${config.brand.short}-${safe}.${g.format || 'wav'}`, req.query.dl);
}));
app.get('/api/voice-sample/:id', wrap(async (req, res) => {
  const v = db.voices.find((x) => x.id === req.params.id && !x.deleted);
  if (!v || !v.sampleUrl) return fail(res, 404, 'NOT_FOUND', 'Sample not found.');
  if (!v.public) { const u = A.userFromReq(req); if (!u || (u.id !== v.userId && u.role !== 'admin')) return fail(res, 404, 'NOT_FOUND', 'Sample not found.'); }
  await pipeAudio(v.sampleUrl, res, `${v.name}-sample.wav`, false);
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
  if (db.users.some((u) => u.email === email)) fields.email = 'An account with this email already exists.';
  if (Object.keys(fields).length) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', fields);
  const ref = String(req.body.referral || '').trim().toUpperCase();
  const referrer = ref ? db.users.find((u) => u.referralCode === ref) : null;
  const u = A.newUser({ name, email, password, referredBy: referrer?.id });
  if (referrer) { referrer.credits.extra += config.referralBonus; u.credits.extra += config.referralBonus; save(); }
  A.createSession(res, u.id);
  ok(res, A.publicUser(u), {}, 201);
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (limiter('login:' + clientIp(req), 20, 900e3)) return fail(res, 429, 'RATE_LIMITED', 'Too many attempts. Wait a few minutes.');
  const u = db.users.find((x) => x.email === email);
  if (!u || !A.checkPassword(String(req.body.password || ''), u.password)) return fail(res, 401, 'INVALID_LOGIN', 'Email or password is incorrect.');
  if (u.disabled) return fail(res, 403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact support.');
  A.createSession(res, u.id);
  ok(res, A.publicUser(u));
}));
app.post('/api/auth/logout', (req, res) => { A.destroySession(req, res); ok(res, true); });

// ── account ───────────────────────────────────────────────
app.get('/api/session', (req, res) => { const u = A.userFromReq(req); res.json({ success: true, data: u ? A.publicUser(u) : null }); });
app.get('/api/me', requireUser, (req, res) => {
  const u = req.user;
  const gens = db.generations.filter((g) => g.userId === u.id);
  const refs = db.users.filter((x) => x.referredBy === u.id).length;
  ok(res, { ...A.publicUser(u), stats: { generations: gens.length, voices: db.voices.filter((v) => v.userId === u.id && !v.deleted).length, referrals: refs, charsThisWeek: gens.filter((g) => Date.now() - Date.parse(g.createdAt) < 7 * 864e5).reduce((s, g) => s + g.characters, 0) } });
});
app.post('/api/me/profile', requireUser, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return fail(res, 422, 'VALIDATION_ERROR', 'Enter your name.', { name: 'Enter your name.' });
  req.user.name = name.slice(0, 80); save(); ok(res, A.publicUser(req.user));
});
app.post('/api/me/password', requireUser, (req, res) => {
  if (!A.checkPassword(String(req.body.current || ''), req.user.password)) return fail(res, 422, 'VALIDATION_ERROR', 'Current password is wrong.', { current: 'Current password is wrong.' });
  if (String(req.body.next || '').length < 8) return fail(res, 422, 'VALIDATION_ERROR', 'New password needs 8+ characters.', { next: 'At least 8 characters.' });
  req.user.password = A.hashPassword(String(req.body.next)); save(); ok(res, true);
});
app.post('/api/me/delete', requireUser, (req, res) => {
  if (!A.checkPassword(String(req.body.password || ''), req.user.password)) return fail(res, 422, 'VALIDATION_ERROR', 'Password is wrong.');
  const uid = req.user.id;
  db.generations = db.generations.filter((g) => g.userId !== uid);
  db.voices.forEach((v) => { if (v.userId === uid && !v.public) v.deleted = true; });
  db.apiKeys = db.apiKeys.filter((k) => k.userId !== uid);
  db.sessions = db.sessions.filter((s) => s.userId !== uid);
  db.users = db.users.filter((u) => u.id !== uid);
  save(); A.destroySession(req, res); ok(res, true);
});

// ── voices ────────────────────────────────────────────────
app.get('/api/voices', requireUser, (req, res) => ok(res, visibleVoices(req.user).map((v) => ({ ...voiceView(v), mine: v.userId === req.user.id }))));

app.post('/api/voices/clone', requireUser, upload.single('audio'), wrap(async (req, res) => {
  const wait = limiter('clone:' + req.user.id, 10, 3600e3);
  if (wait) return fail(res, 429, 'RATE_LIMITED', `Too many clones this hour. Try again in ${Math.ceil(wait / 60)} min.`);
  const lim = req.user.role === 'admin' ? Infinity : config.cloneLimits[req.user.credits.plan === 'free' ? 'free' : 'paid'];
  if (db.voices.filter((v) => v.userId === req.user.id && !v.deleted).length >= lim) return fail(res, 403, 'CLONE_LIMIT', `Your plan allows ${lim} cloned voice${lim > 1 ? 's' : ''}. Delete one or upgrade to clone more.`);
  const f = req.file;
  const name = String(req.body.name || '').trim();
  const gender = ['Male', 'Female', 'Neutral', 'Unspecified'].includes(req.body.gender) ? req.body.gender : 'Unspecified';
  const language = LANGS.includes(req.body.language) ? req.body.language : 'en';
  const fields = {};
  if (!f) fields.audio = 'Upload or record a voice sample.';
  else if (!/audio\/(wav|x-wav|wave|mpeg|mp3|webm|ogg|mp4|x-m4a)/.test(f.mimetype) && !/\.(wav|mp3)$/i.test(f.originalname)) fields.audio = 'Upload a WAV or MP3 file.';
  if (name.length < 2 || name.length > 80) fields.name = 'Name must be 2–80 characters.';
  if (req.body.consent !== 'true') fields.consent = 'Confirm this is your voice or you have the speaker\'s permission.';
  if (Object.keys(fields).length) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', fields);
  const out = await engine.clone({ buffer: f.buffer, filename: f.originalname, mimetype: f.mimetype, name, gender, language });
  const v = { id: id('v_'), userId: req.user.id, engineId: out.voiceId, name, gender, language, sampleUrl: out.sampleUrl, public: false, category: 'Cloned', consentAt: now(), createdAt: now() };
  db.voices.push(v); save();
  ok(res, { ...voiceView(v), mine: true }, {}, 201);
}));
app.patch('/api/voices/:id', requireUser, (req, res) => {
  const v = db.voices.find((x) => x.id === req.params.id && !x.deleted && (x.userId === req.user.id || req.user.role === 'admin'));
  if (!v) return fail(res, 404, 'NOT_FOUND', 'Voice not found.');
  if (req.body.name) v.name = String(req.body.name).trim().slice(0, 80);
  if (req.body.description !== undefined) v.description = String(req.body.description).slice(0, 200);
  save(); ok(res, voiceView(v));
});
app.delete('/api/voices/:id', requireUser, (req, res) => {
  const v = db.voices.find((x) => x.id === req.params.id && !x.deleted && (x.userId === req.user.id || req.user.role === 'admin'));
  if (!v) return fail(res, 404, 'NOT_FOUND', 'Voice not found.');
  v.deleted = true; save(); ok(res, true);
});

// ── studio ────────────────────────────────────────────────
app.post('/api/tts', requireUser, wrap(async (req, res) => {
  const wait = limiter('tts:' + req.user.id, 30, 60e3);
  if (wait) return fail(res, 429, 'RATE_LIMITED', `Slow down — try again in ${wait}s.`);
  const r = await generate(req.user, { text: req.body.text, voiceId: req.body.voiceId, speed: req.body.speed, title: req.body.title });
  if (r.error) return fail(res, ...r.error);
  ok(res, genView(r.gen), { credits: A.creditsView(req.user) });
}));
app.get('/api/generations', requireUser, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = db.generations.filter((g) => g.userId === req.user.id && (!q || g.title.toLowerCase().includes(q) || g.text.toLowerCase().includes(q))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  ok(res, list.slice(0, 500).map(genView));
});
app.delete('/api/generations/:id', requireUser, (req, res) => {
  const n = db.generations.length;
  db.generations = db.generations.filter((g) => !(g.id === req.params.id && g.userId === req.user.id));
  if (n === db.generations.length) return fail(res, 404, 'NOT_FOUND', 'Not found.');
  save(); ok(res, true);
});

// ── billing ───────────────────────────────────────────────
function itemFor(itemId, user) {
  const p = config.plans.find((x) => x.id === itemId);
  if (p) {
    const firstTime = !db.payments.some((x) => x.userId === user.id && x.status === 'approved' && x.kind === 'plan');
    return { kind: 'plan', id: p.id, name: `${p.name} plan (30 days)`, chars: p.chars, amount: firstTime && p.firstMonth ? p.firstMonth : p.price };
  }
  const k = config.packs.find((x) => x.id === itemId);
  if (k) return { kind: 'pack', id: k.id, name: k.name, chars: k.chars, amount: k.price };
  return null;
}
app.get('/api/billing/quote/:item', requireUser, (req, res) => {
  const it = itemFor(req.params.item, req.user);
  it ? ok(res, it) : fail(res, 404, 'NOT_FOUND', 'Unknown plan.');
});
app.get('/api/payments', requireUser, (req, res) => ok(res, db.payments.filter((p) => p.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/payments', requireUser, (req, res) => {
  const it = itemFor(req.body.itemId, req.user);
  const method = String(req.body.method || '');
  const txnId = String(req.body.txnId || '').trim().slice(0, 60);
  const sender = String(req.body.sender || '').trim().slice(0, 60);
  const fields = {};
  if (!it) fields.itemId = 'Pick a plan or pack.';
  if (!config.payment[method]) fields.method = 'Pick a payment method.';
  if (txnId.length < 4) fields.txnId = 'Enter the transaction / reference ID from your receipt.';
  if (db.payments.some((p) => p.txnId === txnId && p.status !== 'rejected')) fields.txnId = 'This transaction ID was already submitted.';
  if (Object.keys(fields).length) return fail(res, 422, 'VALIDATION_ERROR', 'Please fix the highlighted fields.', fields);
  const p = { id: id('p_'), invoice: 'INV-' + String(db.payments.length + 1001), userId: req.user.id, userEmail: req.user.email, ...{ kind: it.kind, itemId: it.id, itemName: it.name, chars: it.chars, amount: it.amount }, method, txnId, sender, status: 'pending', createdAt: now() };
  db.payments.push(p); save();
  ok(res, p, {}, 201);
});

// ── API keys (developer API) ──────────────────────────────
app.get('/api/keys', requireUser, (req, res) => ok(res, db.apiKeys.filter((k) => k.userId === req.user.id).map((k) => ({ id: k.id, name: k.name, preview: k.preview, createdAt: k.createdAt, lastUsed: k.lastUsed || null }))));
app.post('/api/keys', requireUser, (req, res) => {
  if (db.apiKeys.filter((k) => k.userId === req.user.id).length >= 5) return fail(res, 422, 'LIMIT', 'Maximum 5 keys. Delete one first.');
  const raw = 'vs_' + crypto.randomBytes(24).toString('base64url');
  const k = { id: id('k_'), userId: req.user.id, name: String(req.body.name || 'Default key').slice(0, 40), hash: A.sha(raw), preview: raw.slice(0, 7) + '…' + raw.slice(-4), createdAt: now() };
  db.apiKeys.push(k); save();
  ok(res, { id: k.id, name: k.name, key: raw, preview: k.preview, createdAt: k.createdAt }, {}, 201);
});
app.delete('/api/keys/:id', requireUser, (req, res) => { db.apiKeys = db.apiKeys.filter((k) => !(k.id === req.params.id && k.userId === req.user.id)); save(); ok(res, true); });

// ── public developer API: /v1/* ───────────────────────────
function apiAuth(req, res, next) {
  const raw = req.get('x-api-key');
  if (!raw) return fail(res, 401, 'MISSING_API_KEY', 'Send your key in the x-api-key header.');
  if (!raw.startsWith('vs_') || raw.length < 20) return fail(res, 401, 'INVALID_KEY_FORMAT', 'Keys start with vs_.');
  const k = db.apiKeys.find((x) => x.hash === A.sha(raw));
  const u = k && db.users.find((x) => x.id === k.userId);
  if (!u) return fail(res, 401, 'INVALID_API_KEY', 'This API key is not valid.');
  if (!['pro', 'scale'].includes(u.credits.plan) && u.role !== 'admin') return fail(res, 403, 'PLAN_REQUIRED', 'API access needs the Pro or Scale plan.');
  const wait = limiter('api:' + k.id, 50, 60e3);
  if (wait) { res.setHeader('Retry-After', wait); return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Over 50 requests/min.', retryAfterSeconds: wait } }); }
  k.lastUsed = now(); save();
  req.user = u; next();
}
const creditsBlock = (u, cost) => { const c = A.creditsView(u); return { cost, used: c.used, remaining: c.remaining, total: c.remaining + c.used }; };
app.get('/v1/voices', apiAuth, (req, res) => ok(res, visibleVoices(req.user).map((v) => ({ voice_id: v.id, name: v.name, gender: v.gender, language: v.language, owner: v.userId === req.user.id ? 'you' : 'library' }))));
app.get('/v1/credits', apiAuth, (req, res) => ok(res, A.creditsView(req.user)));
app.post('/v1/text-to-speech', apiAuth, wrap(async (req, res) => {
  const r = await generate(req.user, { text: req.body.text, voiceId: req.body.voice_id, speed: req.body.speed, title: req.body.title, source: 'api' });
  if (r.error) return fail(res, ...r.error);
  const base = `${req.protocol}://${req.get('host')}`;
  ok(res, { audio_url: `${base}/v1/audio/${r.gen.id}`, id: r.gen.id, voice_id: r.gen.voiceId, format: r.gen.format, characters: r.gen.characters, speed: r.gen.speed }, { message: 'Your audio has been generated successfully.', credits: creditsBlock(req.user, r.gen.characters) });
}));
app.get('/v1/audio/:id', wrap(async (req, res) => {
  const g = db.generations.find((x) => x.id === req.params.id && x.source === 'api');
  if (!g) return fail(res, 404, 'NOT_FOUND', 'Audio not found.');
  await pipeAudio(g.upstreamUrl, res, `${g.id}.${g.format}`, req.query.dl);
}));
app.post('/v1/voice-clone', apiAuth, upload.single('audio'), wrap(async (req, res) => {
  const lim = req.user.role === 'admin' ? Infinity : config.cloneLimits.paid;
  if (db.voices.filter((v) => v.userId === req.user.id && !v.deleted).length >= lim) return fail(res, 403, 'CLONE_LIMIT', `Your plan allows ${lim} cloned voices. Delete one first.`);
  const f = req.file; const name = String(req.body.name || '').trim();
  if (!f || name.length < 2) return fail(res, 422, 'VALIDATION_ERROR', 'audio and name are required.', { ...(!f ? { audio: 'Required' } : {}), ...(name.length < 2 ? { name: '2–80 characters' } : {}) });
  const gender = ['Male', 'Female', 'Neutral', 'Unspecified'].includes(req.body.gender) ? req.body.gender : 'Unspecified';
  const language = LANGS.includes(req.body.language) ? req.body.language : 'en';
  const out = await engine.clone({ buffer: f.buffer, filename: f.originalname, mimetype: f.mimetype, name, gender, language });
  const v = { id: id('v_'), userId: req.user.id, engineId: out.voiceId, name, gender, language, sampleUrl: out.sampleUrl, public: false, category: 'Cloned', consentAt: now(), createdAt: now(), source: 'api' };
  db.voices.push(v); save();
  ok(res, { voiceId: v.id, name, language, gender, createdAt: v.createdAt }, { message: 'Your voice has been cloned successfully.', credits: creditsBlock(req.user, 0) }, 201);
}));
app.all('/v1/*', (req, res) => fail(res, 405, 'METHOD_NOT_ALLOWED', 'Unknown endpoint or method.'));

// ── admin ─────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const day = Date.now() - 864e5;
  ok(res, {
    users: db.users.length,
    paidUsers: db.users.filter((u) => u.credits.plan !== 'free').length,
    pendingPayments: db.payments.filter((p) => p.status === 'pending').length,
    revenue: db.payments.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0),
    generations24h: db.generations.filter((g) => Date.parse(g.createdAt) > day).length,
    chars24h: db.generations.filter((g) => Date.parse(g.createdAt) > day).reduce((s, g) => s + g.characters, 0),
    voices: db.voices.filter((v) => !v.deleted).length,
  });
});
app.get('/api/admin/users', requireAdmin, (req, res) => ok(res, db.users.map((u) => ({ ...A.publicUser(u), disabled: !!u.disabled, generations: db.generations.filter((g) => g.userId === u.id).length }))));
app.post('/api/admin/users/:id', requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return fail(res, 404, 'NOT_FOUND', 'User not found.');
  if (req.body.addChars) u.credits.extra = Math.max(0, u.credits.extra + Number(req.body.addChars) || 0);
  if (req.body.role && ['user', 'admin'].includes(req.body.role)) u.role = req.body.role;
  if (req.body.disabled !== undefined) { u.disabled = !!req.body.disabled; if (u.disabled) db.sessions = db.sessions.filter((s) => s.userId !== u.id); }
  if (req.body.plan) {
    const p = config.plans.find((x) => x.id === req.body.plan);
    if (p) Object.assign(u.credits, { plan: p.id, monthly: p.chars, monthlyTotal: p.chars, cycleEnds: Date.now() + 30 * 864e5 });
  }
  save(); ok(res, A.publicUser(u));
});
app.get('/api/admin/payments', requireAdmin, (req, res) => ok(res, [...db.payments].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt))));
app.post('/api/admin/payments/:id/:action', requireAdmin, (req, res) => {
  const p = db.payments.find((x) => x.id === req.params.id);
  if (!p || p.status !== 'pending') return fail(res, 404, 'NOT_FOUND', 'Pending payment not found.');
  const u = db.users.find((x) => x.id === p.userId);
  if (req.params.action === 'approve' && u) {
    if (p.kind === 'plan') {
      const plan = config.plans.find((x) => x.id === p.itemId);
      // unused paid monthly chars roll into extra so customers don't lose them
      if (u.credits.plan !== 'free') u.credits.extra += u.credits.monthly;
      Object.assign(u.credits, { plan: plan.id, monthly: plan.chars, monthlyTotal: plan.chars, cycleEnds: Date.now() + 30 * 864e5 });
    } else u.credits.extra += p.chars;
    p.status = 'approved';
  } else if (req.params.action === 'reject') { p.status = 'rejected'; p.note = String(req.body.note || '').slice(0, 200); }
  else return fail(res, 400, 'BAD_ACTION', 'approve or reject');
  p.reviewedAt = now(); save(); ok(res, p);
});
app.get('/api/admin/voices', requireAdmin, (req, res) => ok(res, db.voices.filter((v) => !v.deleted).map((v) => ({ ...voiceView(v), owner: db.users.find((u) => u.id === v.userId)?.email || '—' }))));
app.post('/api/admin/voices/:id', requireAdmin, (req, res) => {
  const v = db.voices.find((x) => x.id === req.params.id && !x.deleted);
  if (!v) return fail(res, 404, 'NOT_FOUND', 'Voice not found.');
  if (req.body.public !== undefined) v.public = !!req.body.public;
  if (req.body.category) v.category = String(req.body.category).slice(0, 30);
  if (req.body.description !== undefined) v.description = String(req.body.description).slice(0, 200);
  save(); ok(res, voiceView(v));
});

// ── static site ───────────────────────────────────────────
app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown endpoint.'));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`${config.brand.name} running → http://localhost:${PORT}`));
module.exports = app;
