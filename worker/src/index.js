/*
 * VoiceSync Studio: voice proxy (Cloudflare Worker).
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

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
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

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const chars = Math.floor(Number(body.chars) || 0);
  const days = Math.floor(Number(body.days) || 0);
  if (chars < 0 || chars > 100000000) return json(400, { error: 'chars must be 0..100,000,000' }, cors);
  if (days < 0 || days > 3660) return json(400, { error: 'days must be 0..3660' }, cors);

  if (url.pathname === '/admin/codes' && request.method === 'POST') {
    if (chars < 1) return json(400, { error: 'chars required' }, cors);
    let code = newCode();
    for (let i = 0; i < 3 && (await env.PRO.get('code:' + code)); i++) code = newCode();
    const now = Date.now();
    const rec = {
      plan: String(body.plan || 'Custom').slice(0, 40),
      chars, used: 0, clones: 0, created: now,
      expires: days ? now + days * 86400000 : null,
      note: String(body.note || '').slice(0, 120),
    };
    await saveCode(env, code, rec);
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
    const cors = corsHeaders(origin, env);
    const { _ok, ...corsOut } = cors;

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
      if (!_ok) return json(403, { error: 'origin not allowed' }, cors);
      return admin(request, env, cors, url);
    }

    const isJsf = url.pathname === '/jsf/clone' || url.pathname === '/jsf/tts';
    const isPro = url.pathname === '/pro/status';
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
      if (isPro) return proStatus(request, env, cors);
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
