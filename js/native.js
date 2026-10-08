/*
 * VoiceSync Studio: Android native bridge (Capacitor).
 *
 * On the website this file does nothing. Inside the Android app it swaps the
 * browser APIs that Android's WebView lacks for native plugins, so the rest of
 * the code (tts.js, app.js, exporter.js) runs unchanged:
 *
 *   speechSynthesis / SpeechSynthesisUtterance -> Android TextToSpeech (offline voices)
 *   SpeechRecognition (Voice to Text)          -> Android speech recognizer
 *   <a download> clicks (MP3, WAV, video, SRT,
 *     project JSON)                            -> file saved to Documents/VoiceSync
 *   navigator.share({files})                   -> Android share sheet
 *   navigator.clipboard                        -> native clipboard
 *   hardware back button                       -> previous tab, then exit
 */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  window.VSNative = { isNative: isNative };
  if (!isNative) return;

  document.documentElement.classList.add('native-app');

  function plugin(name) {
    try {
      if (typeof Cap.registerPlugin === 'function') return Cap.registerPlugin(name);
    } catch (e) { /* fall through */ }
    return (Cap.Plugins && Cap.Plugins[name]) || null;
  }

  var TTS = plugin('TextToSpeech');
  var STT = plugin('SpeechRecognition');
  var FS = plugin('Filesystem');
  var Share = plugin('Share');
  var Clip = plugin('Clipboard');
  var Http = plugin('CapacitorHttp');
  var AppP = plugin('App');

  /* ---------------- small toast (save / share feedback) ---------------- */
  var toastTimer = null;
  function toast(msg, action) {
    var el = document.getElementById('nativeToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nativeToast';
      el.className = 'native-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', function () { el.classList.remove('show'); action.run(); });
      el.appendChild(b);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, action ? 7000 : 3500);
  }
  window.VSNative.toast = toast;

  function ur() { return document.documentElement.lang === 'ur'; }

  /* ---------------- helpers ---------------- */
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      r.onerror = function () { reject(r.error || new Error('read failed')); };
      r.readAsDataURL(blob);
    });
  }

  function safeName(name) {
    return String(name || 'voicesync-file').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
  }

  // Returns base64 data for a blob:, data: or http(s) URL.
  function urlToBase64(href) {
    if (/^data:/i.test(href)) return Promise.resolve(href.slice(href.indexOf(',') + 1));
    if (/^https?:/i.test(href) && Http) {
      // Native HTTP: no CORS limits (lets Google TTS audio download as real MP3).
      return Http.get({ url: href, responseType: 'blob' }).then(function (res) {
        if (res.status && res.status >= 400) throw new Error('HTTP ' + res.status);
        return typeof res.data === 'string' ? res.data : '';
      });
    }
    return fetch(href).then(function (r) { return r.blob(); }).then(blobToBase64);
  }

  function writeCache(name, data) {
    return FS.writeFile({ path: name, data: data, directory: 'CACHE' })
      .then(function (r) { return r.uri; });
  }

  function shareUris(uris, title) {
    if (!Share) return Promise.reject(new Error('Share unavailable'));
    return Share.share({ title: title || 'VoiceSync Studio', files: uris, dialogTitle: title || 'VoiceSync Studio' });
  }

  // Save to Documents/VoiceSync; if the phone refuses, save to cache and open share sheet.
  function saveFile(name, data) {
    name = safeName(name);
    return FS.writeFile({ path: 'VoiceSync/' + name, data: data, directory: 'DOCUMENTS', recursive: true })
      .then(function (r) {
        toast((ur() ? 'محفوظ ہو گیا: Documents/VoiceSync/' : 'Saved: Documents/VoiceSync/') + name, {
          label: ur() ? 'شیئر' : 'Share',
          run: function () { shareUris([r.uri]).catch(function () {}); }
        });
        return r.uri;
      })
      .catch(function () {
        return writeCache(name, data).then(function (uri) {
          toast(ur() ? 'فائل تیار ہے، محفوظ کرنے کی جگہ چنیں' : 'File ready, choose where to save it');
          return shareUris([uri], name).then(function () { return uri; }, function () { return uri; });
        });
      });
  }
  window.VSNative.saveFile = saveFile;

  /* ---------------- downloads: intercept <a download> ---------------- */
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.href || '';
    var name = this.getAttribute('download');
    if (name !== null && FS && /^(blob:|data:|https?:)/i.test(href)) {
      var fname = name || href.split('/').pop().split('?')[0] || 'voicesync-file';
      toast(ur() ? 'فائل محفوظ ہو رہی ہے…' : 'Saving file…');
      urlToBase64(href)
        .then(function (b64) {
          if (!b64) throw new Error('empty file');
          return saveFile(fname, b64);
        })
        .catch(function (e) {
          toast((ur() ? 'محفوظ نہیں ہو سکا: ' : 'Could not save: ') + (e && e.message ? e.message : e));
        });
      return;
    }
    // Links that just open a page (Terms PDF etc.) open in the system browser.
    if (this.target === '_blank' && /^https?:/i.test(href) && !/^https?:\/\/localhost/i.test(href)) {
      window.open(href, '_system');
      return;
    }
    return origClick.apply(this, arguments);
  };

  /* ---------------- share sheet ---------------- */
  if (Share && FS) {
    navigator.canShare = function (d) { return !!(d && (d.files || d.text || d.url)); };
    navigator.share = function (d) {
      d = d || {};
      var files = d.files || [];
      if (!files.length) return Share.share({ title: d.title, text: d.text, url: d.url });
      return Promise.all(files.map(function (f) {
        return blobToBase64(f).then(function (b64) { return writeCache(safeName(f.name), b64); });
      })).then(function (uris) { return shareUris(uris, d.title); });
    };
  }

  /* ---------------- clipboard ---------------- */
  if (Clip) {
    try {
      var clip = {
        readText: function () { return Clip.read().then(function (r) { return (r && r.value) || ''; }); },
        writeText: function (s) { return Clip.write({ string: String(s) }); }
      };
      Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
    } catch (e) { /* keep WebView clipboard */ }
  }

  /* ---------------- speechSynthesis -> Android TextToSpeech ---------------- */
  if (TTS) {
    var MAX_CHUNK = 3500; // Android TTS input limit is ~4000 characters
    var voices = [];
    var listeners = {};
    var gen = 0;           // bumps on cancel so old callbacks are ignored
    var cur = null;        // { u, chunks, idx, offset, gen }

    function NativeUtterance(text) {
      this.text = text || '';
      this.lang = '';
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onstart = null; this.onend = null; this.onerror = null;
      this.onpause = null; this.onresume = null; this.onboundary = null;
      this._l = {};
    }
    NativeUtterance.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
    NativeUtterance.prototype.removeEventListener = function (t, f) {
      this._l[t] = (this._l[t] || []).filter(function (x) { return x !== f; });
    };
    function fire(u, type, extra) {
      var ev = { type: type, utterance: u, charIndex: 0, elapsedTime: 0 };
      if (extra) for (var k in extra) ev[k] = extra[k];
      try { if (typeof u['on' + type] === 'function') u['on' + type](ev); } catch (e) { console.error(e); }
      (u._l[type] || []).forEach(function (f) { try { f(ev); } catch (e) { console.error(e); } });
    }

    function splitChunks(text) {
      var out = [], s = String(text || '');
      while (s.length > MAX_CHUNK) {
        var cut = Math.max(s.lastIndexOf('۔', MAX_CHUNK), s.lastIndexOf('.', MAX_CHUNK),
          s.lastIndexOf('!', MAX_CHUNK), s.lastIndexOf('?', MAX_CHUNK), s.lastIndexOf('\n', MAX_CHUNK));
        if (cut < MAX_CHUNK / 2) cut = s.lastIndexOf(' ', MAX_CHUNK);
        if (cut < 1) cut = MAX_CHUNK;
        out.push(s.slice(0, cut + 1));
        s = s.slice(cut + 1);
      }
      if (s.trim()) out.push(s);
      return out;
    }

    function voiceIndex(v) {
      if (!v) return undefined;
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].voiceURI === v.voiceURI) return i;
      }
      return undefined;
    }

    function speakFrom(state) {
      if (state.gen !== gen) return;
      if (state.idx >= state.chunks.length) {
        cur = null;
        synth.speaking = false;
        fire(state.u, 'end');
        return;
      }
      var u = state.u;
      var text = state.chunks[state.idx].slice(state.offset);
      var opts = {
        text: text,
        lang: (u.voice && u.voice.lang) || u.lang || 'en-US',
        rate: Math.max(0.1, Math.min(3, Number(u.rate) || 1)),
        pitch: Math.max(0.1, Math.min(2, Number(u.pitch) || 1)),
        volume: Math.max(0, Math.min(1, u.volume == null ? 1 : Number(u.volume))),
        queueStrategy: 0
      };
      var vi = voiceIndex(u.voice);
      if (vi !== undefined) opts.voice = vi;
      state.base = state.offset;
      var my = state.gen; // a later cancel/pause/resume makes this call stale
      TTS.speak(opts).then(function () {
        if (my !== gen || synth.paused) return;
        state.idx++; state.offset = 0;
        speakFrom(state);
      }, function (err) {
        if (my !== gen || synth.paused) return;
        cur = null;
        synth.speaking = false;
        fire(u, 'error', { error: (err && err.message) || 'synthesis-failed' });
      });
    }

    var synth = {
      speaking: false,
      paused: false,
      pending: false,
      onvoiceschanged: null,
      getVoices: function () { return voices.slice(); },
      speak: function (u) {
        if (!u) return;
        gen++;
        var state = { u: u, chunks: splitChunks(u.text), idx: 0, offset: 0, gen: gen };
        cur = state;
        synth.speaking = true;
        synth.paused = false;
        fire(u, 'start');
        speakFrom(state);
      },
      cancel: function () {
        gen++;
        cur = null;
        synth.speaking = false;
        synth.paused = false;
        TTS.stop().catch(function () {});
      },
      // Android TTS has no pause: stop now, remember the last spoken word,
      // and continue from that word on resume.
      pause: function () {
        if (!cur || synth.paused) return;
        synth.paused = true;
        gen++;
        cur.gen = gen;
        TTS.stop().catch(function () {});
        fire(cur.u, 'pause');
      },
      resume: function () {
        if (!cur || !synth.paused) return;
        synth.paused = false;
        gen++;
        cur.gen = gen;
        fire(cur.u, 'resume');
        speakFrom(cur);
      },
      addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
      removeEventListener: function (t, f) {
        listeners[t] = (listeners[t] || []).filter(function (x) { return x !== f; });
      },
      dispatchEvent: function (ev) {
        var t = ev && ev.type;
        if (t === 'voiceschanged' && typeof synth.onvoiceschanged === 'function') synth.onvoiceschanged(ev);
        (listeners[t] || []).forEach(function (f) { try { f(ev); } catch (e) { console.error(e); } });
        return true;
      }
    };

    // Track the spoken position so pause/resume continues from the same word.
    try {
      TTS.addListener('onRangeStart', function (info) {
        if (cur && !synth.paused && info && typeof info.start === 'number') {
          cur.offset = (cur.base || 0) + info.start;
          fire(cur.u, 'boundary', { charIndex: cur.offset, name: 'word' });
        }
      });
    } catch (e) { /* older engines: resume restarts the current chunk */ }

    try {
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: NativeUtterance, configurable: true, writable: true });
    } catch (e) {
      window.speechSynthesis = synth;
      window.SpeechSynthesisUtterance = NativeUtterance;
    }

    function loadVoices(attempt) {
      TTS.getSupportedVoices().then(function (r) {
        var list = (r && r.voices) || [];
        if (!list.length && attempt < 5) { setTimeout(function () { loadVoices(attempt + 1); }, 800); return; }
        var seen = {};
        voices = list.map(function (v, i) {
          // Android names voices like "en-us-x-sfg-local"; make them readable.
          var base = v.name || v.lang || 'Voice';
          var n = (seen[base] = (seen[base] || 0) + 1);
          var label = base + (n > 1 ? ' ' + n : '') + (v.localService === false ? ' (online)' : '');
          return { voiceURI: v.voiceURI || ('android-' + i), name: label, lang: v.lang || '',
            localService: v.localService !== false, default: !!v.default };
        });
        synth.dispatchEvent({ type: 'voiceschanged' });
      }).catch(function () {
        if (attempt < 5) setTimeout(function () { loadVoices(attempt + 1); }, 800);
      });
    }
    loadVoices(0);
  }

  /* ---------------- SpeechRecognition -> Android recognizer ---------------- */
  if (STT) {
    var NativeRecognition = function () {
      this.lang = 'en-US';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null;
      this._running = false;
      this._last = '';
      this._handles = [];
    };
    NativeRecognition.prototype._emit = function (text, isFinal) {
      if (!text || typeof this.onresult !== 'function') return;
      var alt = { transcript: text, confidence: 1 };
      var res = [alt]; res.isFinal = isFinal;
      this.onresult({ resultIndex: 0, results: [res] });
    };
    NativeRecognition.prototype._finish = function () {
      if (!this._running) return;
      this._running = false;
      if (this._last) this._emit(this._last, true);
      this._last = '';
      this._handles.forEach(function (h) { try { h.remove(); } catch (e) {} });
      this._handles = [];
      if (typeof this.onend === 'function') this.onend({});
    };
    NativeRecognition.prototype.start = function () {
      var self = this;
      if (self._running) throw new Error('already started');
      self._running = true;
      self._last = '';
      STT.requestPermissions().then(function (p) {
        if (p && p.speechRecognition && p.speechRecognition !== 'granted') {
          throw { error: 'not-allowed' };
        }
        return STT.available();
      }).then(function (a) {
        if (a && a.available === false) throw { error: 'service-not-allowed' };
        return Promise.all([
          STT.addListener('partialResults', function (d) {
            var m = d && d.matches && d.matches[0];
            if (m) { self._last = m; if (self.interimResults) self._emit(m, false); }
          }),
          STT.addListener('listeningState', function (d) {
            if (d && d.status === 'stopped') self._finish();
          })
        ]);
      }).then(function (hs) {
        self._handles = hs || [];
        if (typeof self.onstart === 'function') self.onstart({});
        return STT.start({ language: self.lang, partialResults: true, popup: false, maxResults: 1 });
      }).catch(function (e) {
        var code = (e && e.error) || 'network';
        if (e && e.message && /permission/i.test(e.message)) code = 'not-allowed';
        self._running = false;
        self._handles.forEach(function (h) { try { h.remove(); } catch (x) {} });
        self._handles = [];
        if (typeof self.onerror === 'function') self.onerror({ error: code });
        if (typeof self.onend === 'function') self.onend({});
      });
    };
    NativeRecognition.prototype.stop = function () {
      var self = this;
      STT.stop().catch(function () {}).then(function () { self._finish(); });
    };
    NativeRecognition.prototype.abort = NativeRecognition.prototype.stop;
    window.SpeechRecognition = NativeRecognition;
    window.webkitSpeechRecognition = NativeRecognition;
  }

  /* ---------------- hardware back button ---------------- */
  if (AppP) {
    AppP.addListener('backButton', function () {
      var nav = window.VSTabs;
      if (nav && nav.current && nav.current() !== 'write') { nav.show('write'); return; }
      AppP.exitApp();
    });
  }
})();
