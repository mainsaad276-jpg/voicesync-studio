/*
 * VoxNova: scrolling promo ticker at the bottom of the app
 * ("Subscribe for more", "Join our community", "Share with friends" ...).
 * Messages come from the admin page (GET /pro/plans -> ticker) via pro.js;
 * until then the defaults below are shown. Tap a message to act on it.
 * The × hides it for this visit. Reduced-motion users get a slow fade
 * between messages instead of scrolling.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;
  var SHARE_URL = 'https://voicesync-studio-psi.vercel.app/';
  var HIDE_KEY = 'voicesync.tickerHidden';

  var DEFAULTS = {
    enabled: true, speed: 'normal',
    items: [
      { icon: '🔔', en: 'Subscribe for more free tools — Abubakar YT Zone', ur: 'مزید مفت ٹولز کے لیے سبسکرائب کریں — ابوبکر وائی ٹی زون', action: 'none' },
      { icon: '👥', en: 'Join our WhatsApp community — tips, new voices, offers', ur: 'ہماری واٹس ایپ کمیونٹی جوائن کریں — ٹپس، نئی آوازیں، آفرز', action: 'whatsapp' },
      { icon: '📤', en: 'Share VoxNova with friends — free voiceover + lip-sync app', ur: 'وائس نووا دوستوں کے ساتھ شیئر کریں — مفت وائس اوور ایپ', action: 'share' },
      { icon: '🎁', en: '10,000 HD characters FREE — try voice cloning today', ur: '10,000 ایچ ڈی حروف مفت — آج ہی وائس کلوننگ آزمائیں', action: 'plans' },
      { icon: '⭐', en: 'First month Rs 300 off on every Pro plan', ur: 'ہر پرو پلان پر پہلے ماہ 300 روپے کی چھوٹ', action: 'plans' }
    ]
  };

  function lang() { return doc.documentElement.lang === 'ur' ? 'ur' : 'en'; }
  var override = null;
  function cfg() {
    if (override) return override;
    var lv = root.Pro && root.Pro.liveData ? root.Pro.liveData() : null;
    var t = lv && lv.ticker && Array.isArray(lv.ticker.items) ? lv.ticker : null;
    return t || DEFAULTS;
  }
  function waNumber() {
    try {
      var c = root.Pro && root.Pro._config ? root.Pro._config() : null;
      return String((c && c.payment && c.payment.whatsapp) || '').replace(/\D/g, '');
    } catch (e) { return ''; }
  }
  function shareText() {
    return lang() === 'ur'
      ? 'وائس نووا — مفت اردو وائس اوور اور لِپ سنک ایپ۔ ابھی آزمائیں: '
      : 'VoxNova — free Urdu & English voiceover + lip-sync app. Try it: ';
  }
  function act(m) {
    var a = m.action || 'none';
    if (a === 'plans' && root.Pro && root.Pro.showPlans) return root.Pro.showPlans();
    if (a === 'share') {
      var text = shareText();
      if (root.navigator && root.navigator.share) {
        root.navigator.share({ title: 'VoxNova', text: text, url: SHARE_URL }).catch(function () {});
      } else {
        root.open('https://wa.me/?text=' + encodeURIComponent(text + SHARE_URL), '_blank', 'noopener');
      }
      return;
    }
    if (a === 'whatsapp') {
      var url = m.url;
      if (!url) {
        var n = waNumber();
        if (!n) return;
        url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(lang() === 'ur' ? 'السلام علیکم، مجھے وائس نووا کمیونٹی جوائن کرنی ہے' : 'Hi, I want to join the VoxNova community');
      }
      root.open(url, '_blank', 'noopener');
      return;
    }
    if (a === 'link' && /^https:\/\//.test(m.url || '')) root.open(m.url, '_blank', 'noopener');
  }

  function hidden() { try { return root.sessionStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; } }
  var bar = null, rot = null;

  function render() {
    var t = cfg();
    var items = (t.items || []).filter(function (m) { return m && (m.en || m.ur); });
    if (rot) { clearInterval(rot); rot = null; }
    if (!t.enabled || !items.length || hidden()) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      bar = null; doc.body.classList.remove('has-ticker');
      return;
    }
    var L = lang();
    if (!bar) {
      bar = doc.createElement('div');
      bar.className = 'vn-ticker';
      bar.setAttribute('role', 'region');
      doc.body.appendChild(bar);
    }
    bar.setAttribute('aria-label', L === 'ur' ? 'اعلانات' : 'News');
    bar.setAttribute('dir', L === 'ur' ? 'rtl' : 'ltr');
    bar.setAttribute('data-speed', t.speed || 'normal');
    bar.innerHTML = '';
    var label = doc.createElement('span');
    label.className = 'vn-ticker-label';
    label.textContent = L === 'ur' ? 'نیا' : 'LIVE';
    bar.appendChild(label);
    var view = doc.createElement('div');
    view.className = 'vn-ticker-view';
    var track = doc.createElement('div');
    track.className = 'vn-ticker-track';
    // Two copies make the loop seamless; the second is hidden from screen readers.
    for (var copy = 0; copy < 2; copy++) {
      items.forEach(function (m) {
        var b = doc.createElement(m.action && m.action !== 'none' ? 'button' : 'span');
        b.className = 'vn-ticker-item' + (m.action && m.action !== 'none' ? ' is-action' : '');
        if (b.tagName === 'BUTTON') { b.type = 'button'; b.addEventListener('click', function () { act(m); }); }
        if (copy) { b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; }
        if (m.icon) { var ic = doc.createElement('span'); ic.className = 'vn-ticker-ico'; ic.textContent = m.icon; b.appendChild(ic); }
        b.appendChild(doc.createTextNode(m[L] || m.en || m.ur));
        track.appendChild(b);
      });
    }
    view.appendChild(track);
    bar.appendChild(view);
    var x = doc.createElement('button');
    x.type = 'button'; x.className = 'vn-ticker-x'; x.textContent = '×';
    x.setAttribute('aria-label', L === 'ur' ? 'بند کریں' : 'Hide');
    x.addEventListener('click', function () { try { root.sessionStorage.setItem(HIDE_KEY, '1'); } catch (e) {} render(); });
    bar.appendChild(x);
    doc.body.classList.add('has-ticker');
    // Speed by length so long lists don't race: ~60 px/s normal.
    var pxPerSec = t.speed === 'slow' ? 40 : t.speed === 'fast' ? 95 : 60;
    root.requestAnimationFrame(function () {
      var w = track.scrollWidth / 2 || 800;
      track.style.animationDuration = Math.max(12, Math.round(w / pxPerSec)) + 's';
    });
    // Reduced motion: show one message at a time.
    var rm = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) {
      var all = track.querySelectorAll('.vn-ticker-item:not([aria-hidden])'), i = 0;
      var show = function () { for (var k = 0; k < all.length; k++) all[k].classList.toggle('on', k === i); i = (i + 1) % all.length; };
      show(); rot = setInterval(show, 5000);
    }
  }

  function start() {
    render();
    root.addEventListener('vs:live', render);
    try {
      new root.MutationObserver(render).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
    } catch (e) {}
  }
  root.VSTicker = { render: render, defaults: DEFAULTS, preview: function (t) { override = t; try { root.sessionStorage.removeItem(HIDE_KEY); } catch (e) {} render(); } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
