// Upstream voice engine client. The API key NEVER leaves the server.
const BASE = (process.env.ENGINE_BASE_URL || 'https://www.jsflabs.io/api/v1').replace(/\/$/, '');
const KEY = process.env.ENGINE_API_KEY;

class EngineError extends Error {
  constructor(status, code, message, fields, adminDetail) { super(message); this.status = status; this.code = code; this.fields = fields; this.adminDetail = adminDetail; }
}
const ADMIN_HINTS = {
  INSUFFICIENT_CHARACTERS: 'Your JSF Labs API key has no API characters left (dashboard characters are separate). Add API characters to the key in your JSF account.',
  MISSING_API_KEY: 'ENGINE_API_KEY is not set on the server.',
  INVALID_KEY_FORMAT: 'ENGINE_API_KEY looks wrong — it must start with jsf_.',
  INVALID_API_KEY: 'JSF Labs does not recognise ENGINE_API_KEY. Check you pasted the full key.',
  SUBSCRIPTION_INACTIVE: 'The JSF Labs subscription for this key is inactive — renew it.',
  KEY_EXPIRED: 'The JSF Labs API key has expired — create a new one.',
};

// Strip upstream branding from messages shown to customers
const clean = (s) => String(s || '').replace(/jsf\s*labs?/gi, 'the voice engine').replace(/support@[\w.]+/gi, 'support');

async function call(path, init) {
  if (!KEY) throw new EngineError(503, 'ENGINE_NOT_CONFIGURED', 'Voice generation is not set up yet.', undefined, 'ENGINE_API_KEY is missing. Put it in .env (local) or Vercel → Settings → Environment Variables, then restart/redeploy.');
  let res, body;
  try {
    res = await fetch(BASE + path, { ...init, headers: { 'x-api-key': KEY, ...(init.headers || {}) }, signal: AbortSignal.timeout(180_000) });
    body = await res.json().catch(() => null);
  } catch (e) {
    throw new EngineError(503, 'ENGINE_UNREACHABLE', 'The voice engine is not reachable right now. Please try again in a minute.', undefined, `Could not reach ${BASE}: ${e.message}`);
  }
  if (!body || body.success !== true) {
    const err = body?.error || {};
    // Upstream billing/auth problems are OUR problem, not the customer's — hide details.
    const internal = ['MISSING_API_KEY', 'INVALID_KEY_FORMAT', 'INVALID_API_KEY', 'SUBSCRIPTION_INACTIVE', 'KEY_EXPIRED', 'INSUFFICIENT_CHARACTERS'];
    if (internal.includes(err.code)) {
      console.error('[engine] account problem:', err.code, err.message);
      throw new EngineError(503, 'ENGINE_UNAVAILABLE', 'Voice generation is temporarily unavailable. Our team has been notified.', undefined, `${err.code}: ${ADMIN_HINTS[err.code] || err.message}`);
    }
    throw new EngineError(res?.status || 502, err.code || 'ENGINE_ERROR', clean(err.message) || 'Generation failed, please retry.', err.fields);
  }
  return body;
}

async function tts({ text, voiceId, speed = 1 }) {
  const b = await call('/text-to-speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId, speed }),
  });
  return { audioUrl: b.data.audio_url, format: b.data.format || 'wav', characters: b.data.characters ?? text.length, engineCredits: b.credits };
}

async function clone({ buffer, filename, mimetype, name, gender = 'Unspecified', language = 'en' }) {
  const fd = new FormData();
  fd.append('audio', new Blob([buffer], { type: mimetype || 'audio/wav' }), filename || 'sample.wav');
  fd.append('name', name);
  fd.append('gender', gender);
  fd.append('language', language);
  const b = await call('/voice-clone', { method: 'POST', body: fd });
  return { voiceId: b.data.voiceId, sampleUrl: b.data.sampleUrl, engineCredits: b.credits };
}

module.exports = { tts, clone, EngineError };
