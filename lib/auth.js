const crypto = require('crypto');
const { db, id, now } = require('./db');
const config = require('../config');

const COOKIE = 'vs_sid';
const SESSION_DAYS = 30;
const SECRET = process.env.SESSION_SECRET || process.env.ENGINE_API_KEY || 'dev-secret-change-me';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 64), Buffer.from(hash, 'hex'));
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Stateless signed session: userId.expiry.sessionVersion.signature
function createSession(res, u) {
  const payload = `${u.id}.${Date.now() + SESSION_DAYS * 864e5}.${u.sv || 0}`;
  const token = `${payload}.${hmac(payload)}`;
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function destroySession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function userFromReq(req) {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length !== 4) return null;
  const [uid, exp, sv, sig] = parts;
  const expect = hmac(`${uid}.${exp}.${sv}`);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  if (+exp < Date.now()) return null;
  const u = db.users.find((x) => x.id === uid);
  if (!u || u.disabled || String(u.sv || 0) !== sv) return null;
  return u;
}

// ── credits (call mutators inside tx with a fresh user object) ──
function refreshCredits(u) {
  const c = u.credits;
  if (Date.now() < c.cycleEnds) return;
  c.plan = 'free';
  c.monthly = config.freeMonthlyChars;
  c.monthlyTotal = config.freeMonthlyChars;
  c.cycleEnds = Date.now() + 30 * 864e5;
}
function balance(u) { refreshCredits(u); return u.credits.monthly + u.credits.extra; }
function charge(u, n) {
  refreshCredits(u);
  if (balance(u) < n) return false;
  const fromMonthly = Math.min(u.credits.monthly, n);
  u.credits.monthly -= fromMonthly;
  u.credits.extra -= n - fromMonthly;
  u.credits.used += n;
  return true;
}
function refund(u, n) { u.credits.monthly += n; u.credits.used = Math.max(0, u.credits.used - n); }
function creditsView(u) {
  refreshCredits(u);
  const c = u.credits;
  const plan = config.plans.find((p) => p.id === c.plan);
  return { plan: c.plan, planName: plan ? plan.name : 'Free', monthly: c.monthly, monthlyTotal: c.monthlyTotal, extra: c.extra, remaining: c.monthly + c.extra, used: c.used, cycleEnds: new Date(c.cycleEnds).toISOString() };
}

function newUser(data, { name, email, password, referredBy }) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const u = {
    id: id('u_'), name, email, password: hashPassword(password), sv: 0,
    role: data.users.length === 0 || (adminEmail && adminEmail === email) ? 'admin' : 'user',
    referralCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    referredBy: referredBy || null,
    createdAt: now(),
    credits: { plan: 'free', monthly: config.freeMonthlyChars, monthlyTotal: config.freeMonthlyChars, extra: 0, used: 0, cycleEnds: Date.now() + 30 * 864e5 },
  };
  data.users.push(u);
  return u;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, referralCode: u.referralCode, createdAt: u.createdAt, credits: creditsView(u) });

module.exports = { hashPassword, checkPassword, createSession, destroySession, userFromReq, charge, refund, balance, creditsView, newUser, publicUser, sha };
