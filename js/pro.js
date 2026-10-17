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
    freeTrialChars: 10000,
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
      title: 'VoxNova Pro',
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
      mostPopular: 'Most popular',
      freeName: 'Free',
      freeChars: '{n} HD characters FREE',
      freeStart: 'Start free',
      freeActive: 'Free plan active',
      freeUsed: 'Your free characters are used up. Pick a plan to continue.',
      freeLimit: 'Free trial already used on this network today. Try tomorrow or pick a plan.',
      freePerks: ['No payment needed', 'Try HD voices + cloning', 'Then subscribe on WhatsApp'],
      reqTitle: 'Request this plan',
      reqName: 'Your name',
      reqPhone: 'WhatsApp number',
      reqMethod: 'Paid with',
      reqTid: 'Transaction ID (TID)',
      reqShot: 'Payment screenshot (optional)',
      reqSend: 'Send request',
      reqSending: 'Sending\u2026',
      reqSent: 'Request {id} sent! We check your payment and your plan turns on by itself.',
      reqPending: 'Request {id} ({plan}) is waiting for approval.',
      reqApproved: 'Approved! Your {plan} plan is now active.',
      reqRejected: 'Request {id} was not approved: {reason}',
      reqNeed: 'Please fill: {f}',
      reqWa: 'Send request ID on WhatsApp',
      reqWaMsg: 'Assalam o Alaikum! I sent VoxNova subscription request {id} ({plan}, {currency} {price}). TID: {tid}',
      payStep1: 'Pay the amount (JazzCash / Easypaisa / bank).',
      payStep2: 'Fill the form below and send the request.',
      payStep3: 'We verify it \u2014 your plan turns on by itself.',
      methods: ['JazzCash', 'Easypaisa', 'Bank transfer', 'Other'],
      askDetails: 'Need payment details? Ask on WhatsApp',
      _end: ''
    },
    ur: {
      chip: 'PRO',
      chipFree: 'پرو فیچر، فی الحال مفت',
      chipPaid: 'پلان چاہیے',
      plansBtn: 'پلان',
      title: 'ووکس نووا پرو',
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
      mostPopular: 'سب سے مقبول',
      freeName: 'مفت',
      freeChars: '{n} ایچ ڈی حروف مفت',
      freeStart: 'مفت شروع کریں',
      freeActive: 'مفت پلان فعال',
      freeUsed: 'آپ کے مفت حروف ختم ہو گئے۔ جاری رکھنے کے لیے پلان چنیں۔',
      freeLimit: 'اس نیٹ ورک پر آج مفت ٹرائل استعمال ہو چکا۔ کل کوشش کریں یا پلان چنیں۔',
      freePerks: ['کوئی ادائیگی نہیں', 'ایچ ڈی آوازیں اور کلوننگ آزمائیں', 'پھر واٹس ایپ پر سبسکرائب کریں'],
      reqTitle: 'یہ پلان منگوائیں',
      reqName: 'آپ کا نام',
      reqPhone: 'واٹس ایپ نمبر',
      reqMethod: 'ادائیگی کا ذریعہ',
      reqTid: 'ٹرانزیکشن آئی ڈی (TID)',
      reqShot: 'ادائیگی کا اسکرین شاٹ (اختیاری)',
      reqSend: 'درخواست بھیجیں',
      reqSending: 'بھیجی جا رہی ہے\u2026',
      reqSent: 'درخواست {id} بھیج دی گئی! ہم ادائیگی چیک کریں گے اور آپ کا پلان خود فعال ہو جائے گا۔',
      reqPending: 'درخواست {id} ({plan}) منظوری کے انتظار میں ہے۔',
      reqApproved: 'منظور! آپ کا {plan} پلان فعال ہو گیا۔',
      reqRejected: 'درخواست {id} منظور نہیں ہوئی: {reason}',
      reqNeed: 'براہ کرم بھریں: {f}',
      reqWa: 'درخواست آئی ڈی واٹس ایپ پر بھیجیں',
      reqWaMsg: 'Assalam o Alaikum! I sent VoxNova subscription request {id} ({plan}, {currency} {price}). TID: {tid}',
      payStep1: 'رقم ادا کریں (جاز کیش / ایزی پیسہ / بینک)۔',
      payStep2: 'نیچے فارم بھر کر درخواست بھیجیں۔',
      payStep3: 'ہم تصدیق کریں گے — آپ کا پلان خود فعال ہو جائے گا۔',
      methods: ['جاز کیش', 'ایزی پیسہ', 'بینک ٹرانسفر', 'دیگر'],
      askDetails: 'ادائیگی کی تفصیل چاہیے؟ واٹس ایپ پر پوچھیں',
      _end: ''
    }
  };

  var PRO_KEY = 'voicesync.pro';
  var USAGE_KEY = 'voicesync.usage';
  var CODE_KEY = 'voicesync.proCode';
  var STATUS_KEY = 'voicesync.proStatus';
  var DEVICE_KEY = 'voicesync.device';
  var REQ_KEY = 'voicesync.proRequest';
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
    // Prices and payment accounts set on the admin page win over config.js.
    var lv = livePlans();
    if (lv) {
      if (Array.isArray(lv.plans) && lv.plans.length) out.plans = mergePlans(lv.plans, out.plans);
      if (lv.payment && typeof lv.payment === 'object') out.payment = lv.payment;
      if (Number(lv.freeTrialChars) > 0) out.freeTrialChars = Number(lv.freeTrialChars);
    }
    return out;
  }

  // ---- live plans from the server (GET /pro/plans) ----
  var LIVE_KEY = 'voicesync.livePlans';
  var liveCache = null;
  function livePlans() {
    if (liveCache) return liveCache;
    var raw = sGet(LIVE_KEY);
    if (!raw) return null;
    try { liveCache = JSON.parse(raw); } catch (e) { liveCache = null; }
    return liveCache;
  }
  function autoPerks(chars) {
    var n = fmtNum(chars), clones = chars >= 10000000 ? 50 : 20;
    return {
      en: [n + ' HD characters / month', 'Clone up to ' + clones + ' voices', 'Urdu + 60 languages', 'WhatsApp support'],
      ur: [n + ' ایچ ڈی حروف / ماہ', clones + ' تک آوازیں کلون کریں', 'اردو + 60 زبانیں', 'واٹس ایپ سپورٹ']
    };
  }
  function mergePlans(server, local) {
    var byId = {};
    (local || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });
    return server.filter(function (p) { return p && Number(p.price) > 0 && Number(p.chars) > 0; }).map(function (p) {
      var l = byId[p.id] || {};
      // Keep hand-written perks only while the characters are unchanged.
      var perks = l.perks && Number(l.chars) === Number(p.chars) ? l.perks : autoPerks(Number(p.chars));
      return { id: p.id, name: p.name, chars: Number(p.chars), price: Number(p.price), firstMonth: Number(p.firstMonth) || Number(p.price), badge: p.badge || '', perks: perks };
    });
  }
  function loadLivePlans() {
    var base = proxyUrl();
    if (!base || typeof root.fetch !== 'function') return Promise.resolve(null);
    return root.fetch(base + '/pro/plans', { method: 'GET' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !Array.isArray(j.plans)) return null;
      var keep = { plans: j.plans, payment: j.payment || null, ticker: j.ticker || null, freeTrialChars: j.freeTrialChars, at: Date.now() };
      var changed = JSON.stringify(keep.plans) + JSON.stringify(keep.payment) !== JSON.stringify((liveCache || {}).plans) + JSON.stringify((liveCache || {}).payment || null);
      liveCache = keep; sSet(LIVE_KEY, JSON.stringify(keep));
      try { root.dispatchEvent(new root.CustomEvent('vs:live', { detail: keep })); } catch (e) {}
      // Re-draw an open plans sheet so new prices show at once.
      if (changed && root.document && root.document.getElementById('proSheet') && !root.document.querySelector('#proSheet form.req-form')) showPlans();
      return keep;
    }).catch(function () { return null; });
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
  function txa(key) {
    var v = (TXT[lang()] && TXT[lang()][key]) || TXT.en[key];
    return Array.isArray(v) ? v : [];
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
  function deviceId() {
    var d = sGet(DEVICE_KEY);
    if (d && /^[A-Za-z0-9_-]{16,64}$/.test(d)) return d;
    var a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', out = '';
    try {
      var b = new Uint8Array(24); root.crypto.getRandomValues(b);
      for (var i = 0; i < 24; i++) out += a[b[i] % a.length];
    } catch (e) {
      for (var k = 0; k < 24; k++) out += a[Math.floor(Math.random() * a.length)];
    }
    sSet(DEVICE_KEY, out);
    return out;
  }
  function post(path, body) {
    var base = proxyUrl();
    if (!base || typeof fetch !== 'function') { var e0 = new Error('offline'); e0.kind = 'offline'; return Promise.reject(e0); }
    return fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { var e = new Error(j.error || ('HTTP ' + res.status)); e.status = res.status; e.code = j.code; e.field = j.field; e.kind = res.status === 404 ? 'badCode' : 'server'; throw e; }
        return j;
      });
    }, function () { var e2 = new Error('offline'); e2.kind = 'offline'; throw e2; });
  }
  // Free trial: the API gives each device freeTrialChars HD characters once.
  function startTrial() {
    return post('/pro/trial', { device: deviceId() }).then(function (st) {
      if (st && st.code) { sSet(CODE_KEY, st.code); st.checkedAt = Date.now(); saveStatus(st); refreshBadges(); }
      return st;
    });
  }
  // Make sure HD voices can be used: existing code, else the free trial.
  function ensureAccess() {
    if (code() && planActive()) return Promise.resolve(status());
    if (code()) return refresh().then(function (st) {
      if (st && st.valid) return st;
      var e = new Error('noBalance'); e.kind = (st && st.expired) ? 'expired' : (st && st.plan === 'Free' ? 'freeUsed' : 'noBalance'); throw e;
    });
    return startTrial().then(function (st) {
      if (st && st.valid) return st;
      var e = new Error('freeUsed'); e.kind = 'freeUsed'; throw e;
    });
  }

  // Subscription request (customer -> admin approves -> code arrives here).
  function pendingRequest() { try { return JSON.parse(sGet(REQ_KEY) || 'null'); } catch (e) { return null; } }
  function sendRequest(data) {
    var body = {
      name: data.name, phone: data.phone, plan: data.plan, chars: data.chars, price: data.price,
      method: data.method, tid: data.tid, screenshot: data.screenshot || '', device: deviceId()
    };
    return post('/pro/request', body).then(function (r) {
      var rec = { id: r.id, secret: r.secret, plan: data.plan, price: data.price, tid: data.tid, status: 'pending', at: Date.now() };
      sSet(REQ_KEY, JSON.stringify(rec));
      refreshBadges(); schedulePoll();
      return rec;
    });
  }
  var _pollTimer = null;
  function checkRequest() {
    var r = pendingRequest();
    if (!r || r.status !== 'pending') return Promise.resolve(r);
    return post('/pro/request/status', { id: r.id, secret: r.secret }).then(function (st) {
      r.status = st.status; r.reason = st.reason || '';
      sSet(REQ_KEY, JSON.stringify(r));
      if (st.status === 'approved' && st.code) {
        return activate(st.code).then(function () {
          r.activated = true; sSet(REQ_KEY, JSON.stringify(r));
          notify(tx('reqApproved', { plan: r.plan })); return r;
        }, function () { return r; });
      }
      if (st.status === 'rejected') notify(tx('reqRejected', { id: r.id, reason: r.reason || '\u2014' }));
      refreshBadges();
      return r;
    }, function (e) { if (e && e.kind === 'badCode') { sDel(REQ_KEY); refreshBadges(); } return r; });
  }
  function schedulePoll() {
    if (_pollTimer || typeof setInterval !== 'function') return;
    _pollTimer = setInterval(function () {
      var r = pendingRequest();
      if (!r || r.status !== 'pending') { clearInterval(_pollTimer); _pollTimer = null; return; }
      checkRequest();
    }, 30000);
  }
  function notify(msg) {
    try {
      var d = root.document; if (!d || !d.body) return;
      var t = el('div', 'pro-toast', msg);
      t.setAttribute('role', 'status');
      d.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
    } catch (e) {}
  }
  // Shrink a payment screenshot to a small JPEG data URL (fits the API limit).
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(''); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('read')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('image')); };
        img.onload = function () {
          var max = 1280, q = 0.72, out = '';
          for (var round = 0; round < 6; round++) {
            var sc = Math.min(1, max / Math.max(img.width, img.height));
            var cv = root.document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            out = cv.toDataURL('image/jpeg', q);
            if (out.length <= 440 * 1024) break;
            max = Math.round(max * 0.75); q = Math.max(0.45, q - 0.08);
          }
          resolve(out.length <= 440 * 1024 ? out : '');
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
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
    ['payStep1', 'payStep2', 'payStep3'].forEach(function (k) { steps.appendChild(el('li', '', tx(k))); });
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
    if (!methods.length) {
      var waAsk = waLink(tx('waMsg', { plan: pick(plan.name), chars: fmtNum(plan.chars), currency: cur, price: fmtMoney(pay) }));
      if (waAsk) {
        var a = el('a', 'btn plan-wa', '\uD83D\uDCAC ' + tx('askDetails'));
        a.href = waAsk; a.target = '_blank'; a.rel = 'noopener';
        back.appendChild(a);
      }
    }
    back.appendChild(requestForm(plan, pay));
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

  function field(labelText, input) {
    var w = el('label', 'req-field');
    w.appendChild(el('span', 'req-label', labelText));
    w.appendChild(input);
    return w;
  }
  function requestForm(plan, pay) {
    var c = cfg(), cur = c.currency || 'Rs';
    var f = el('form', 'req-form');
    f.setAttribute('novalidate', '');
    f.appendChild(el('h4', 'req-title', tx('reqTitle')));
    var nm = el('input', 'char-search'); nm.type = 'text'; nm.maxLength = 60; nm.autocomplete = 'name';
    var ph = el('input', 'char-search'); ph.type = 'tel'; ph.inputMode = 'tel'; ph.placeholder = '03xx xxxxxxx'; ph.autocomplete = 'tel';
    var me = el('select', 'select');
    var payNames = ((c.payment && c.payment.methods) || []).filter(function (m) { return m && m.value; }).map(function (m) { return pick(m.label); }).filter(Boolean);
    (payNames.length ? payNames.concat([txa('methods').slice(-1)[0]]) : txa('methods')).forEach(function (m) { var o = el('option', '', m); o.value = m; me.appendChild(o); });
    var ti = el('input', 'char-search'); ti.type = 'text'; ti.maxLength = 60;
    var sh = el('input', 'req-file'); sh.type = 'file'; sh.accept = 'image/*';
    f.appendChild(field(tx('reqName'), nm));
    f.appendChild(field(tx('reqPhone'), ph));
    f.appendChild(field(tx('reqMethod'), me));
    f.appendChild(field(tx('reqTid'), ti));
    f.appendChild(field(tx('reqShot'), sh));
    var send = el('button', 'btn btn-primary req-send', tx('reqSend')); send.type = 'submit';
    var msg = el('p', 'req-msg');
    var after = el('div', 'req-after');
    f.appendChild(send); f.appendChild(msg); f.appendChild(after);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var miss = [];
      if (nm.value.trim().length < 2) miss.push(tx('reqName'));
      if (ph.value.replace(/\D/g, '').length < 10) miss.push(tx('reqPhone'));
      if (!ti.value.trim() && !(sh.files && sh.files[0])) miss.push(tx('reqTid'));
      if (miss.length) { msg.textContent = tx('reqNeed', { f: miss.join(', ') }); msg.className = 'req-msg err'; return; }
      send.disabled = true; msg.textContent = tx('reqSending'); msg.className = 'req-msg';
      shrinkImage(sh.files && sh.files[0]).catch(function () { return ''; }).then(function (img) {
        return sendRequest({
          name: nm.value.trim(), phone: ph.value.trim(), plan: pick(plan.name), chars: plan.chars,
          price: pay, method: me.value, tid: ti.value.trim(), screenshot: img
        });
      }).then(function (r) {
        msg.textContent = tx('reqSent', { id: r.id }); msg.className = 'req-msg ok';
        after.innerHTML = '';
        var wa = waLink(tx('reqWaMsg', { id: r.id, plan: r.plan, currency: cur, price: fmtMoney(r.price), tid: r.tid || '\u2014' }));
        if (wa) { var a = el('a', 'btn plan-wa', '\uD83D\uDCAC ' + tx('reqWa')); a.href = wa; a.target = '_blank'; a.rel = 'noopener'; after.appendChild(a); }
      }, function (err) {
        msg.textContent = err && err.kind === 'offline' ? tx('offline') : ((err && err.message) || tx('offline'));
        msg.className = 'req-msg err';
      }).then(function () { send.disabled = false; });
    });
    return f;
  }

  function freeCard() {
    var c = cfg(), n = Number(c.freeTrialChars) || 10000;
    var card = el('div', 'plan-card plan-free');
    card.setAttribute('data-plan', 'free');
    var inner = el('div', 'plan-inner');
    var front = el('div', 'plan-face plan-front');
    front.appendChild(el('span', 'plan-badge free', tx('freeName')));
    front.appendChild(el('h3', 'plan-name', tx('freeChars', { n: fmtMoney(n) })));
    var priceRow = el('p', 'plan-price');
    priceRow.appendChild(el('span', 'plan-cur', (c.currency || 'Rs') + ' '));
    priceRow.appendChild(el('span', 'plan-amt', '0'));
    front.appendChild(priceRow);
    var ul = el('ul', 'plan-perks');
    txa('freePerks').forEach(function (p) { ul.appendChild(el('li', '', p)); });
    front.appendChild(ul);
    var msg = el('p', 'req-msg');
    var st = status();
    var btn = el('button', 'btn btn-primary plan-buy', tx('freeStart')); btn.type = 'button';
    if (code() && st) {
      btn.disabled = true;
      btn.textContent = st.plan === 'Free' ? (planActive() ? tx('freeActive') : tx('freeUsed')) : tx('active', { plan: st.plan || '' });
    }
    btn.addEventListener('click', function () {
      btn.disabled = true; msg.textContent = tx('checking'); msg.className = 'req-msg';
      startTrial().then(function (s2) {
        msg.textContent = ''; btn.textContent = tx('freeActive');
        var box = root.document.querySelector('#proSheet .pro-code');
        if (box && box.parentNode) box.parentNode.replaceChild(codeBox(), box);
        notify(tx('freeActive') + ' \u2022 ' + tx('left', { n: fmtNum(s2.remaining | 0) }));
      }, function (e) {
        btn.disabled = false;
        msg.textContent = e && e.code === 'TRIAL_LIMIT' ? tx('freeLimit') : (e && e.kind === 'offline' ? tx('offline') : ((e && e.message) || tx('offline')));
        msg.className = 'req-msg err';
      });
    });
    front.appendChild(btn); front.appendChild(msg);
    inner.appendChild(front); card.appendChild(inner);
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
    var pr = pendingRequest();
    if (pr && !pr.activated) {
      var line = pr.status === 'rejected' ? tx('reqRejected', { id: pr.id, reason: pr.reason || '\u2014' })
        : pr.status === 'approved' ? tx('reqApproved', { plan: pr.plan }) : tx('reqPending', { id: pr.id, plan: pr.plan });
      box.appendChild(el('p', 'pro-status ' + (pr.status === 'rejected' ? 'warn' : 'ok'), line));
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
    else if (reason === 'freeUsed') msg = tx('freeUsed');
    else if (reason === 'expired') msg = tx('expired');
    else if (enforced() && !isPro()) {
      if (reason === 'longText') msg = tx('tooLong', { n: c.freeMaxChars, m: chars || '' });
      else if (reason === 'unlimited') msg = tx('daily', { n: c.freeDailyGenerations });
      else if (FEATURES[reason]) msg = tx('locked') + ' (' + FEATURES[reason][L] + ')';
    }
    if (msg) card.appendChild(el('p', 'pro-msg', msg));

    var grid = el('div', 'plan-grid');
    if (Number(c.freeTrialChars) > 0) grid.appendChild(freeCard());
    c.plans.forEach(function (p) { if (p && p.price > 0) grid.appendChild(planCard(p)); });
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
      var prq = pendingRequest();
      pb.classList.toggle('pending', !!(prq && prq.status === 'pending'));
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
    // Every user gets the free characters on first open (one per device), so
    // they also show up as a user in the admin dashboard. Silent on failure.
    if (code()) refresh();
    else if (proxyUrl()) startTrial().catch(function () {});
    loadLivePlans();
    var pr = pendingRequest();
    if (pr && pr.status === 'pending') { checkRequest(); schedulePoll(); }
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
    deviceId: deviceId,
    startTrial: startTrial,
    ensureAccess: ensureAccess,
    sendRequest: sendRequest,
    pendingRequest: pendingRequest,
    checkRequest: checkRequest,
    clearCode: clearCode,
    showPlans: showPlans,
    showUpsell: showUpsell,
    setPro: setPro,
    refreshBadges: refreshBadges,
    loadLivePlans: loadLivePlans,
    liveData: livePlans,
    _config: cfg
  };

  root.Pro = Pro;
  if (typeof module !== 'undefined' && module.exports) module.exports = Pro;

  if (root.document && root.document.addEventListener) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
