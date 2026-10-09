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
 * Secrets / vars (set with wrangler, never committed):
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
    'Access-Control-Allow-Headers': 'Content-Type',
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

async function jsfError(res, cors) {
  let j = {};
  try { j = await res.json(); } catch { j = {}; }
  const e = (j && j.error) || {};
  const status = res.status === 402 || res.status === 429 || res.status === 422 || res.status === 413 ? res.status : 502;
  return json(status, { error: e.message || 'cloning service error', code: e.code || null, status: res.status }, cors);
}

async function jsfClone(request, env, cors) {
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
  return json(200, {
    voiceId: d.voiceId, name: d.name || name, language: d.language || language, gender: d.gender || gender,
    remaining: j.credits ? j.credits.remaining : null,
  }, cors);
}

async function jsfTts(request, env, cors) {
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }, cors); }
  const text = String(body.text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  const voiceId = String(body.voice_id || '');
  if (!text) return json(400, { error: 'empty text' }, cors);
  if (text.length > JSF_MAX_CHARS) return json(413, { error: 'text too long (max ' + JSF_MAX_CHARS + ')' }, cors);
  if (!JSF_VOICE_RE.test(voiceId)) return json(400, { error: 'bad voice' }, cors);
  const speed = Math.max(0.5, Math.min(2, Number(body.speed) || 1));

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
  const { _ok, ...h } = cors;
  return new Response(audio.body, {
    status: 200,
    headers: {
      ...h,
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store',
      'X-Chars-Remaining': String(j.credits && j.credits.remaining != null ? j.credits.remaining : ''),
      'Access-Control-Expose-Headers': 'X-Chars-Remaining',
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
      return json(200, { ok: true, region: env.AZURE_SPEECH_REGION || null, keySet: !!env.AZURE_SPEECH_KEY, jsfKeySet: !!env.JSF_API_KEY }, cors);
    }
    const isJsf = url.pathname === '/jsf/clone' || url.pathname === '/jsf/tts';
    if (request.method !== 'POST' || (url.pathname !== '/tts' && !isJsf)) {
      return json(404, { error: 'not found' }, cors);
    }
    if (!_ok) return json(403, { error: 'origin not allowed' }, cors);

    if (isJsf) {
      if (!env.JSF_API_KEY) return json(500, { error: 'cloning service not configured' }, cors);
      if (env.RATE_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) return json(429, { error: 'too many requests, try again in a minute' }, cors);
      }
      return url.pathname === '/jsf/clone' ? jsfClone(request, env, cors) : jsfTts(request, env, cors);
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
