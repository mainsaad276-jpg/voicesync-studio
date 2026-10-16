/*
 * VoxNova API on Vercel. Runs the same code as the Cloudflare Worker
 * (worker/src/index.js) under https://<your-site>.vercel.app/api/...
 * (vercel.json rewrites every /api/* path to this one function)
 *
 * Vercel → Project → Settings → Environment Variables:
 *   VS_ADMIN_KEY        your password for docs/admin.html          (required)
 *   JSF_API_KEY         JSF Labs key — or save it later on the admin page
 *   AZURE_SPEECH_KEY    Azure Speech key — or save it on the admin page
 *   AZURE_SPEECH_REGION e.g. centralindia
 * Storage: Vercel → Storage → add "Upstash for Redis" (or Vercel KV) to the
 * project. It sets KV_REST_API_URL + KV_REST_API_TOKEN (or
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) automatically.
 */
import worker from '../worker/src/index.js';

export const config = { runtime: 'edge' };

function kvFromEnv(e) {
  const url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL;
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  const base = url.replace(/\/+$/, '');
  const call = async (cmd) => {
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  // Same shape as a Cloudflare KV binding (only what the Worker uses).
  return {
    async get(k) { const v = await call(['GET', k]); return v == null ? null : String(v); },
    async put(k, v, opts) {
      const cmd = ['SET', k, String(v)];
      if (opts && opts.expirationTtl) cmd.push('EX', String(opts.expirationTtl));
      await call(cmd);
    },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [];
      let cursor = '0';
      do {
        const [next, batch] = await call(['SCAN', cursor, 'MATCH', prefix + '*', 'COUNT', '500']);
        cursor = String(next);
        for (const name of batch) keys.push({ name });
      } while (cursor !== '0' && keys.length < limit);
      return { keys: keys.slice(0, limit) };
    },
  };
}

export default async function handler(request) {
  const e = (typeof process !== 'undefined' && process.env) || {};
  const env = {
    JSF_API_KEY: e.JSF_API_KEY || '',
    AZURE_SPEECH_KEY: e.AZURE_SPEECH_KEY || '',
    AZURE_SPEECH_REGION: e.AZURE_SPEECH_REGION || '',
    ADMIN_KEY: e.VS_ADMIN_KEY || e.ADMIN_KEY || '',
    ALLOWED_ORIGINS: e.ALLOWED_ORIGINS || '',
    FREE_TRIAL_CHARS: e.FREE_TRIAL_CHARS || '',
    PRO: kvFromEnv(e),
  };
  // vercel.json rewrites /api/<anything> to /api/router?__path=<anything>.
  // Give the Worker the real path: /health, /tts, /pro/..., /admin/...
  const url = new URL(request.url);
  const forced = url.searchParams.get('__path');
  if (forced !== null) {
    url.searchParams.delete('__path');
    url.pathname = '/' + forced.replace(/^\/+/, '');
  } else {
    url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '').replace(/^\/router(?=\/|$)/, '') || '/';
  }
  // Copy method, every header (incl. Origin) and the body explicitly.
  const init = { method: request.method, headers: new Headers(request.headers) };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();
  const inner = new Request(url.toString(), init);
  return worker.fetch(inner, env);
}
