/*
 * VoxNova: Pro plans, activation codes and free-tier framework.
 *
 * What is paid today: HD voices from JSF Labs (your clones). They spend real
 * money per character, so they need an activation code with a character
 * balance. The balance is kept and enforced on the Worker (worker/), never
 * only on the phone. Everything else in the app stays free.
 *
 * Buying: the Plans sheet shows plan cards. "Buy" flips a card to its back,
 * which shows how to pay (WhatsApp / bank details from js/config.js). After
 * payment the owner creates a code on docs/admin.html and sends it; the user
 * enters it under "Have a code?".
 *
 * Optional free-tier limits (VS_CONFIG.pro.enforce = true) still work as
 * before: char limit, daily count, watermark, locked features.
 *
 * Public API (window.Pro):
 *   Pro.enforced() / Pro.isPro() / Pro.can(feature)
 *   Pro.checkGenerate({chars, dialogue}) -> {ok, reason}
 *   Pro.recordGeneration() / Pro.usage()
 *   Pro.shouldWatermark() / Pro.drawWatermark(ctx, w, h)
 *   Pro.code()            -> saved activation code or ''
 *   Pro.status()          -> last known plan status or null
 *   Pro.activate(code)    -> Promise<status>   (asks the Worker)
 *   Pro.refresh()         -> Promise<status|null>
 *   Pro.noteRemaining(n)  -> update balance after a paid voice
 *   Pro.clearCode()
 *   Pro.showPlans(reason) / Pro.showUpsell(reason, chars)
 *   Pro.setPro(bool)      -> TEST ONLY local flag
 */
(function (root) {
  'use strict';

  var FEATURES = {
    hd:          { en: 'HD JSF Labs voices',                ur: 'ایچ ڈی JSF Labs آوازیں' },
    clone:       { en: 'Voice cloning (your own voice)',    ur: 'وائس کلوننگ (آپ کی اپنی آواز)' },
    longText:    { en: 'Long scripts (no character limit)', ur: 'لمبی اسکرپٹ (حروف کی کوئی حد نہیں)' },
    unlimited:   { en: 'Unlimited voiceovers per day',      ur: 'روزانہ لامحدود وائس اوور' },
    noWatermark: { en: 'Videos without watermark',          ur: 'واٹر مارک کے بغیر ویڈیو' },
    dialogue:    { en: 'Dialogue mode (two voices)',        ur: 'ڈائیلاگ موڈ (دو آوازیں)' },
    music:       { en: 'Background music',                  ur: 'بیک گراؤنڈ میوزک' },
    shorts:      { en: 'Shorts / Reels 9:16 with captions', ur: 'شارٹس / ریلز 9:16 کیپشن کے ساتھ' }
  };

  var DEFAULT_PLANS = [
    { id: 'starter', name: 'Starter', chars: 1000000, price: 1500, firstMonth: 1200, badge: '',
      perks: { en: ['All HD voices', 'Up to 20 voice clones', 'MP3/WAV + video export', 'WhatsApp support'],
               ur: ['تمام ایچ ڈی آوازیں', '20 تک وائس کلون', 'MP3/WAV + ویڈیو ایکسپورٹ', 'واٹس ایپ سپورٹ'] } }
  ];

  var DEFAULTS = {
    enforce: false,
    showBadges: true,
    freeMaxChars: 1500,
    freeDailyGenerations: 15,
    watermarkFreeVideos: true,
    proFeatures: ['hd', 'clone'],
    upgradeUrl: '',
    currency: 'Rs',
    plans: DEFAULT_PLANS,
    offers: [],
    payment: { whatsapp: '', methods: [] }
  };

  var TXT = {
    en: {
      chip: 'PRO',
      chipFree: 'Pro feature, free for now',
      chipPaid: 'Needs a plan',
      plansBtn: 'Pro',
      title: 'VoiceSync Pro',
      sub: 'HD voices and your own voice clone. Everything else stays free.',
      freeNow: 'Right now every Pro feature is FREE. Enjoy!',
      locked: 'This is a Pro feature.',
      needPlan: 'HD voices and voice cloning need a plan. Pick one below.',
      noBalance: 'Your plan has no characters left. Top up below.',
      expired: 'Your plan has expired. Renew below.',
      tooLong: 'Free plan: up to {n} characters per voiceover. Your text has {m}.',
      daily: 'Free plan: {n} voiceovers per day. Come back tomorrow, or get Pro.',
      list: 'Pro includes:',
      ok: 'Close',
      upgrade: 'Get Pro',
      perMonth: '/month',
      firstMonth: 'First month',
      save: 'Save {currency} {n}',
      chars: '{n} characters',
      buy: 'Buy',
      back: '← Back',
      payTitle: 'How to pay',
      payAmount: 'Send {currency} {n}',
      step1: 'Pay using one of the options below.',
      step1Wa: 'Tap “Buy on WhatsApp” — we reply with JazzCash / Easypaisa / bank details.',
      step2: 'Send the payment screenshot on WhatsApp.',
      step3: 'You get an activation code. Enter it below — done!',
      whatsapp: 'Buy on WhatsApp',
      waMsg: 'Assalam o Alaikum! I want the VoxNova {plan} plan ({chars} characters). First month: {currency} {price}.',
      copy: 'Copy',
      copied: 'Copied',
      offers: 'Offers',
      haveCode: 'Have an activation code?',
      codePh: 'VS-XXXX-XXXX-XXXX',
      activate: 'Activate',
      checking: 'Checking…',
      active: 'Active plan: {plan}',
      left: '{n} characters left',
      until: 'Valid until {d}',
      badCode: 'Code not found. Check it and try again.',
      offline: 'Plans server is not connected yet. Try again later.',
      remove: 'Remove code',
      mostPopular: 'Most popular'
    },
    ur: {
      chip: 'PRO',
      chipFree: 'پرو فیچر، فی الحال مفت',
      chipPaid: 'پلان چاہیے',
      plansBtn: 'پلان',
      title: 'وائس سنک پرو',
      sub: 'ایچ ڈی آوازیں اور آپ کی اپنی آواز کا کلون۔ باقی سب مفت ہے۔',
      freeNow: 'فی الحال تمام پرو فیچرز مفت ہیں۔',
      locked: 'یہ پرو فیچر ہے۔',
      needPlan: 'ایچ ڈی آوازوں اور وائس کلوننگ کے لیے پلان چاہیے۔ نیچے سے چنیں۔',
      noBalance: 'آپ کے پلان میں حروف ختم ہو گئے۔ نیچے سے ٹاپ اپ کریں۔',
      expired: 'آپ کا پلان ختم ہو گیا۔ نیچے سے نیا لیں۔',
      tooLong: 'فری پلان: ایک وائس اوور میں زیادہ سے زیادہ {n} حروف۔ آپ کے متن میں {m} ہیں۔',
      daily: 'فری پلان: روزانہ {n} وائس اوور۔ کل دوبارہ آئیں یا پرو لیں۔',
      list: 'پرو میں شامل ہے:',
      ok: 'بند کریں',
      upgrade: 'پرو لیں',
      perMonth: '/ماہ',
      firstMonth: 'پہلا ماہ',
      save: '{currency} {n} بچت',
      chars: '{n} حروف',
      buy: 'خریدیں',
      back: 'واپس →',
      payTitle: 'ادائیگی کا طریقہ',
      payAmount: '{currency} {n} بھیجیں',
      step1: 'نیچے دیے گئے کسی طریقے سے ادائیگی کریں۔',
      step1Wa: '“واٹس ایپ پر خریدیں” دبائیں — ہم جاز کیش / ایزی پیسہ / بینک کی تفصیل بھیجیں گے۔',
      step2: 'ادائیگی کا اسکرین شاٹ واٹس ایپ پر بھیجیں۔',
      step3: 'آپ کو ایکٹیویشن کوڈ ملے گا۔ اسے نیچے لکھیں — بس!',
      whatsapp: 'واٹس ایپ پر خریدیں',
      waMsg: 'Assalam o Alaikum! I want the VoxNova {plan} plan ({chars} characters). First month: {currency} {price}.',
      copy: 'کاپی',
      copied: 'کاپی ہو گیا',
      offers: 'آفرز',
      haveCode: 'ایکٹیویشن کوڈ ہے؟',
      codePh: 'VS-XXXX-XXXX-XXXX',
      activate: 'فعال کریں',
      checking: 'چیک ہو رہا ہے…',
      active: 'فعال پلان: {plan}',
      left: '{n} حروف باقی',
      until: '{d} تک',
      badCode: 'کوڈ نہیں ملا۔ چیک کر کے دوبارہ کوشش کریں۔',
      offline: 'پلان سرور ابھی منسلک نہیں۔ بعد میں کوشش کریں۔',
      remove: 'کوڈ ہٹائیں',
      mostPopular: 'سب سے مقبول'
    }
  };

  var PRO_KEY = 'voicesync.pro';
  var USAGE_KEY = 'voicesync.usage';
  var CODE_KEY = 'voicesync.proCode';
  var STATUS_KEY = 'voicesync.proStatus';
  var memStore = {};

  function store() {
    try { if (root.localStorage) return root.localStorage; } catch (e) {}
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null; },
      setItem: function (k, v) { memStore[k] = String(v); },
      removeItem: function (k) { delete memStore[k]; }
    };
  }
  function sGet(k) { try { return store().getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { store().setItem(k, v); } catch (e) {} }
  function sDel(k) { try { store().removeItem(k); } catch (e) {} }

  function cfg() {
    var c = (root.VS_CONFIG && root.VS_CONFIG.pro) || {};
    var out = {};
    for (var k in DEFAULTS) out[k] = Object.prototype.hasOwnProperty.call(c, k) ? c[k] : DEFAULTS[k];
    if (!Array.isArray(out.plans) || !out.plans.length) out.plans = DEFAULT_PLANS;
    if (!Array.isArray(out.offers)) out.offers = [];
    out.payment = out.payment || {};
    return out;
  }
  function proxyUrl() {
    try {
      var u = root.VS_CONFIG && root.VS_CONFIG.ttsProxy ? String(root.VS_CONFIG.ttsProxy).trim() : '';
      return u.replace(/\/+$/, '');
    } catch (e) { return ''; }
  }

  function lang() {
    try {
      var l = root.document && root.document.documentElement && root.document.documentElement.lang;
      return l === 'ur' ? 'ur' : 'en';
    } catch (e) { return 'en'; }
  }
  function tx(key, vars) {
    var s = (TXT[lang()] && TXT[lang()][key]) || TXT.en[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }
  function pick(v) { // {en, ur} or plain string
    if (v && typeof v === 'object' && !Array.isArray(v)) return v[lang()] || v.en || '';
    return v == null ? '' : v;
  }
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1000000 && n % 100000 === 0) return (n / 1000000) + 'M';
    try { return n.toLocaleString('en-US'); } catch (e) { return String(n); }
  }
  function fmtMoney(n) {
    try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); }
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* -------------------------- plan status -------------------------- */

  function code() { return sGet(CODE_KEY) || ''; }
  function status() {
    try { return JSON.parse(sGet(STATUS_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveStatus(st) { sSet(STATUS_KEY, JSON.stringify(st)); }
  function planActive() {
    var st = status();
    if (!st || !st.valid) return false;
    if (st.expires && Date.now() > st.expires) return false;
    return (st.remaining | 0) > 0;
  }
  function clearCode() { sDel(CODE_KEY); sDel(STATUS_KEY); refreshBadges(); }

  function askServer(c) {
    var base = proxyUrl();
    if (!base || typeof fetch !== 'function') return Promise.reject(new Error('offline'));
    return fetch(base + '/pro/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: c })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (res.status === 404) { var e = new Error('badCode'); e.kind = 'badCode'; throw e; }
        if (!res.ok) { var e2 = new Error(j.error || 'offline'); e2.kind = 'offline'; throw e2; }
        return j;
      });
    });
  }
  function activate(c) {
    c = String(c || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^VS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)) {
      var e = new Error('badCode'); e.kind = 'badCode'; return Promise.reject(e);
    }
    return askServer(c).then(function (st) {
      sSet(CODE_KEY, c);
      st.checkedAt = Date.now();
      saveStatus(st);
      refreshBadges();
      return st;
    });
  }
  function refresh() {
    var c = code();
    if (!c) return Promise.resolve(null);
    return askServer(c).then(function (st) {
      st.checkedAt = Date.now(); saveStatus(st); refreshBadges(); return st;
    }, function (e) {
      if (e && e.kind === 'badCode') clearCode();
      return status();
    });
  }
  function noteRemaining(n) {
    var st = status();
    if (!st || n === '' || n == null || isNaN(Number(n))) return;
    st.remaining = Number(n);
    st.used = Math.max(0, (st.chars | 0) - st.remaining);
    st.valid = st.remaining > 0 && !(st.expires && Date.now() > st.expires);
    saveStatus(st);
  }

  /* ------------------------ free-tier limits ------------------------ */

  function enforced() { return !!cfg().enforce; }
  function isPro() { return sGet(PRO_KEY) === '1' || planActive(); }
  function isProFeature(f) { return cfg().proFeatures.indexOf(f) !== -1; }

  function can(feature) {
    if (!enforced() || isPro()) return true;
    return !isProFeature(feature);
  }

  function usage() {
    var u = null;
    try { u = JSON.parse(sGet(USAGE_KEY) || 'null'); } catch (e) { u = null; }
    var count = (u && u.day === today()) ? (u.count | 0) : 0;
    return { today: count, limit: cfg().freeDailyGenerations };
  }

  function recordGeneration() {
    var u = usage();
    sSet(USAGE_KEY, JSON.stringify({ day: today(), count: u.today + 1 }));
  }

  function checkGenerate(opts) {
    opts = opts || {};
    var c = cfg();
    if (!can('dialogue') && opts.dialogue) return { ok: false, reason: 'dialogue' };
    if (!can('longText') && (opts.chars | 0) > c.freeMaxChars) {
      return { ok: false, reason: 'longText', chars: opts.chars | 0 };
    }
    if (!can('unlimited') && usage().today >= c.freeDailyGenerations) {
      return { ok: false, reason: 'unlimited' };
    }
    return { ok: true };
  }

  function shouldWatermark() {
    return enforced() && !isPro() && !!cfg().watermarkFreeVideos && isProFeature('noWatermark');
  }

  function drawWatermark(ctx, w, h) {
    if (!ctx || !shouldWatermark()) return;
    try {
      var size = Math.max(14, Math.round(w / 26));
      var label = '🎙 Made with VoxNova';
      ctx.save();
      ctx.font = 'bold ' + size + 'px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      var tw = ctx.measureText(label).width;
      var pad = Math.round(size * 0.5);
      var x = w - pad * 2, y = h - pad * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x - tw - pad, y - size - pad * 0.6, tw + pad * 2, size + pad * 1.4);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(label, x, y);
      ctx.restore();
    } catch (e) { /* never break a video frame over the watermark */ }
  }

  function setPro(on) { sSet(PRO_KEY, on ? '1' : '0'); refreshBadges(); }

  /* ------------------------------ UI ------------------------------ */

  function el(tag, cls, text) {
    var e = root.document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function waLink(text) {
    var num = String(cfg().payment.whatsapp || '').replace(/\D/g, '');
    if (!num) return '';
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  }

  function copyText(t, btn) {
    function done() { if (btn) { var o = btn.textContent; btn.textContent = tx('copied'); setTimeout(function () { btn.textContent = o; }, 1500); } }
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(t).then(done, done); return;
      }
    } catch (e) {}
    done();
  }

  function planCard(plan) {
    var c = cfg(), cur = c.currency || 'Rs';
    var first = plan.firstMonth != null && plan.firstMonth < plan.price ? plan.firstMonth : null;
    var pay = first != null ? first : plan.price;

    var card = el('div', 'plan-card' + (plan.badge ? ' featured' : ''));
    card.setAttribute('data-plan', plan.id || '');
    var inner = el('div', 'plan-inner');

    // FRONT
    var front = el('div', 'plan-face plan-front');
    if (plan.badge) front.appendChild(el('span', 'plan-badge', pick(plan.badge) === 'popular' ? tx('mostPopular') : pick(plan.badge)));
    front.appendChild(el('h3', 'plan-name', pick(plan.name)));
    front.appendChild(el('p', 'plan-chars', tx('chars', { n: fmtNum(plan.chars) })));
    var priceRow = el('p', 'plan-price');
    priceRow.appendChild(el('span', 'plan-cur', cur + ' '));
    priceRow.appendChild(el('span', 'plan-amt', fmtMoney(plan.price)));
    priceRow.appendChild(el('span', 'plan-per', tx('perMonth')));
    front.appendChild(priceRow);
    if (first != null) {
      var fm = el('p', 'plan-first');
      fm.appendChild(el('span', '', tx('firstMonth') + ': '));
      fm.appendChild(el('b', '', cur + ' ' + fmtMoney(first)));
      fm.appendChild(el('span', 'plan-save', tx('save', { currency: cur, n: fmtMoney(plan.price - first) })));
      front.appendChild(fm);
    }
    var perks = (plan.perks && (plan.perks[lang()] || plan.perks.en)) || [];
    if (perks.length) {
      var ul = el('ul', 'plan-perks');
      perks.forEach(function (p) { ul.appendChild(el('li', '', p)); });
      front.appendChild(ul);
    }
    var buy = el('button', 'btn btn-primary plan-buy', tx('buy'));
    buy.type = 'button';
    front.appendChild(buy);

    // BACK
    var back = el('div', 'plan-face plan-back');
    back.appendChild(el('h3', 'plan-name', pick(plan.name) + ' • ' + tx('payTitle')));
    back.appendChild(el('p', 'plan-pay-amt', tx('payAmount', { currency: cur, n: fmtMoney(pay) })));
    var methods = (c.payment.methods || []).filter(function (m) { return m && m.value; });
    var steps = el('ol', 'plan-steps');
    [methods.length ? 'step1' : 'step1Wa', 'step2', 'step3'].forEach(function (k) { steps.appendChild(el('li', '', tx(k))); });
    back.appendChild(steps);
    if (methods.length) {
      var box = el('div', 'pay-methods');
      methods.forEach(function (m) {
        var row = el('div', 'pay-row');
        var txt = el('div', 'pay-txt');
        txt.appendChild(el('span', 'pay-label', pick(m.label)));
        txt.appendChild(el('span', 'pay-val', m.value));
        if (m.name) txt.appendChild(el('span', 'pay-name', m.name));
        row.appendChild(txt);
        var cp = el('button', 'btn btn-secondary btn-small', tx('copy'));
        cp.type = 'button';
        cp.addEventListener('click', function () { copyText(m.value, cp); });
        row.appendChild(cp);
        box.appendChild(row);
      });
      back.appendChild(box);
    }
    var wa = waLink(tx('waMsg', { plan: pick(plan.name), chars: fmtNum(plan.chars), currency: cur, price: fmtMoney(pay) }));
    if (wa) {
      var a = el('a', 'btn plan-wa', '💬 ' + tx('whatsapp'));
      a.href = wa; a.target = '_blank'; a.rel = 'noopener';
      back.appendChild(a);
    }
    var bk = el('button', 'btn btn-secondary plan-back-btn', tx('back'));
    bk.type = 'button';
    back.appendChild(bk);

    buy.addEventListener('click', function () { card.classList.add('flipped'); });
    bk.addEventListener('click', function () { card.classList.remove('flipped'); });

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);
    return card;
  }

  function codeBox() {
    var box = el('div', 'pro-code');
    var st = status(), c = code();
    function renderStatus(target, s) {
      target.innerHTML = '';
      if (!s) return;
      var line = el('p', 'pro-status' + (planActive() ? ' ok' : ' warn'));
      line.appendChild(el('b', '', tx('active', { plan: s.plan || '' })));
      line.appendChild(el('span', '', ' • ' + tx('left', { n: fmtNum(s.remaining | 0) })));
      if (s.expires) {
        var d = new Date(s.expires);
        line.appendChild(el('span', '', ' • ' + tx('until', { d: d.toLocaleDateString() })));
      }
      target.appendChild(line);
    }
    box.appendChild(el('h3', 'pro-code-h', tx('haveCode')));
    var row = el('div', 'pro-code-row');
    var input = el('input', 'char-search pro-code-input');
    input.type = 'text'; input.placeholder = tx('codePh'); input.value = c;
    input.setAttribute('autocapitalize', 'characters'); input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', tx('haveCode'));
    var btn = el('button', 'btn btn-primary', tx('activate'));
    btn.type = 'button';
    row.appendChild(input); row.appendChild(btn);
    box.appendChild(row);
    var msg = el('p', 'pro-code-msg');
    box.appendChild(msg);
    var stBox = el('div', '');
    box.appendChild(stBox);
    renderStatus(stBox, st);
    if (c) {
      var rm = el('button', 'btn btn-secondary btn-small', tx('remove'));
      rm.type = 'button';
      rm.addEventListener('click', function () { clearCode(); input.value = ''; stBox.innerHTML = ''; msg.textContent = ''; });
      box.appendChild(rm);
      refresh().then(function (s) { renderStatus(stBox, s); });
    }
    btn.addEventListener('click', function () {
      msg.textContent = tx('checking'); msg.className = 'pro-code-msg';
      btn.disabled = true;
      activate(input.value).then(function (s) {
        msg.textContent = '';
        renderStatus(stBox, s);
        input.value = code();
      }, function (e) {
        msg.textContent = (e && e.kind === 'badCode') ? tx('badCode') : tx('offline');
        msg.className = 'pro-code-msg err';
      }).then(function () { btn.disabled = false; });
    });
    return box;
  }

  function showPlans(reason, chars) {
    var doc = root.document;
    if (!doc || !doc.body) return;
    var old = doc.getElementById('proSheet');
    if (old) old.parentNode.removeChild(old);
    var c = cfg(), L = lang();

    var wrap = el('div', 'pro-backdrop');
    wrap.id = 'proSheet';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', tx('title'));
    wrap.setAttribute('dir', L === 'ur' ? 'rtl' : 'ltr');
    var card = el('div', 'pro-sheet');
    var head = el('div', 'pro-head');
    head.appendChild(el('h2', 'pro-title', '★ ' + tx('title')));
    var x = el('button', 'pro-x', '×');
    x.type = 'button'; x.setAttribute('aria-label', tx('ok'));
    head.appendChild(x);
    card.appendChild(head);
    card.appendChild(el('p', 'pro-sub', tx('sub')));

    var msg = '';
    if (reason === 'needPlan' || reason === 'hd' || reason === 'clone') msg = tx('needPlan');
    else if (reason === 'noBalance') msg = tx('noBalance');
    else if (reason === 'expired') msg = tx('expired');
    else if (enforced() && !isPro()) {
      if (reason === 'longText') msg = tx('tooLong', { n: c.freeMaxChars, m: chars || '' });
      else if (reason === 'unlimited') msg = tx('daily', { n: c.freeDailyGenerations });
      else if (FEATURES[reason]) msg = tx('locked') + ' (' + FEATURES[reason][L] + ')';
    }
    if (msg) card.appendChild(el('p', 'pro-msg', msg));

    var grid = el('div', 'plan-grid');
    c.plans.forEach(function (p) { grid.appendChild(planCard(p)); });
    card.appendChild(grid);

    var offers = c.offers.map(pick).filter(Boolean);
    if (offers.length) {
      var ob = el('div', 'pro-offers');
      ob.appendChild(el('h3', '', '🎁 ' + tx('offers')));
      var ul = el('ul', '');
      offers.forEach(function (o) { ul.appendChild(el('li', '', o)); });
      ob.appendChild(ul);
      card.appendChild(ob);
    }

    card.appendChild(codeBox());

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); doc.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    doc.addEventListener('keydown', onKey);
    wrap.appendChild(card);
    doc.body.appendChild(wrap);
    try { x.focus(); } catch (e) {}
  }
  function showUpsell(reason, chars) { showPlans(reason, chars); }

  // Where the PRO chip goes, per feature (only shown for features in proFeatures).
  var CHIP_TARGETS = [
    { feature: 'dialogue', sel: '#dialogueMode', parent: true },
    { feature: 'music', sel: '#btnMusicPick' },
    { feature: 'shorts', sel: '#videoFormat', after: true },
    { feature: 'clone', sel: '#btnClonePremium', after: true }
  ];

  function refreshBadges() {
    var doc = root.document;
    if (!doc || !doc.querySelectorAll) return;
    var chips = doc.querySelectorAll('.pro-chip');
    for (var i = 0; i < chips.length; i++) chips[i].parentNode.removeChild(chips[i]);
    // Header "Plans" button (always available).
    var bar = doc.querySelector('.topbar-actions');
    if (bar) {
      var pb = doc.getElementById('btnPlans');
      if (!pb) {
        pb = el('button', 'btn btn-small plans-btn');
        pb.id = 'btnPlans'; pb.type = 'button';
        pb.addEventListener('click', function () { showPlans(); });
        bar.insertBefore(pb, bar.firstChild);
      }
      pb.textContent = '⭐ ' + tx('plansBtn');
      pb.classList.toggle('active', planActive());
    }
    if (!cfg().showBadges || isPro()) return;
    CHIP_TARGETS.forEach(function (t) {
      if (!isProFeature(t.feature)) return;
      var target = doc.querySelector(t.sel);
      if (!target) return;
      var paid = t.feature === 'clone' || t.feature === 'hd';
      var chip = el('span', 'pro-chip' + (enforced() || paid ? ' locked' : ''), tx('chip'));
      chip.title = paid ? tx('chipPaid') : (enforced() ? tx('locked') : tx('chipFree'));
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); showPlans(t.feature); });
      if (t.parent && target.parentNode) target.parentNode.appendChild(chip);
      else if (t.after && target.parentNode) target.parentNode.insertBefore(chip, target.nextSibling);
      else target.appendChild(chip);
    });
  }

  // Block Pro-only controls for free users (only when enforce is on).
  function installGuards() {
    var doc = root.document;
    if (!doc) return;
    function block(e, feature) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showPlans(feature);
    }
    var dlg = doc.getElementById('dialogueMode');
    if (dlg) dlg.addEventListener('click', function (e) {
      if (dlg.checked && !can('dialogue')) block(e, 'dialogue');
    }, true);
    var mus = doc.getElementById('btnMusicPick');
    if (mus) mus.addEventListener('click', function (e) {
      if (!can('music')) block(e, 'music');
    }, true);
    var fmt = doc.getElementById('videoFormat');
    if (fmt) fmt.addEventListener('change', function (e) {
      if (fmt.value === 'portrait' && !can('shorts')) { fmt.value = 'square'; block(e, 'shorts'); }
    }, true);
  }

  function init() {
    refreshBadges();
    installGuards();
    try {
      new root.MutationObserver(refreshBadges)
        .observe(root.document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    } catch (e) {}
    if (code()) refresh();
  }

  var Pro = {
    FEATURES: FEATURES,
    enforced: enforced,
    isPro: isPro,
    can: can,
    checkGenerate: checkGenerate,
    recordGeneration: recordGeneration,
    usage: usage,
    shouldWatermark: shouldWatermark,
    drawWatermark: drawWatermark,
    code: code,
    status: status,
    planActive: planActive,
    activate: activate,
    refresh: refresh,
    noteRemaining: noteRemaining,
    clearCode: clearCode,
    showPlans: showPlans,
    showUpsell: showUpsell,
    setPro: setPro,
    refreshBadges: refreshBadges,
    _config: cfg
  };

  root.Pro = Pro;
  if (typeof module !== 'undefined' && module.exports) module.exports = Pro;

  if (root.document && root.document.addEventListener) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
