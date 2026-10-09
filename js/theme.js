/*
 * VoiceSync Studio: theme picker. Loaded in <head> so the saved theme is
 * applied before the page paints (no flash). Adds a 🎨 button to the top bar;
 * the choice is saved on this device and can be changed any time.
 *   window.VSTheme.set('viral') / .get() / .list
 */
(function (root) {
  'use strict';
  var KEY = 'voicesync.theme';
  var THEMES = [
    { id: 'classic',  en: 'Classic',  ur: 'کلاسک',   swatch: 'linear-gradient(135deg,#f7f3ea,#1d5c4d)', bar: '#1d5c4d' },
    { id: 'viral',    en: 'Viral',    ur: 'وائرل',   swatch: 'linear-gradient(135deg,#ff2d87,#8b5cff)', bar: '#0d0a1c' },
    { id: 'midnight', en: 'Midnight', ur: 'مڈنائٹ',  swatch: 'linear-gradient(135deg,#0e1513,#3fc79c)', bar: '#0e1513' },
    { id: 'sunset',   en: 'Sunset',   ur: 'سن سیٹ',  swatch: 'linear-gradient(135deg,#ffb07a,#d6336c)', bar: '#e8590c' }
  ];
  function valid(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return null; }
  function saved() { try { return root.localStorage.getItem(KEY); } catch (e) { return null; } }
  function get() { return (valid(saved()) || THEMES[0]).id; }

  function apply(id) {
    var t = valid(id) || THEMES[0];
    var de = root.document.documentElement;
    if (t.id === 'classic') de.removeAttribute('data-theme'); else de.setAttribute('data-theme', t.id);
    try {
      var m = root.document.querySelector('meta[name="theme-color"]');
      if (!m) { m = root.document.createElement('meta'); m.name = 'theme-color'; root.document.head.appendChild(m); }
      m.content = t.bar;
    } catch (e) {}
    // Android app: match the status bar (Capacitor StatusBar plugin, if present).
    try {
      var SB = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.StatusBar;
      if (SB && SB.setBackgroundColor) SB.setBackgroundColor({ color: t.bar });
    } catch (e) {}
  }
  function set(id) {
    var t = valid(id) || THEMES[0];
    try { root.localStorage.setItem(KEY, t.id); } catch (e) {}
    apply(t.id);
    syncPop();
  }

  apply(get()); // as early as possible

  var pop = null;
  function lang() { return root.document.documentElement.lang === 'ur' ? 'ur' : 'en'; }
  function syncPop() {
    if (!pop) return;
    var cur = get();
    var opts = pop.querySelectorAll('.theme-opt');
    for (var i = 0; i < opts.length; i++) opts[i].setAttribute('aria-checked', opts[i].getAttribute('data-id') === cur ? 'true' : 'false');
  }
  function closePop() { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); pop = null; }
  function openPop(btn) {
    closePop();
    var d = root.document;
    pop = d.createElement('div');
    pop.className = 'theme-pop';
    pop.setAttribute('role', 'radiogroup');
    pop.setAttribute('aria-label', lang() === 'ur' ? 'تھیم' : 'Theme');
    THEMES.forEach(function (t) {
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'theme-opt'; b.setAttribute('role', 'radio');
      b.setAttribute('data-id', t.id);
      var sw = d.createElement('span'); sw.className = 'theme-swatch'; sw.style.background = t.swatch;
      b.appendChild(sw);
      b.appendChild(d.createTextNode(t[lang()] || t.en));
      b.addEventListener('click', function () { set(t.id); closePop(); });
      pop.appendChild(b);
    });
    d.body.appendChild(pop);
    syncPop();
    setTimeout(function () {
      d.addEventListener('click', function onDoc(e) {
        if (pop && !pop.contains(e.target) && e.target !== btn) { closePop(); d.removeEventListener('click', onDoc); }
      });
    }, 0);
  }

  function addButton() {
    var bar = root.document.querySelector('.topbar-actions');
    if (!bar || root.document.getElementById('btnTheme')) return;
    var b = root.document.createElement('button');
    b.id = 'btnTheme'; b.type = 'button'; b.className = 'btn btn-secondary btn-small theme-btn';
    b.textContent = '🎨';
    b.title = 'Theme';
    b.setAttribute('aria-label', 'Theme');
    b.addEventListener('click', function () { if (pop) closePop(); else openPop(b); });
    bar.insertBefore(b, bar.firstChild);
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', addButton);
  else addButton();

  root.VSTheme = { set: set, get: get, list: THEMES.map(function (t) { return t.id; }) };
})(window);
