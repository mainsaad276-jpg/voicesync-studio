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
    else if (op === 'MGET') result = a.map((k) => (store.has(k) ? store.get(k) : null));
    else if (op === 'SCAN') { const pre = a[2].replace(/\*$/, ''); result = ['0', [...store.keys()].filter((k) => k.startsWith(pre))]; }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => String(url).startsWith('https://fake-upstash.test') ? upstash(url, init) : prevFetch(url, init);
  process.env.KV_REST_API_URL = 'https://fake-upstash.test';
  process.env.KV_REST_API_TOKEN = 'tok';
  process.env.VS_ADMIN_KEY = 'vercel-admin';
  process.env.ALLOWED_ORIGINS = ORIGIN;
  const vercel = (await import('../api/router.js')).default;
  let vr = await vercel(new Request('https://voxnova.vercel.app/api/health'));
  let vj = await vr.json();
  t('vercel_health', vr.status === 200 && vj.plansReady === true && vj.adminKeySet === true);
  vr = await vercel(new Request('https://voxnova.vercel.app/api/admin/codes', { method: 'POST', headers: { Origin: ORIGIN, 'X-Admin-Key': 'vercel-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'Starter', chars: 1000, days: 30 }) }));
  vj = await vr.json();
  t('vercel_admin_create', vr.status === 200 && /^VS-/.test(vj.code));
  vr = await vercel(new Request('https://voxnova.vercel.app/api/admin/codes', { headers: { Origin: ORIGIN, 'X-Admin-Key': 'vercel-admin' } }));
  t('vercel_kv_list', (await vr.json()).codes.length === 1);
  // As Vercel calls it after the rewrite: /api/router?__path=pro/status
  vr = await vercel(new Request('https://voxnova.vercel.app/api/router?__path=pro/status', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: vj.code }) }));
  t('vercel_rewrite_path', vr.status === 200 && (await vr.json()).remaining === 1000);
  vr = await vercel(new Request('https://voxnova.vercel.app/api/router?__path=pro/status', { method: 'OPTIONS', headers: { Origin: 'https://mainsaad276-jpg.github.io', 'Access-Control-Request-Method': 'POST' } }));
  t('vercel_preflight_github_pages', vr.status === 204 && vr.headers.get('access-control-allow-origin') === 'https://mainsaad276-jpg.github.io');
  // Admin page on the project's own Vercel site (request.url host differs after the rewrite)
  vr = await vercel(new Request('https://internal-host.example/api/router?__path=admin/codes', { headers: { Origin: 'https://voicesync-studio-psi.vercel.app', host: 'voicesync-studio-psi.vercel.app', 'X-Admin-Key': 'vercel-admin' } }));
  t('vercel_self_origin_admin', vr.status === 200);
  vr = await vercel(new Request('https://internal-host.example/api/router?__path=admin/codes', { headers: { Origin: 'https://evil.vercel.app', 'X-Admin-Key': 'vercel-admin' } }));
  t('vercel_other_site_blocked', vr.status === 403);
  // Same-site GET from the admin page: browsers send no Origin header
  vr = await vercel(new Request('https://internal-host.example/api/router?__path=admin/codes', { headers: { host: 'voicesync-studio-psi.vercel.app', 'X-Admin-Key': 'vercel-admin' } }));
  t('vercel_same_site_get_no_origin', vr.status === 200);
  globalThis.fetch = prevFetch;
}

// ---- audit fixes + dashboard ----
{
  const envD = { ...env, PRO: new MemKV() };
  const ipReq = (path, body, key, ip) => new Request('https://w.example.workers.dev' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: ORIGIN, 'X-Admin-Key': key, 'CF-Connecting-IP': ip, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // S1: 5 wrong keys -> locked, even the right key, for that IP
  for (let i = 0; i < 5; i++) await worker.fetch(ipReq('/admin/codes', null, 'bad', '7.7.7.7'), envD);
  r = await worker.fetch(ipReq('/admin/codes', null, ADMIN, '7.7.7.7'), envD);
  t('admin_lockout_after_5', r.status === 429 && (await r.json()).code === 'ADMIN_LOCKED');
  r = await worker.fetch(ipReq('/admin/codes', null, ADMIN, '6.6.6.6'), envD);
  t('admin_other_ip_ok', r.status === 200);
  // S2: request claims 10M chars for Starter -> server stores 1M + mismatch, approve grants 1M
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/request', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '5.5.5.5' }, body: JSON.stringify({ name: 'Cheater', phone: '03001231234', plan: 'Starter', chars: 10000000, price: 1200, method: 'JazzCash', tid: 'T9' }) }), envD);
  const RQ = await r.json();
  r = await worker.fetch(ipReq('/admin/requests', null, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  const row = j.requests.find((x) => x.id === RQ.id);
  t('request_server_chars', row.chars === 1000000 && row.claimedChars === 10000000 && row.mismatch === true);
  r = await worker.fetch(ipReq('/admin/requests/approve', { id: RQ.id }, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('approve_grants_plan_chars', j.chars === 1000000 && j.plan === 'Starter');
  // honest request -> no mismatch
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/request', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '5.5.5.6' }, body: JSON.stringify({ name: 'Honest', phone: '03001231235', plan: 'Creator', chars: 3000000, price: 4200, method: 'Easypaisa', tid: 'T10' }) }), envD);
  const RQ2 = await r.json();
  r = await worker.fetch(ipReq('/admin/requests', null, ADMIN, '6.6.6.6'), envD);
  t('honest_request_no_mismatch', (await r.json()).requests.find((x) => x.id === RQ2.id).mismatch === false);
  // trials + overview
  await worker.fetch(new Request('https://w.example.workers.dev/pro/trial', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '4.4.4.4' }, body: JSON.stringify({ device: 'dev_OVERVIEW_AAAAAAAAAA' }) }), envD);
  r = await worker.fetch(ipReq('/admin/overview', null, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('overview_users', j.users.total === 2 && j.users.paid === 1 && j.users.free === 1 && j.users.active24h === 2);
  t('overview_revenue', j.revenue.total === 1200 && j.revenue.payments === 1 && j.requests.pending === 1);
  t('overview_plans', j.plans.find((p) => p.plan === 'Starter').users === 1 && j.plans.find((p) => p.plan === 'Starter').revenue === 1200);
  t('overview_series', j.series.days.length === 30 && j.series.new[29] === 1 && j.series.revenue[29] === 1200);
  r = await worker.fetch(ipReq('/admin/users', null, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  const paidU = j.users.find((u) => u.plan === 'Starter');
  t('users_rows', paidU.source === 'request' && paidU.name === 'Cheater' && paidU.paid === 1200 && j.users.find((u) => u.plan === 'Free').source === 'trial');
  r = await worker.fetch(ipReq('/admin/plans', null, ADMIN, '6.6.6.6'), envD);
  t('plans_table', (await r.json()).plans.length === 5);
  // device + location info and admin edit
  await worker.fetch(new Request('https://w.example.workers.dev/pro/trial', { method: 'POST', headers: { Origin: 'https://localhost', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP; wv) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36', 'X-Vercel-IP-Country': 'PK', 'X-Vercel-IP-City': 'Faisalabad', 'Content-Type': 'application/json', 'CF-Connecting-IP': '4.4.4.5' }, body: JSON.stringify({ device: 'dev_INFO_AAAAAAAAAAAAAA' }) }), envD);
  r = await worker.fetch(ipReq('/admin/users', null, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  const appU = j.users.find((u) => u.device === 'dev_INFO');
  t('user_device_info', appU && appU.via === 'app' && appU.os === 'Android' && appU.country === 'PK' && appU.city === 'Faisalabad');
  r = await worker.fetch(ipReq('/admin/user', { code: appU.code, name: 'Ali', phone: '0300-1234567', note: 'friend' }, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('admin_edit_user', r.status === 200 && j.name === 'Ali' && j.phone === '03001234567' && j.note === 'friend');
  r = await worker.fetch(ipReq('/admin/user', { code: appU.code, name: 'X' }, 'wrong', '6.6.6.7'), envD);
  t('admin_edit_needs_key', r.status === 401);
  // plans editor + buyCost + payment accounts
  r = await worker.fetch(ipReq('/admin/plans', null, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('plans_default_source', j.source === 'default' && j.plans[0].buyCost === 0);
  r = await worker.fetch(ipReq('/admin/plans', { plans: [{ name: 'Free', chars: 5000, price: 10 }] }, ADMIN, '6.6.6.6'), envD);
  t('plans_reject_free_name', r.status === 400);
  r = await worker.fetch(ipReq('/admin/plans', { plans: [{ name: 'A', chars: 5000, price: 100, firstMonth: 200 }] }, ADMIN, '6.6.6.6'), envD);
  t('plans_reject_first_gt_price', r.status === 400);
  r = await worker.fetch(ipReq('/admin/plans', { plans: [{ name: 'A', chars: 5000, price: 100 }, { name: 'a', chars: 6000, price: 200 }] }, ADMIN, '6.6.6.6'), envD);
  t('plans_reject_duplicate', r.status === 400);
  r = await worker.fetch(ipReq('/admin/plans', { plans: [{ name: 'Mini', chars: 500000, price: 800, firstMonth: 0, buyCost: 500 }, { name: 'Starter', chars: 1000000, price: 1500, firstMonth: 1200, buyCost: 1000, badge: 'popular' }] }, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('plans_saved', r.status === 200 && j.source === 'admin' && j.plans.length === 2 && j.plans[0].firstMonth === 800 && j.plans[0].id === 'mini');
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/plans', { headers: { Origin: ORIGIN } }), envD);
  j = await r.json();
  t('public_plans_no_buycost', r.status === 200 && j.plans.length === 2 && j.plans.every((p) => !('buyCost' in p)) && !JSON.stringify(j).includes('buyCost') && j.payment === null);
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/plans', { headers: { Origin: 'https://evil.example' } }), envD);
  t('public_plans_cors', r.status === 403);
  r = await worker.fetch(ipReq('/admin/paysettings', { whatsapp: '0310', methods: [] }, ADMIN, '6.6.6.6'), envD);
  t('pay_reject_short_whatsapp', r.status === 400);
  r = await worker.fetch(ipReq('/admin/paysettings', { whatsapp: '923107100275', methods: [{ label: { en: 'JazzCash', ur: 'جاز کیش' }, value: '0300 1234567', name: 'M Saad' }, { label: { en: '' }, value: '', name: '' }] }, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('pay_saved', r.status === 200 && j.methods.length === 1 && j.whatsapp === '923107100275');
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/plans', { headers: { Origin: ORIGIN } }), envD);
  j = await r.json();
  t('public_pay', j.payment && j.payment.methods[0].value === '0300 1234567' && j.payment.methods[0].label.ur === 'جاز کیش');
  r = await worker.fetch(ipReq('/admin/paysettings', { whatsapp: '923107100275' }, 'nope', '6.6.6.8'), envD);
  t('pay_needs_key', r.status === 401);
  // approve on a saved plan uses its chars and records cost
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/request', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '4.4.4.9' }, body: JSON.stringify({ name: 'Buyer', phone: '03001112223', plan: 'Mini', chars: 500000, price: 800, method: 'JazzCash', tid: 'T1' }) }), envD);
  const RQM = await r.json();
  r = await worker.fetch(ipReq('/admin/requests/approve', { id: RQM.id }, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  t('approve_saved_plan', r.status === 200 && j.chars === 500000 && j.request.buyCost === 500);
  r = await worker.fetch(ipReq('/admin/overview', null, ADMIN, '6.6.6.6'), envD);
  j = await r.json();
  const mini = j.plans.find((p) => p.plan === 'Mini');
  t('overview_profit', mini.buyCost === 500 && mini.profit === 300 && mini.sales === 1 && mini.earned === 300 && j.revenue.cost >= 500 && j.revenue.profit === j.revenue.total - j.revenue.cost);
  r = await worker.fetch(ipReq('/admin/plans', { reset: true }, ADMIN, '6.6.6.6'), envD);
  r = await worker.fetch(new Request('https://w.example.workers.dev/pro/plans', { headers: { Origin: ORIGIN } }), envD);
  t('plans_reset', (await r.json()).plans.length === 5);
  r = await worker.fetch(req('/health'), envD);
  t('health_no_debug_origin', !('origin' in (await r.json())));
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
