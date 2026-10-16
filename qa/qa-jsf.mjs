// VoxNova — JSF Labs relay tests (worker/src/index.js + tts.js API).
// Run: node qa/qa-jsf.mjs   (JSF Labs is mocked; no network, no real key)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const worker = (await import('../worker/src/index.js')).default;

let n = 0; const fails = [];
const t = (name, cond) => { n++; if (!cond) fails.push(n + '. ' + name); };

const ORIGIN = 'https://mainsaad276-jpg.github.io';
// In-memory stand-in for the Cloudflare KV binding.
class MemKV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}
const ADMIN = 'admin-secret-123';
const env = { JSF_API_KEY: 'jsf_test_key_123456', ALLOWED_ORIGINS: ORIGIN, AZURE_SPEECH_REGION: 'centralindia', PRO: new MemKV(), ADMIN_KEY: ADMIN };
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

let CODE = '';
const req = (path, init = {}) => new Request('https://w.example.workers.dev' + path, {
  ...init, headers: { Origin: ORIGIN, ...(CODE ? { 'X-VS-Code': CODE } : {}), ...(init.headers || {}) },
});
const adminReq = (path, body, key = ADMIN) => new Request('https://w.example.workers.dev' + path, {
  method: body ? 'POST' : 'GET',
  headers: { Origin: ORIGIN, 'X-Admin-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
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

// ---- plans: admin + codes ----
r = await worker.fetch(adminReq('/admin/codes', { plan: 'Starter', chars: 1000, days: 30 }, 'wrong'), env);
t('admin_wrong_key_401', r.status === 401);
r = await worker.fetch(adminReq('/admin/codes', { plan: 'Starter', chars: 1000, days: 30, note: 'Ali' }), env);
j = await r.json();
t('admin_create_200', r.status === 200);
t('admin_code_format', /^VS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(j.code));
t('admin_code_balance', j.remaining === 1000 && j.valid === true && j.expires > Date.now());
const NEW = j.code;
r = await worker.fetch(adminReq('/admin/codes'), env);
j = await r.json();
t('admin_list', j.codes.length === 1 && j.codes[0].note === 'Ali');

// JSF without a code -> 402 NEED_PLAN; bad code -> 402 BAD_CODE; no KV -> 503
CODE = '';
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), env);
t('jsf_needs_code', r.status === 402 && (await r.json()).code === 'NEED_PLAN');
CODE = 'VS-AAAA-BBBB-CCCC';
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), env);
t('jsf_bad_code', r.status === 402 && (await r.json()).code === 'BAD_CODE');
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), { ...env, PRO: undefined });
t('jsf_no_kv_503', r.status === 503);
CODE = NEW;

// /pro/status
r = await worker.fetch(req('/pro/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: NEW.toLowerCase() }) }), env);
j = await r.json();
t('status_ok_case_insensitive', r.status === 200 && j.remaining === 1000 && j.plan === 'Starter');
r = await worker.fetch(req('/pro/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'VS-ZZZZ-ZZZZ-ZZZZ' }) }), env);
t('status_unknown_404', r.status === 404);

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
t('tts_remaining_hdr', r.headers.get('X-Chars-Remaining') === String(1000 - 'Assalam o alaikum'.length));
r = await worker.fetch(req('/pro/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: NEW }) }), env);
t('tts_deducted', (await r.json()).used === 'Assalam o alaikum'.length);
t('tts_json_body', JSON.parse(calls[0].init.body).voice_id === VOICE);

// tts validation & safety
r = await worker.fetch(ttsReq({ text: '', voice_id: VOICE }), env);
t('tts_empty', r.status === 400);
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: 'edge:abc' }), env);
t('tts_bad_voice', r.status === 400);
r = await worker.fetch(ttsReq({ text: 'x'.repeat(10001), voice_id: VOICE }), env);
t('tts_too_long', r.status === 413);
// balance: text longer than what is left -> 402 PLAN_BALANCE, nothing charged
r = await worker.fetch(ttsReq({ text: 'x'.repeat(2000), voice_id: VOICE }), env);
j = await r.json();
t('tts_over_balance_402', r.status === 402 && j.code === 'PLAN_BALANCE');
// failed JSF call must not charge
mode = 'badhost';
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), env);
t('tts_rejects_foreign_audio_host', r.status === 502);
r = await worker.fetch(req('/pro/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: NEW }) }), env);
t('failed_call_not_charged', (await r.json()).used === 'Assalam o alaikum'.length);
mode = 'ok';
// top-up + expiry
r = await worker.fetch(adminReq('/admin/topup', { code: NEW, chars: 5000, days: 0 }), env);
j = await r.json();
t('topup_adds', j.chars === 6000);
const rec = JSON.parse(await env.PRO.get('code:' + NEW)); rec.expires = Date.now() - 1000; await env.PRO.put('code:' + NEW, JSON.stringify(rec));
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), env);
t('expired_402', r.status === 402 && (await r.json()).code === 'EXPIRED');
r = await worker.fetch(adminReq('/admin/topup', { code: NEW, chars: 0, days: 30 }), env);
t('renew_extends', (await r.json()).valid === true);

// access control
r = await worker.fetch(new Request('https://w.example.workers.dev/jsf/tts', { method: 'POST', headers: { Origin: 'https://evil.example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hi', voice_id: VOICE }) }), env);
t('origin_blocked', r.status === 403);
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), { ...env, JSF_API_KEY: '' });
t('no_key_500', r.status === 500);
r = await worker.fetch(req('/jsf/tts'), env);
t('get_404', r.status === 404);

// ---- free trial ----
CODE = '';
const trialReq = (device, ip = '1.1.1.1') => new Request('https://w.example.workers.dev/pro/trial', {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ device }),
});
r = await worker.fetch(trialReq('dev_AAAAAAAAAAAAAAAAAAAA'), env);
j = await r.json();
t('trial_200', r.status === 200 && j.plan === 'Free' && j.remaining === 10000 && /^VS-/.test(j.code));
const TRIAL = j.code;
r = await worker.fetch(trialReq('dev_AAAAAAAAAAAAAAAAAAAA'), env);
t('trial_same_device_same_code', (await r.json()).code === TRIAL);
r = await worker.fetch(trialReq('short'), env);
t('trial_bad_device', r.status === 400);
await worker.fetch(trialReq('dev_BBBBBBBBBBBBBBBBBBBB', '9.9.9.9'), env);
await worker.fetch(trialReq('dev_CCCCCCCCCCCCCCCCCCCC', '9.9.9.9'), env);
await worker.fetch(trialReq('dev_DDDDDDDDDDDDDDDDDDDD', '9.9.9.9'), env);
r = await worker.fetch(trialReq('dev_EEEEEEEEEEEEEEEEEEEE', '9.9.9.9'), env);
t('trial_ip_limit', r.status === 429 && (await r.json()).code === 'TRIAL_LIMIT');
r = await worker.fetch(trialReq('dev_FFFFFFFFFFFFFFFFFFFF', '8.8.8.8'), { ...env, FREE_TRIAL_CHARS: '5000' });
t('trial_chars_configurable', (await r.json()).remaining === 5000);

// ---- subscription request -> admin approve -> app gets code ----
const proPost = (path, body, ip = '2.2.2.2') => new Request('https://w.example.workers.dev' + path, {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
});
r = await worker.fetch(proPost('/pro/request', { name: 'A', phone: '123', plan: 'Starter', chars: 1000000 }), env);
t('request_validation', r.status === 400);
const SHOT = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
r = await worker.fetch(proPost('/pro/request', { name: 'Ali Khan', phone: '0300 1234567', plan: 'Starter', chars: 1000000, price: 1200, method: 'JazzCash', tid: 'TID123', screenshot: SHOT, device: 'dev_AAAAAAAAAAAAAAAAAAAA' }), env);
j = await r.json();
t('request_created', r.status === 200 && /^R[A-Z2-9]{8}$/.test(j.id) && j.secret.length === 24);
const REQ = j;
r = await worker.fetch(proPost('/pro/request/status', { id: REQ.id, secret: 'wrong' }), env);
t('request_status_needs_secret', r.status === 404);
r = await worker.fetch(proPost('/pro/request/status', { id: REQ.id, secret: REQ.secret }), env);
j = await r.json();
t('request_pending', j.status === 'pending' && !j.code);
r = await worker.fetch(adminReq('/admin/requests'), env);
j = await r.json();
t('admin_sees_request', j.requests.length === 1 && j.requests[0].tid === 'TID123' && !('secret' in j.requests[0]));
r = await worker.fetch(adminReq('/admin/requests/image?id=' + REQ.id), env);
t('admin_screenshot', (await r.json()).image === SHOT);
r = await worker.fetch(adminReq('/admin/requests/approve', { id: REQ.id }), env);
j = await r.json();
t('approve_creates_code', r.status === 200 && /^VS-/.test(j.code) && j.remaining === 1000000 && j.expires > Date.now());
const APPROVED = j.code;
r = await worker.fetch(adminReq('/admin/requests/approve', { id: REQ.id }), env);
t('approve_twice_409', r.status === 409);
r = await worker.fetch(proPost('/pro/request/status', { id: REQ.id, secret: REQ.secret }), env);
j = await r.json();
t('app_receives_code', j.status === 'approved' && j.code === APPROVED);
r = await worker.fetch(proPost('/pro/request', { name: 'Bad Payer', phone: '03001112223', plan: 'Pro', chars: 5000000, price: 7200, method: 'Bank transfer', tid: 'X1' }), env);
const REQ2 = await r.json();
r = await worker.fetch(adminReq('/admin/requests/reject', { id: REQ2.id, reason: 'Payment nahi mili' }), env);
r = await worker.fetch(proPost('/pro/request/status', { id: REQ2.id, secret: REQ2.secret }), env);
j = await r.json();
t('reject_reason_to_app', j.status === 'rejected' && j.reason === 'Payment nahi mili' && !j.code);

// ---- API settings saved from the admin page ----
const env2 = { ...env, JSF_API_KEY: '', PRO: new MemKV() };
r = await worker.fetch(adminReq('/admin/settings', { jsfKey: 'not-a-key' }), env2);
t('settings_validate_jsf', r.status === 400);
r = await worker.fetch(adminReq('/admin/settings', { jsfKey: 'jsf_saved_key_987654', azureKey: 'az-key-1', azureRegion: 'centralindia' }), env2);
t('settings_saved', (await r.json()).jsfKeySet === true);
r = await worker.fetch(adminReq('/admin/settings'), env2);
j = await r.json();
t('settings_no_full_key', j.jsfKeySet && !JSON.stringify(j).includes('jsf_saved_key_987654') && j.azureRegion === 'centralindia');
r = await worker.fetch(req('/health'), env2);
j = await r.json();
t('health_uses_saved_keys', j.jsfKeySet === true && j.keySet === true);
calls = [];
CODE = APPROVED;
r = await worker.fetch(ttsReq({ text: 'hi', voice_id: VOICE }), env2);
t('saved_jsf_key_used', calls.length > 0 && calls[0].init.headers['x-api-key'] === 'jsf_saved_key_987654' || r.status === 402);
CODE = '';

// ---- same-origin (Vercel: site + API together) ----
r = await worker.fetch(new Request('https://voxnova.vercel.app/pro/status', { method: 'POST', headers: { Origin: 'https://voxnova.vercel.app', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: APPROVED }) }), env);
t('same_origin_allowed', r.status === 200);

// ---- Vercel adapter with a fake Upstash REST store ----
{
  const store = new Map();
  const upstash = async (url, init) => {
    const cmd = JSON.parse(init.body);
    const [op, ...a] = cmd;
    let result = null;
    if (op === 'GET') result = store.has(a[0]) ? store.get(a[0]) : null;
    else if (op === 'SET') { store.set(a[0], a[1]); result = 'OK'; }
    else if (op === 'SCAN') { const pre = a[2].replace(/\*$/, ''); result = ['0', [...store.keys()].filter((k) => k.startsWith(pre))]; }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => String(url).startsWith('https://fake-upstash.test') ? upstash(url, init) : prevFetch(url, init);
  process.env.KV_REST_API_URL = 'https://fake-upstash.test';
  process.env.KV_REST_API_TOKEN = 'tok';
  process.env.VS_ADMIN_KEY = 'vercel-admin';
  process.env.ALLOWED_ORIGINS = ORIGIN;
  const vercel = (await import('../api/[...path].js')).default;
  let vr = await vercel(new Request('https://voxnova.vercel.app/api/health'));
  let vj = await vr.json();
  t('vercel_health', vr.status === 200 && vj.plansReady === true && vj.adminKeySet === true);
  vr = await vercel(new Request('https://voxnova.vercel.app/api/admin/codes', { method: 'POST', headers: { Origin: ORIGIN, 'X-Admin-Key': 'vercel-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'Starter', chars: 1000, days: 30 }) }));
  vj = await vr.json();
  t('vercel_admin_create', vr.status === 200 && /^VS-/.test(vj.code));
  vr = await vercel(new Request('https://voxnova.vercel.app/api/admin/codes', { headers: { Origin: ORIGIN, 'X-Admin-Key': 'vercel-admin' } }));
  t('vercel_kv_list', (await vr.json()).codes.length === 1);
  globalThis.fetch = prevFetch;
}

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
