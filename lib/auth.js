const crypto = require('crypto');
const { db, save, id, now } = require('./db');
const config = require('../config');

const COOKIE = 'vs_sid';
const SESSION_DAYS = 30;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions.push({ id: sha(token), userId, createdAt: now(), expiresAt: Date.now() + SESSION_DAYS * 864e5 });
  save();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function destroySession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) { const h = sha(t); db.sessions = db.sessions.filter((s) => s.id !== h); save(); }
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function userFromReq(req) {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const s = db.sessions.find((x) => x.id === sha(t));
  if (!s || s.expiresAt < Date.now()) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}

// ── credits ───────────────────────────────────────────────
function refreshCredits(u) {
  const c = u.credits;
  if (Date.now() < c.cycleEnds) return;
  // cycle over: paid plans lapse to free unless renewed by an approved payment
  c.plan = 'free';
  c.monthly = config.freeMonthlyChars;
  c.monthlyTotal = config.freeMonthlyChars;
  c.cycleEnds = Date.now() + 30 * 864e5;
  save();
}
function balance(u) { refreshCredits(u); return u.credits.monthly + u.credits.extra; }
function charge(u, n) {
  refreshCredits(u);
  if (balance(u) < n) return false;
  const fromMonthly = Math.min(u.credits.monthly, n);
  u.credits.monthly -= fromMonthly;
  u.credits.extra -= n - fromMonthly;
  u.credits.used += n;
  save();
  return true;
}
function refund(u, n) { u.credits.monthly += n; u.credits.used = Math.max(0, u.credits.used - n); save(); }
function creditsView(u) {
  refreshCredits(u);
  const c = u.credits;
  const plan = config.plans.find((p) => p.id === c.plan);
  return { plan: c.plan, planName: plan ? plan.name : 'Free', monthly: c.monthly, monthlyTotal: c.monthlyTotal, extra: c.extra, remaining: c.monthly + c.extra, used: c.used, cycleEnds: new Date(c.cycleEnds).toISOString() };
}

function newUser({ name, email, password, referredBy }) {
  const isFirst = db.users.length === 0;
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const u = {
    id: id('u_'), name, email, password: hashPassword(password),
    role: isFirst || (adminEmail && adminEmail === email) ? 'admin' : 'user',
    referralCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    referredBy: referredBy || null,
    createdAt: now(),
    credits: { plan: 'free', monthly: config.freeMonthlyChars, monthlyTotal: config.freeMonthlyChars, extra: 0, used: 0, cycleEnds: Date.now() + 30 * 864e5 },
  };
  db.users.push(u); save();
  return u;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, referralCode: u.referralCode, createdAt: u.createdAt, credits: creditsView(u) });

module.exports = { hashPassword, checkPassword, createSession, destroySession, userFromReq, charge, refund, balance, creditsView, newUser, publicUser, sha };
