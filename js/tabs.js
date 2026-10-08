/*
 * VoiceSync Studio: mobile / Android tab navigation.
 * On narrow screens the studio shows one step at a time:
 *   Write -> Voices -> Listen -> Save
 * On wide screens (desktop) every section stays visible and this file only
 * keeps the bottom bar hidden (CSS). Section ids and app.js wiring are untouched.
 */
(function () {
  'use strict';

  var TABS = ['write', 'voices', 'listen', 'save'];
  var KEY = 'voicesync-tab';
  var mq = window.matchMedia ? window.matchMedia('(max-width: 859px)') : null;
  var current = 'write';

  function isTabbed() {
    return document.documentElement.classList.contains('native-app') || !mq || mq.matches;
  }

  function apply() {
    var on = isTabbed();
    document.body.classList.toggle('tabbed', on);
    document.body.setAttribute('data-current-tab', current);
    var btns = document.querySelectorAll('.tabbar .tab');
    for (var i = 0; i < btns.length; i++) {
      var me = btns[i].getAttribute('data-go') === current;
      btns[i].classList.toggle('active', me);
      if (me) btns[i].setAttribute('aria-current', 'page');
      else btns[i].removeAttribute('aria-current');
    }
  }

  function show(tab, opts) {
    if (TABS.indexOf(tab) === -1) tab = 'write';
    var changed = tab !== current;
    current = tab;
    var chip = document.getElementById('tabStatus');
    if (chip && changed) chip.classList.remove('show');
    try { localStorage.setItem(KEY, tab); } catch (e) {}
    apply();
    if (changed && isTabbed() && !(opts && opts.keepScroll)) {
      window.scrollTo(0, 0);
    }
  }

  function quickGenerate() {
    show('listen');
    var gen = document.getElementById('btnGenBig');
    if (gen) setTimeout(function () { gen.click(); }, 60);
  }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    // Always open on Write unless the user was mid-way; never reopen on Save.
    current = (saved === 'voices' || saved === 'listen') ? saved : 'write';

    var bar = document.getElementById('tabbar');
    if (bar) {
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('.tab') : null;
        if (b) show(b.getAttribute('data-go'));
      });
    }
    var q = document.getElementById('btnQuickGen');
    if (q) q.addEventListener('click', quickGenerate);

    // Picking a character on the Voices tab: confirm with a short pulse on the
    // quick action so users know the next step.
    var grid = document.getElementById('charGrid');
    if (grid) {
      grid.addEventListener('click', function (ev) {
        if (!isTabbed() || current !== 'voices') return;
        var card = ev.target.closest ? ev.target.closest('.char-card') : null;
        var playBtn = ev.target.closest ? ev.target.closest('button') : null;
        if (card && !playBtn) {
          var cta = document.getElementById('quickCta');
          if (cta) {
            cta.classList.remove('pulse');
            void cta.offsetWidth;
            cta.classList.add('pulse');
          }
        }
      });
    }

    mirrorStatus();
    watchNetwork();

    if (mq) {
      var onChange = function () { apply(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    apply();
  }

  // The status line lives on the Listen step. On the other steps, show each
  // new message as a short floating note so no button feels "dead".
  function mirrorStatus() {
    var src = document.getElementById('statusMsg');
    if (!src || typeof MutationObserver === 'undefined') return;
    var chip = document.createElement('div');
    chip.id = 'tabStatus';
    chip.className = 'tab-status';
    chip.setAttribute('role', 'status');
    chip.setAttribute('aria-live', 'polite');
    document.body.appendChild(chip);
    var timer = null;
    new MutationObserver(function () {
      var txt = src.textContent || '';
      if (!isTabbed() || current === 'listen' || !txt.trim()) return;
      // The idle "Ready" line (re-set on every language switch) is not news.
      var S = window.I18N && window.I18N.strings;
      if (S && ((S.en && txt === S.en.status_ready) || (S.ur && txt === S.ur.status_ready))) return;
      // In the Android app the save toast already explains file results.
      var nt = document.getElementById('nativeToast');
      if (nt && nt.classList.contains('show')) return;
      chip.textContent = txt;
      chip.setAttribute('data-kind', src.getAttribute('data-kind') || 'info');
      chip.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(function () { chip.classList.remove('show'); }, 4500);
    }).observe(src, { childList: true, characterData: true, subtree: true, attributes: true });
    chip.addEventListener('click', function () { chip.classList.remove('show'); });
  }

  // Offline notice (website and app): only device voices work without internet.
  function watchNetwork() {
    var bar = document.createElement('div');
    bar.id = 'netBanner';
    bar.className = 'net-banner';
    bar.setAttribute('role', 'alert');
    document.body.insertBefore(bar, document.body.firstChild);
    function text() {
      var S = window.I18N && window.I18N.strings;
      var lang = document.documentElement.lang === 'ur' ? 'ur' : 'en';
      return (S && S[lang] && S[lang].net_offline) ||
        'No internet: only device voices (Browser Voice) will work.';
    }
    function update() {
      var off = navigator.onLine === false;
      bar.textContent = off ? text() : '';
      bar.classList.toggle('show', off);
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Re-translate when the UI language changes.
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    update();
  }

  window.VSTabs = {
    show: show,
    current: function () { return current; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
