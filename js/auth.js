/*
 * VoxNova: accounts (email + password).
 * First open -> full-screen Login / Sign up. The account holds the user's
 * plan (free 10,000 characters on sign-up, paid plan after approval), so it
 * follows them to any phone or browser. Session token in localStorage.
 *   window.VSAuth.open() / .logout() / .user() / .token()
 * If the server can't be reached the user can continue with the free voices.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;
  var SESSION_KEY = 'voicesync.session', USER_KEY = 'voicesync.account';

  var T = {
    en: {
      welcome: 'Welcome to VoxNova', sub: 'Free voiceover, lip-sync and your own voice clone.',
      login: 'Log in', signup: 'Sign up', email: 'Email', password: 'Password', name: 'Your name',
      phone: 'WhatsApp number (optional)', show: 'Show', hide: 'Hide',
      doLogin: 'Log in', doSignup: 'Create free account', busy: 'Please wait…',
      gift: '🎁 10,000 HD characters FREE on sign-up', forgot: 'Forgot password?',
      noAcc: 'New here?', haveAcc: 'Already have an account?', makeOne: 'Create an account', goLogin: 'Log in',
      offline: 'Can’t reach the server. Check your internet and try again.', retry: 'Try again',
      skip: 'Continue with free voices', terms: 'By continuing you accept the', termsLink: 'Terms', and: 'and', privacy: 'Privacy Policy',
      hello: 'Welcome, {n}! Your free characters are ready.', back: 'Welcome back, {n}!',
      logout: 'Log out', account: 'Account', plan: 'Plan', left: 'left', loggedOut: 'You are logged out.',
      forgotMsg: 'Hi, I forgot my VoxNova password. My account email: ', pwHint: 'At least 8 characters',
      needLogin: 'Please log in to use HD voices and plans.'
    },
    ur: {
      welcome: 'وائس نووا میں خوش آمدید', sub: 'مفت وائس اوور، لِپ سنک اور آپ کی اپنی آواز کا کلون۔',
      login: 'لاگ اِن', signup: 'سائن اَپ', email: 'ای میل', password: 'پاس ورڈ', name: 'آپ کا نام',
      phone: 'واٹس ایپ نمبر (اختیاری)', show: 'دکھائیں', hide: 'چھپائیں',
      doLogin: 'لاگ اِن کریں', doSignup: 'مفت اکاؤنٹ بنائیں', busy: 'انتظار کریں…',
      gift: '🎁 سائن اَپ پر 10,000 ایچ ڈی حروف مفت', forgot: 'پاس ورڈ بھول گئے؟',
      noAcc: 'نئے ہیں؟', haveAcc: 'پہلے سے اکاؤنٹ ہے؟', makeOne: 'اکاؤنٹ بنائیں', goLogin: 'لاگ اِن',
      offline: 'سرور سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔', retry: 'دوبارہ کوشش',
      skip: 'مفت آوازوں کے ساتھ جاری رکھیں', terms: 'جاری رکھ کر آپ قبول کرتے ہیں', termsLink: 'شرائط', and: 'اور', privacy: 'پرائیویسی پالیسی',
      hello: 'خوش آمدید، {n}! آپ کے مفت حروف تیار ہیں۔', back: 'دوبارہ خوش آمدید، {n}!',
      logout: 'لاگ آؤٹ', account: 'اکاؤنٹ', plan: 'پلان', left: 'باقی', loggedOut: 'آپ لاگ آؤٹ ہو گئے۔',
      forgotMsg: 'السلام علیکم، میں وائس نووا کا پاس ورڈ بھول گیا ہوں۔ میرا ای میل: ', pwHint: 'کم از کم 8 حروف',
      needLogin: 'ایچ ڈی آوازوں اور پلانز کے لیے لاگ اِن کریں۔'
    }
  };
  function L() { return doc.documentElement.lang === 'ur' ? 'ur' : 'en'; }
  function t(k, v) { var s = (T[L()] && T[L()][k]) || T.en[k] || k; if (v) for (var x in v) s = s.replace('{' + x + '}', v[x]); return s; }
  function sGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} }
  function sDel(k) { try { root.localStorage.removeItem(k); } catch (e) {} }
  function api() { var p = root.VS_CONFIG && root.VS_CONFIG.ttsProxy; return p ? String(p).replace(/\/+$/, '') : ''; }
  function token() { return sGet(SESSION_KEY) || ''; }
  function user() { try { return JSON.parse(sGet(USER_KEY) || 'null'); } catch (e) { return null; } }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function Pro() { return root.Pro || null; }
  function deviceId() { try { return Pro() && Pro().deviceId ? Pro().deviceId() : ''; } catch (e) { return ''; } }

  function call(path, body) {
    var base = api();
    if (!base || typeof root.fetch !== 'function') { var e0 = new Error('offline'); e0.kind = 'offline'; return Promise.reject(e0); }
    var h = { 'Content-Type': 'application/json' };
    if (token()) h['X-VS-Session'] = token();
    return root.fetch(base + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; e.field = j.field; e.code = j.code; e.kind = 'server'; throw e; }
        return j;
      });
    }, function () { var e2 = new Error('offline'); e2.kind = 'offline'; throw e2; });
  }
  function applyAccount(j) {
    if (j.token) sSet(SESSION_KEY, j.token);
    if (j.user) sSet(USER_KEY, JSON.stringify(j.user));
    var P = Pro();
    if (P && P.setPlan && j.plan) P.setPlan(j.plan);
    renderChip();
  }
  function toast(msg) {
    var P = Pro();
    if (P && P._notify) return P._notify(msg);
    var n = el('div', 'pro-toast', msg); doc.body.appendChild(n); setTimeout(function () { n.remove(); }, 3500);
  }

  // ---------- full-screen login / sign-up ----------
  var screen = null, mode = 'signup';
  function close() { if (screen) { screen.remove(); screen = null; doc.documentElement.classList.remove('auth-open'); } }
  function open(m) {
    if (m) mode = m;
    close();
    doc.documentElement.classList.add('auth-open');
    screen = el('div', 'vn-auth');
    screen.setAttribute('role', 'dialog'); screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('dir', L() === 'ur' ? 'rtl' : 'ltr');
    var card = el('div', 'vn-auth-card');
    var top = el('div', 'vn-auth-top');
    var logo = el('div', 'vn-auth-logo', '🎤');
    var lang = el('button', 'vn-auth-lang', L() === 'ur' ? 'English' : 'اردو'); lang.type = 'button';
    lang.addEventListener('click', function () {
      var sel = doc.getElementById('langToggle');
      var next = L() === 'ur' ? 'en' : 'ur';
      if (sel) { sel.value = next; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      else doc.documentElement.lang = next;
      setTimeout(function () { open(); }, 30);
    });
    top.appendChild(logo); top.appendChild(lang); card.appendChild(top);
    card.appendChild(el('h2', 'vn-auth-title', t('welcome')));
    card.appendChild(el('p', 'vn-auth-sub', t('sub')));

    var tabs = el('div', 'vn-auth-tabs'); tabs.setAttribute('role', 'tablist');
    ['signup', 'login'].forEach(function (m2) {
      var b = el('button', 'vn-auth-tab', t(m2)); b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', m2 === mode ? 'true' : 'false');
      b.addEventListener('click', function () { mode = m2; open(); });
      tabs.appendChild(b);
    });
    card.appendChild(tabs);
    if (mode === 'signup') card.appendChild(el('div', 'vn-auth-gift', t('gift')));

    var f = el('form', 'vn-auth-form'); f.noValidate = true;
    function field(id, label, type, ac, extra) {
      var w = el('label', 'vn-auth-field'); w.appendChild(el('span', '', label));
      var i = el('input'); i.type = type; i.id = 'vnAuth_' + id; i.autocomplete = ac; i.required = id !== 'phone';
      if (extra) for (var k in extra) i[k] = extra[k];
      w.appendChild(i); f.appendChild(w); return i;
    }
    var nm = mode === 'signup' ? field('name', t('name'), 'text', 'name', { maxLength: 60 }) : null;
    var em = field('email', t('email'), 'email', 'email', { maxLength: 254, inputMode: 'email', spellcheck: false });
    var pw = field('password', t('password'), 'password', mode === 'signup' ? 'new-password' : 'current-password', { maxLength: 200, placeholder: t('pwHint') });
    var eye = el('button', 'vn-auth-eye', t('show')); eye.type = 'button';
    eye.addEventListener('click', function () { var sh = pw.type === 'password'; pw.type = sh ? 'text' : 'password'; eye.textContent = sh ? t('hide') : t('show'); });
    pw.parentNode.appendChild(eye);
    var ph = mode === 'signup' ? field('phone', t('phone'), 'tel', 'tel', { maxLength: 16, inputMode: 'tel', placeholder: '03xx xxxxxxx' }) : null;
    var u0 = user(); if (mode === 'login' && u0 && u0.email) em.value = u0.email;
    [em, pw, ph].forEach(function (i) { if (i) i.dir = 'ltr'; });
    var go = el('button', 'vn-auth-go', mode === 'signup' ? t('doSignup') : t('doLogin')); go.type = 'submit';
    f.appendChild(go);
    var msg = el('p', 'vn-auth-msg'); msg.setAttribute('role', 'alert'); f.appendChild(msg);
    var extra = el('div', 'vn-auth-extra'); f.appendChild(extra);

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg.textContent = ''; msg.className = 'vn-auth-msg'; extra.innerHTML = '';
      [nm, em, pw, ph].forEach(function (i) { if (i) i.removeAttribute('aria-invalid'); });
      var body = { email: em.value.trim(), password: pw.value, device: deviceId() };
      if (mode === 'signup') { body.name = nm.value.trim(); body.phone = ph.value.trim(); }
      go.disabled = true; go.textContent = t('busy');
      call(mode === 'signup' ? '/auth/signup' : '/auth/login', body).then(function (j) {
        applyAccount(j); close();
        toast(mode === 'signup' ? t('hello', { n: j.user.name.split(' ')[0] }) : t('back', { n: (j.user.name || '').split(' ')[0] }));
      }, function (e) {
        go.disabled = false; go.textContent = mode === 'signup' ? t('doSignup') : t('doLogin');
        if (e.kind === 'offline') {
          msg.textContent = t('offline');
          var sk = el('button', 'vn-auth-skip', t('skip')); sk.type = 'button';
          sk.addEventListener('click', function () { skipped = true; close(); });
          extra.appendChild(sk);
          return;
        }
        msg.textContent = e.message; msg.className = 'vn-auth-msg err';
        var bad = { name: nm, email: em, password: pw, phone: ph }[e.field];
        if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); }
        if (e.code === 'EXISTS') { var gl = el('button', 'vn-auth-link', t('goLogin')); gl.type = 'button'; gl.addEventListener('click', function () { mode = 'login'; open(); }); extra.appendChild(gl); }
      });
    });
    card.appendChild(f);

    var foot = el('div', 'vn-auth-foot');
    if (mode === 'login') {
      var fg = el('a', 'vn-auth-link', t('forgot'));
      var num = ''; try { num = String(Pro()._config().payment.whatsapp || '').replace(/\D/g, ''); } catch (e) {}
      fg.href = num ? 'https://wa.me/' + num + '?text=' + encodeURIComponent(t('forgotMsg') + (em.value || '')) : '#';
      fg.target = '_blank'; fg.rel = 'noopener';
      fg.addEventListener('click', function () { if (num) fg.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(t('forgotMsg') + em.value.trim()); });
      foot.appendChild(fg);
    }
    var sw = el('p', 'vn-auth-switch');
    sw.appendChild(doc.createTextNode((mode === 'signup' ? t('haveAcc') : t('noAcc')) + ' '));
    var swb = el('button', 'vn-auth-link', mode === 'signup' ? t('goLogin') : t('makeOne')); swb.type = 'button';
    swb.addEventListener('click', function () { mode = mode === 'signup' ? 'login' : 'signup'; open(); });
    sw.appendChild(swb); foot.appendChild(sw);
    var legal = el('p', 'vn-auth-legal');
    legal.appendChild(doc.createTextNode(t('terms') + ' '));
    var a1 = el('a', '', t('termsLink')); a1.href = 'docs/VoiceSync-Studio-Terms-and-User-Guide.pdf'; a1.target = '_blank'; a1.rel = 'noopener';
    var a2 = el('a', '', t('privacy')); a2.href = 'docs/privacy.html'; a2.target = '_blank'; a2.rel = 'noopener';
    legal.appendChild(a1); legal.appendChild(doc.createTextNode(' ' + t('and') + ' ')); legal.appendChild(a2);
    foot.appendChild(legal);
    card.appendChild(foot);
    screen.appendChild(card);
    doc.body.appendChild(screen);
    setTimeout(function () { (nm || em).focus(); }, 50);
  }

  // ---------- account chip in the top bar ----------
  var pop = null;
  function renderChip() {
    var bar = doc.querySelector('.topbar-actions');
    if (!bar) return;
    var u = user(), b = doc.getElementById('btnAccount');
    if (!token() || !u) { if (b) b.remove(); return; }
    if (!b) {
      b = el('button', 'btn btn-secondary btn-small account-btn'); b.id = 'btnAccount'; b.type = 'button';
      b.addEventListener('click', function (e) { e.stopPropagation(); togglePop(b); });
      bar.insertBefore(b, bar.firstChild);
    }
    b.textContent = ((u.name || u.email || '?').trim()[0] || '?').toUpperCase();
    b.setAttribute('aria-label', t('account') + ': ' + (u.name || u.email));
    b.title = u.email;
  }
  function togglePop(b) {
    if (pop) { pop.remove(); pop = null; return; }
    var u = user() || {}, P = Pro(), st = P && P.status ? P.status() : null;
    pop = el('div', 'account-pop'); pop.setAttribute('dir', L() === 'ur' ? 'rtl' : 'ltr');
    pop.appendChild(el('div', 'account-name', u.name || ''));
    pop.appendChild(el('div', 'account-email', u.email || ''));
    if (st) pop.appendChild(el('div', 'account-plan', t('plan') + ': ' + (st.plan || '—') + ' · ' + Number(st.remaining || 0).toLocaleString('en-US') + ' ' + t('left')));
    var pl = el('button', 'btn btn-small plans-btn', '⭐ Pro'); pl.type = 'button';
    pl.addEventListener('click', function () { pop.remove(); pop = null; if (P && P.showPlans) P.showPlans(); });
    var lo = el('button', 'btn btn-secondary btn-small', t('logout')); lo.type = 'button';
    lo.addEventListener('click', function () { pop.remove(); pop = null; logout(); });
    var row = el('div', 'account-actions'); row.appendChild(pl); row.appendChild(lo); pop.appendChild(row);
    var r = b.getBoundingClientRect();
    pop.style.top = (r.bottom + 8 + root.scrollY) + 'px';
    if (L() === 'ur') pop.style.left = Math.max(8, r.left) + 'px'; else pop.style.right = Math.max(8, root.innerWidth - r.right) + 'px';
    doc.body.appendChild(pop);
    setTimeout(function () {
      doc.addEventListener('click', function off(e) { if (pop && !pop.contains(e.target)) { pop.remove(); pop = null; } doc.removeEventListener('click', off); });
    }, 0);
  }
  function logout() {
    var done = function () {
      sDel(SESSION_KEY);
      var P = Pro(); if (P && P.clearCode) P.clearCode();
      renderChip(); toast(t('loggedOut')); open('login');
    };
    call('/auth/logout', {}).then(done, done);
  }

  // ---------- start ----------
  var skipped = false;
  function required() { var c = root.VS_CONFIG && root.VS_CONFIG.pro; return !!api() && !(c && c.requireLogin === false); }
  function start() {
    if (!required()) return;
    renderChip();
    if (!token()) { open('signup'); return; }
    call('/auth/me', {}).then(applyAccount, function (e) {
      if (e.status === 401) { sDel(SESSION_KEY); renderChip(); open('login'); }
    });
    try { new root.MutationObserver(function () { renderChip(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch (e) {}
  }
  root.VSAuth = {
    open: open, close: close, logout: logout, user: user, token: token,
    required: required, loggedIn: function () { return !!token(); }, skipped: function () { return skipped; }, _call: call
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
