/*
 * VoiceSync Studio: Pro / free-tier framework.
 *
 * Everything is FREE today. This file only gets the app ready for a paid
 * tier later, so turning Pro on is a one-line change in js/config.js:
 *
 *   window.VS_CONFIG.pro.enforce = true;
 *
 * While enforce is false:  Pro.can() is always true, no limits, no watermark.
 *                          Features only show a small "PRO" chip.
 * When enforce is true:    free users get the limits below; Pro users don't.
 *
 * Public API (window.Pro):
 *   Pro.enforced()                    -> bool  (limits switched on?)
 *   Pro.isPro()                       -> bool  (this user has Pro)
 *   Pro.can(feature)                  -> bool  (may this user use feature?)
 *   Pro.checkGenerate({chars, dialogue}) -> {ok, reason}   (call before TTS)
 *   Pro.recordGeneration()            -> counts today's generations
 *   Pro.usage()                       -> {today, limit}
 *   Pro.shouldWatermark()             -> bool
 *   Pro.drawWatermark(ctx, w, h)      -> draws "Made with VoiceSync" on a frame
 *   Pro.showUpsell(reason, chars)     -> opens the Pro sheet
 *   Pro.setPro(bool)                  -> TEST ONLY (local flag, see note)
 *
 * SECURITY NOTE: the Pro flag is stored on the device (localStorage) for
 * now. That is fine while everything is free, but anyone can flip it.
 * Before charging money, Pro status must come from a server that verified
 * the purchase (Google Play Billing on Android). Replace isPro() then.
 */
(function (root) {
  'use strict';

  var FEATURES = {
    longText:    { en: 'Long scripts (no character limit)', ur: 'لمبی اسکرپٹ (حروف کی کوئی حد نہیں)' },
    unlimited:   { en: 'Unlimited voiceovers per day',      ur: 'روزانہ لامحدود وائس اوور' },
    noWatermark: { en: 'Videos without watermark',          ur: 'واٹر مارک کے بغیر ویڈیو' },
    dialogue:    { en: 'Dialogue mode (two voices)',        ur: 'ڈائیلاگ موڈ (دو آوازیں)' },
    music:       { en: 'Background music',                  ur: 'بیک گراؤنڈ میوزک' },
    shorts:      { en: 'Shorts / Reels 9:16 with captions', ur: 'شارٹس / ریلز 9:16 کیپشن کے ساتھ' },
    clone:       { en: 'Voice cloning',                     ur: 'وائس کلوننگ' }
  };

  var DEFAULTS = {
    enforce: false,
    showBadges: true,
    freeMaxChars: 1500,
    freeDailyGenerations: 15,
    watermarkFreeVideos: true,
    proFeatures: ['longText', 'unlimited', 'noWatermark', 'dialogue', 'music', 'shorts', 'clone'],
    upgradeUrl: ''
  };

  var TXT = {
    en: {
      chip: 'PRO',
      chipFree: 'Pro feature, free for now',
      title: 'VoiceSync Pro',
      freeNow: 'Right now every Pro feature is FREE. Enjoy!',
      locked: 'This is a Pro feature.',
      tooLong: 'Free plan: up to {n} characters per voiceover. Your text has {m}.',
      daily: 'Free plan: {n} voiceovers per day. Come back tomorrow, or get Pro.',
      list: 'Pro includes:',
      ok: 'OK',
      upgrade: 'Get Pro'
    },
    ur: {
      chip: 'PRO',
      chipFree: 'پرو فیچر، فی الحال مفت',
      title: 'وائس سنک پرو',
      freeNow: 'فی الحال تمام پرو فیچرز مفت ہیں۔',
      locked: 'یہ پرو فیچر ہے۔',
      tooLong: 'فری پلان: ایک وائس اوور میں زیادہ سے زیادہ {n} حروف۔ آپ کے متن میں {m} ہیں۔',
      daily: 'فری پلان: روزانہ {n} وائس اوور۔ کل دوبارہ آئیں یا پرو لیں۔',
      list: 'پرو میں شامل ہے:',
      ok: 'ٹھیک ہے',
      upgrade: 'پرو لیں'
    }
  };

  var PRO_KEY = 'voicesync.pro';
  var USAGE_KEY = 'voicesync.usage';
  var memStore = {};

  function store() {
    try { if (root.localStorage) return root.localStorage; } catch (e) {}
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null; },
      setItem: function (k, v) { memStore[k] = String(v); }
    };
  }
  function sGet(k) { try { return store().getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { store().setItem(k, v); } catch (e) {} }

  function cfg() {
    var c = (root.VS_CONFIG && root.VS_CONFIG.pro) || {};
    var out = {};
    for (var k in DEFAULTS) out[k] = Object.prototype.hasOwnProperty.call(c, k) ? c[k] : DEFAULTS[k];
    return out;
  }

  function lang() {
    try {
      var l = root.document && root.document.documentElement && root.document.documentElement.lang;
      return l === 'ur' ? 'ur' : 'en';
    } catch (e) { return 'en'; }
  }
  function tx(key) { return (TXT[lang()] && TXT[lang()][key]) || TXT.en[key] || key; }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function enforced() { return !!cfg().enforce; }
  function isPro() { return sGet(PRO_KEY) === '1'; }
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
      var label = '🎙 Made with VoiceSync Studio';
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

  function showUpsell(reason, chars) {
    var doc = root.document;
    if (!doc || !doc.body) return;
    var old = doc.getElementById('proSheet');
    if (old) old.parentNode.removeChild(old);
    var c = cfg(), L = lang();

    var wrap = el('div', 'pro-backdrop');
    wrap.id = 'proSheet';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('dir', L === 'ur' ? 'rtl' : 'ltr');
    var card = el('div', 'pro-sheet');
    card.appendChild(el('h2', 'pro-title', '★ ' + tx('title')));

    var msg = '';
    if (!enforced() || isPro()) msg = tx('freeNow');
    else if (reason === 'longText') {
      msg = tx('tooLong').replace('{n}', String(c.freeMaxChars)).replace('{m}', String(chars || ''));
    } else if (reason === 'unlimited') msg = tx('daily').replace('{n}', String(c.freeDailyGenerations));
    else msg = tx('locked') + (FEATURES[reason] ? ' (' + FEATURES[reason][L] + ')' : '');
    card.appendChild(el('p', 'pro-msg', msg));

    card.appendChild(el('p', 'pro-list-h', tx('list')));
    var ul = el('ul', 'pro-list');
    c.proFeatures.forEach(function (f) {
      if (FEATURES[f]) ul.appendChild(el('li', reason === f ? 'hl' : '', FEATURES[f][L]));
    });
    card.appendChild(ul);

    var row = el('div', 'pro-actions');
    if (enforced() && !isPro() && c.upgradeUrl) {
      var up = el('a', 'btn btn-primary', tx('upgrade'));
      up.href = c.upgradeUrl; up.target = '_blank'; up.rel = 'noopener';
      row.appendChild(up);
    }
    var ok = el('button', 'btn btn-secondary', tx('ok'));
    ok.type = 'button';
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    ok.addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    row.appendChild(ok);
    card.appendChild(row);
    wrap.appendChild(card);
    doc.body.appendChild(wrap);
    try { ok.focus(); } catch (e) {}
  }

  // Where the PRO chip goes, per feature.
  var CHIP_TARGETS = [
    { feature: 'dialogue', sel: '#dialogueMode', parent: true },
    { feature: 'music', sel: '#btnMusicPick' },
    { feature: 'shorts', sel: '#videoFormat', after: true }
  ];

  function refreshBadges() {
    var doc = root.document;
    if (!doc || !doc.querySelectorAll) return;
    var chips = doc.querySelectorAll('.pro-chip');
    for (var i = 0; i < chips.length; i++) chips[i].parentNode.removeChild(chips[i]);
    if (!cfg().showBadges || isPro()) return;
    CHIP_TARGETS.forEach(function (t) {
      if (!isProFeature(t.feature)) return;
      var target = doc.querySelector(t.sel);
      if (!target) return;
      var chip = el('span', 'pro-chip' + (enforced() ? ' locked' : ''), tx('chip'));
      chip.title = enforced() ? tx('locked') : tx('chipFree');
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); showUpsell(t.feature); });
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
      showUpsell(feature);
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
    var clone = doc.querySelector('.clone-card');
    if (clone) clone.addEventListener('click', function (e) {
      var tgt = e.target && e.target.closest ? e.target.closest('button, input, label') : null;
      if (tgt && !can('clone')) block(e, 'clone');
    }, true);
  }

  function init() {
    refreshBadges();
    installGuards();
    // Re-label chips when the UI language changes.
    try {
      new root.MutationObserver(refreshBadges)
        .observe(root.document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    } catch (e) {}
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
