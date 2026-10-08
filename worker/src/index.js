/*
 * VoiceSync Studio: voice proxy (Cloudflare Worker).
 *
 * The app sends { text, voice } here; this Worker calls Azure AI Speech with
 * the secret key and returns MP3 audio. The Azure key never reaches the
 * website or the APK.
 *
 * Secrets / vars (set with wrangler, never committed):
 *   AZURE_SPEECH_KEY     secret, KEY 1 from the Azure Speech resource
 *   AZURE_SPEECH_REGION  var, e.g. "centralindia"
 *   ALLOWED_ORIGINS      var, comma-separated list of sites allowed to call
 * Optional binding:
 *   RATE_LIMITER         Workers rate-limit binding (see wrangler.toml)
 */

const MAX_CHARS = 3000;                       // per request; the app chunks longer scripts
const VOICE_RE = /^[a-z]{2,3}-[A-Z]{2,4}-[A-Za-z0-9]+Neural$/;
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

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
      return json(200, { ok: true, region: env.AZURE_SPEECH_REGION || null, keySet: !!env.AZURE_SPEECH_KEY }, cors);
    }
    if (request.method !== 'POST' || url.pathname !== '/tts') {
      return json(404, { error: 'not found' }, cors);
    }
    if (!_ok) return json(403, { error: 'origin not allowed' }, cors);
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
