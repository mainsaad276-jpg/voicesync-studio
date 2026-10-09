// VoiceSync Studio — JSF Labs relay tests (worker/src/index.js + tts.js API).
// Run: node qa/qa-jsf.mjs   (JSF Labs is mocked; no network, no real key)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const worker = (await import('../worker/src/index.js')).default;

let n = 0; const fails = [];
const t = (name, cond) => { n++; if (!cond) fails.push(n + '. ' + name); };

const ORIGIN = 'https://mainsaad276-jpg.github.io';
const env = { JSF_API_KEY: 'jsf_test_key_123456', ALLOWED_ORIGINS: ORIGIN, AZURE_SPEECH_REGION: 'centralindia' };
const VOICE = 'jsf_c3BlZWNoaWZ5X3ZvaWNlX2lk';
const WAV = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

let calls = [];
let mode = 'ok';
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/voice-clone')) {
    if (mode === 'quota') return new Response(JSON.stringify({ success: false, error: { code: 'INSUFFICIENT_CHARACTERS', message: 'Not enough characters' } }), { status: 402 });
    return new Response(JSON.stringify({ success: true, data: { voiceId: VOICE, name: 'Saad', language: 'ur', gender: 'Male' }, credits: { remaining: 9000 } }), { status: 201 });
  }
  if (String(url).endsWith('/text-to-speech')) {
    if (mode === 'badhost') return new Response(JSON.stringify({ success: true, data: { audio_url: 'https://evil.example.com/x.wav' }, credits: {} }), { status: 200 });
    return new Response(JSON.stringify({ success: true, data: { audio_url: 'https://cdn.jsflabs.io/tts/a.wav' }, credits: { remaining: 8956 } }), { status: 200 });
  }
  if (String(url).startsWith('https://cdn.jsflabs.io/')) return new Response(WAV, { status: 200 });
  return new Response('nope', { status: 404 });
};

const req = (path, init = {}) => new Request('https://w.example.workers.dev' + path, {
  ...init, headers: { Origin: ORIGIN, ...(init.headers || {}) },
});
const ttsReq = (body) => req('/jsf/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const cloneReq = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return req('/jsf/clone', { method: 'POST', body: fd });
};
const sample = () => new File([new Uint8Array(2000)], 'sample.wav', { type: 'audio/wav' });

// health
let r = await worker.fetch(req('/health'), env);
let j = await r.json();
t('health_jsf_key', j.jsfKeySet === true);
r = await worker.fetch(req('/health'), { ...env, JSF_API_KEY: '' });
t('health_jsf_key_missing', (await r.json()).jsfKeySet === false);

// clone ok — key sent only to JSF, never returned
calls = []; mode = 'ok';
r = await worker.fetch(cloneReq({ audio: sample(), name: 'Saad', gender: 'Male', language: 'ur' }), env);
j = await r.json();
t('clone_200', r.status === 200);
t('clone_voice', j.voiceId === VOICE);
t('clone_calls_jsf', calls.length === 1 && calls[0].url === 'https://www.jsflabs.io/api/v1/voice-clone');
t('clone_key_header', calls[0].init.headers['x-api-key'] === env.JSF_API_KEY);
t('clone_no_key_leak', !JSON.stringify(j).includes(env.JSF_API_KEY));
t('clone_cors', r.headers.get('Access-Control-Allow-Origin') === ORIGIN);

// clone validation
r = await worker.fetch(cloneReq({ name: 'Saad' }), env);
t('clone_needs_audio', r.status === 400);
r = await worker.fetch(cloneReq({ audio: sample(), name: 'S' }), env);
t('clone_needs_name', r.status === 400);
mode = 'quota';
r = await worker.fetch(cloneReq({ audio: sample(), name: 'Saad' }), env);
j = await r.json();
t('clone_quota_402', r.status === 402 && j.code === 'INSUFFICIENT_CHARACTERS');
mode = 'ok';

// tts ok -> WAV bytes
calls = [];
r = await worker.fetch(ttsReq({ text: 'Assalam o alaikum', voice_id: VOICE }), env);
const buf = new Uint8Array(await r.arrayBuffer());
t('tts_200', r.status === 200);
t('tts_wav_type', r.headers.get('Content-Type') === 'audio/wav');
t('tts_bytes', buf.length === WAV.length && buf[0] === 82);
t('tts_remaining_hdr', r.headers.get('X-Chars-Remaining') === '8956');
t('tts_json_body', JSON.parse(calls[0].init.body).voice_id === VOICE);

// tts validation & safety
r = await worker.fetch(ttsReq({ text: '', voice_id: VOICE }), env);
t('tts_empty', r.status === 400);
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: 'edge:abc' }), env);
t('tts_bad_voice', r.status === 400);
r = await worker.fetch(ttsReq({ text: 'x'.repeat(10001), voice_id: VOICE }), env);
t('tts_too_long', r.status === 413);
mode = 'badhost';
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), env);
t('tts_rejects_foreign_audio_host', r.status === 502);
mode = 'ok';

// access control
r = await worker.fetch(new Request('https://w.example.workers.dev/jsf/tts', { method: 'POST', headers: { Origin: 'https://evil.example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hi', voice_id: VOICE }) }), env);
t('origin_blocked', r.status === 403);
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), { ...env, JSF_API_KEY: '' });
t('no_key_500', r.status === 500);
r = await worker.fetch(req('/jsf/tts'), env);
t('get_404', r.status === 404);

// tts.js public API
const TTS = require('../js/tts.js');
t('tts_exports', ['jsfAvailable', 'jsfClone', 'jsfListVoices', 'jsfRemoveVoice'].every((k) => typeof TTS[k] === 'function'));
t('tts_no_server_in_node', TTS.jsfAvailable() === false);
t('tts_list_empty', Array.isArray(TTS.jsfListVoices()) && TTS.jsfListVoices().length === 0);
let rejected = false;
try { await TTS.jsfClone(null, 'x'); } catch { rejected = true; }
t('tts_clone_rejects_without_server', rejected);

console.log('JSF QA: ' + (n - fails.length) + ' / ' + n);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
