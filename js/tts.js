/* ============================================================================
 * VoiceSync Studio — TTS module
 * Owner: Usman (TTS Engine Developer)
 *
 * Free text-to-speech with automatic fallback chain:
 *   1. Microsoft Edge Neural voices (free, no key) via readaloud WebSocket
 *      wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
 *   2. Google Translate TTS  https://translate.google.com/translate_tts?client=tw-ob
 *   3. Browser Web Speech API (offline, no network needed)
 *
 * Contract (SPEC.md — exact):
 *   TTS.getVoices(lang)            -> [{id, name, lang, gender, engine}]
 *     (lang is a PREFIX filter: 'ur' matches 'ur-PK' and 'ur-IN')
 *   TTS.synthesize(text, voiceId)  -> Promise<Result | {error}>
 *     Result shapes:
 *       edge:    {audioBuffer, blob(MP3), url, duration, engine:'edge'}
 *       google:  {audioBuffer:null, blob:null, url, urls, duration, engine:'google'}
 *                (browser: translate_tts sends no CORS headers, so bytes are
 *                unreadable — playback via <audio> element; see API.md §3.
 *                In Node (no CORS) the fetch/byte path is kept for testing.)
 *       webspeech:{audioBuffer:null, blob:null, url:null, duration, engine:'webspeech', utterance}
 *   TTS.cancel()                   -> void
 *
 * Rules: never throws to UI — total failure resolves {error: <message>}.
 * Browser-only APIs (WebSocket, AudioContext, speechSynthesis, URL.createObjectURL)
 * are all guarded with feature detection so this file also loads cleanly in Node
 * (node --check) and degrades engine-by-engine when an API is missing.
 * ========================================================================== */
(function (root, factory) {
  'use strict';
  var TTS = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = TTS; }
  root.TTS = TTS;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */
  var EDGE_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    '?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  var EDGE_AUDIO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'; // MP3 bytes, easy to concat + play
  var GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
  var EDGE_CHUNK_LIMIT = 400;   // per SPEC.md
  var GOOGLE_CHUNK_LIMIT = 200; // translate_tts truncates long requests; stay safe
  var WS_TIMEOUT_MS = 30000;
  var FETCH_TIMEOUT_MS = 25000;
  var CRLF2 = [13, 10, 13, 10]; // \r\n\r\n byte marker before audio payload

  /* ------------------------------------------------------------------ */
  /* Voice catalog — Edge Neural ShortNames verified live on 2026-10-08   */
  /* (GET voices/list -> 200 application/json, 322 voices).              */
  /* id scheme: "edge:<ShortName>" | "google:<lang>" | "webspeech:<uri>"  */
  /* ------------------------------------------------------------------ */
  var EDGE_VOICES = [
    // [ShortName, displayName, lang, gender]
    ['ur-PK-AsadNeural',  'Asad',       'ur-PK', 'male'],
    ['ur-PK-UzmaNeural',  'Uzma',       'ur-PK', 'female'],
    ['ur-IN-SalmanNeural','Salman',     'ur-IN', 'male'],
    ['ur-IN-GulNeural',   'Gul',        'ur-IN', 'female'],
    ['hi-IN-MadhurNeural','Madhur',     'hi-IN', 'male'],
    ['hi-IN-SwaraNeural', 'Swara',      'hi-IN', 'female'],
    ['en-US-AriaNeural',       'Aria',       'en-US', 'female'],
    ['en-US-ChristopherNeural','Christopher','en-US', 'male'],
    ['en-US-JennyNeural',      'Jenny',      'en-US', 'female'],
    ['en-US-GuyNeural',        'Guy',        'en-US', 'male'],
    ['en-GB-SoniaNeural', 'Sonia', 'en-GB', 'female'],
    ['en-GB-RyanNeural',  'Ryan',  'en-GB', 'male'],
    ['en-GB-LibbyNeural', 'Libby', 'en-GB', 'female'],
    ['ar-SA-HamedNeural',  'Hamed',   'ar-SA', 'male'],
    ['ar-SA-ZariyahNeural','Zariyah', 'ar-SA', 'female'],
    ['es-ES-AlvaroNeural','Alvaro', 'es-ES', 'male'],
    ['es-ES-ElviraNeural','Elvira', 'es-ES', 'female'],
    ['fr-FR-HenriNeural', 'Henri',  'fr-FR', 'male'],
    ['fr-FR-DeniseNeural','Denise', 'fr-FR', 'female'],
    ['de-DE-ConradNeural','Conrad', 'de-DE', 'male'],
    ['de-DE-KatjaNeural', 'Katja',  'de-DE', 'female'],
    ['ru-RU-DmitryNeural',  'Dmitry',   'ru-RU', 'male'],
    ['ru-RU-SvetlanaNeural','Svetlana', 'ru-RU', 'female'],
    ['tr-TR-AhmetNeural','Ahmet','tr-TR', 'male'],
    ['tr-TR-EmelNeural', 'Emel', 'tr-TR', 'female'],
    ['id-ID-ArdiNeural', 'Ardi',  'id-ID', 'male'],
    ['id-ID-GadisNeural','Gadis', 'id-ID', 'female'],
    ['ms-MY-OsmanNeural', 'Osman',  'ms-MY', 'male'],
    ['ms-MY-YasminNeural','Yasmin', 'ms-MY', 'female'],
    ['fa-IR-FaridNeural', 'Farid',  'fa-IR', 'male'],
    ['fa-IR-DilaraNeural','Dilara', 'fa-IR', 'female'],
    ['bn-BD-PradeepNeural', 'Pradeep',  'bn-BD', 'male'],
    ['bn-BD-NabanitaNeural','Nabanita', 'bn-BD', 'female']
  ];

  var LANG_LABEL = {
    'ur-PK': 'Urdu (Pakistan)', 'ur-IN': 'Urdu (India)',
    'hi-IN': 'Hindi (India)',
    'en-US': 'English (US)', 'en-GB': 'English (UK)',
    'ar-SA': 'Arabic (Saudi)', 'es-ES': 'Spanish (Spain)',
    'fr-FR': 'French (France)', 'de-DE': 'German (Germany)',
    'ru-RU': 'Russian (Russia)', 'tr-TR': 'Turkish (Turkey)',
    'id-ID': 'Indonesian', 'ms-MY': 'Malay (Malaysia)',
    'fa-IR': 'Persian (Iran)', 'bn-BD': 'Bengali (Bangladesh)'
  };

  // Languages the Google fallback can speak (tl= code). Proven live 2026-10-08.
  var GOOGLE_LANGS = ['ur', 'hi', 'en', 'ar', 'es', 'fr', 'de', 'ru', 'tr', 'id', 'ms', 'fa', 'bn'];

  /* ------------------------------------------------------------------ */
  /* Internal state                                                      */
  /* ------------------------------------------------------------------ */
  var _cancelled = false;
  var _activeWS = null;
  var _activeControllers = []; // AbortControllers for in-flight fetches
  var _sharedCtx = null;       // lazily created AudioContext

  function _markActive(ctrl) { _activeControllers.push(ctrl); }
  function _unmarkActive(ctrl) {
    var i = _activeControllers.indexOf(ctrl);
    if (i !== -1) _activeControllers.splice(i, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function _escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // "ur-PK-AsadNeural" -> "Microsoft Server Speech Text to Speech Voice (ur-PK, AsadNeural)"
  function _edgeFullVoiceName(shortName) {
    var dash = shortName.lastIndexOf('-');
    var locale = shortName.slice(0, dash);
    var name = shortName.slice(dash + 1);
    return 'Microsoft Server Speech Text to Speech Voice (' + locale + ', ' + name + ')';
  }

  function _langLabel(lang) { return LANG_LABEL[lang] || lang; }

  function _baseLang(lang) { return String(lang || '').split('-')[0].toLowerCase(); }

  // Rough script guess so synthesize() can pick a sensible default voice.
  function _guessLang(text) {
    if (/[\u0600-\u06FF]/.test(text)) return 'ur-PK'; // Arabic-script: Urdu/Arabic
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN'; // Devanagari: Hindi
    return 'en-US';
  }

  function _estimateDurationSec(text) {
    // ~14 chars/sec is a fair average across these neural voices.
    return Math.max(0.5, String(text).length / 14);
  }

  /* ------------------------------------------------------------------ */
  /* TTS.getVoices(lang)                                                 */
  /* ------------------------------------------------------------------ */
  function getVoices(lang) {
    var out = [];
    var i, v;
    for (i = 0; i < EDGE_VOICES.length; i++) {
      v = EDGE_VOICES[i];
      if (lang && v[2].indexOf(lang) !== 0) continue; // SPEC §3: prefix match ('ur' -> 'ur-PK')
      out.push({
        id: 'edge:' + v[0],
        name: v[1] + ' — ' + _langLabel(v[2]) + ' (Edge Neural)',
        lang: v[2],
        gender: v[3],
        engine: 'edge'
      });
    }
    // Google fallback entries: one male + one female slot per supported language.
    var langs = lang ? [lang] : Object.keys(LANG_LABEL);
    for (i = 0; i < langs.length; i++) {
      var l = langs[i], base = _baseLang(l);
      if (GOOGLE_LANGS.indexOf(base) === -1) continue;
      out.push({ id: 'google:' + l + ':female', name: 'Google ' + _langLabel(l) + ' (fallback voice)', lang: l, gender: 'female', engine: 'google' });
      out.push({ id: 'google:' + l + ':male',   name: 'Google ' + _langLabel(l) + ' (fallback voice)', lang: l, gender: 'male',   engine: 'google' });
    }
    // Live Web Speech voices when the browser exposes them.
    try {
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices) {
        var sv = speechSynthesis.getVoices() || [];
        for (i = 0; i < sv.length; i++) {
          var s = sv[i];
          if (lang && s.lang && s.lang.indexOf(lang.split('-')[0]) !== 0) continue;
          out.push({
            id: 'webspeech:' + (s.voiceURI || s.name),
            name: s.name + ' (device voice)',
            lang: s.lang || '',
            gender: '',
            engine: 'webspeech'
          });
        }
      }
    } catch (e) { /* feature-detect: not available, skip silently */ }
    return out;
  }

  function _findVoice(voiceId) {
    if (!voiceId) return null;
    var all = getVoices();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === voiceId) return all[i];
    }
    return null;
  }

  function _defaultVoiceId(text) {
    var lang = _guessLang(text);
    var list = getVoices(lang);
    for (var i = 0; i < list.length; i++) {
      if (list[i].engine === 'edge') return list[i].id;
    }
    return list.length ? list[0].id : null;
  }

  /* ------------------------------------------------------------------ */
  /* Text chunking (>400 chars per SPEC; <=200 for Google)               */
  /* ------------------------------------------------------------------ */
  function _chunkText(text, limit) {
    var clean = String(text).replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    // Split on sentence boundaries incl. Urdu/Arabic punctuation.
    var sentences = clean.split(/(?<=[.!?؟۔\n])\s+/);
    var chunks = [], cur = '';
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      if ((cur + ' ' + s).trim().length <= limit) {
        cur = (cur + ' ' + s).trim();
      } else {
        if (cur) chunks.push(cur);
        // Hard-split an over-long single sentence.
        while (s.length > limit) { chunks.push(s.slice(0, limit)); s = s.slice(limit); }
        cur = s;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  /* ------------------------------------------------------------------ */
  /* Engine 1: Edge Neural via WebSocket                                 */
  /* ------------------------------------------------------------------ */
  function _edgeSynthesizeChunk(shortName, lang, chunk) {
    return new Promise(function (resolve, reject) {
      if (typeof WebSocket === 'undefined') {
        reject(new Error('WebSocket not available in this environment'));
        return;
      }
      var ws;
      try { ws = new WebSocket(EDGE_WS_URL); }
      catch (e) { reject(e); return; }
      _activeWS = ws;
      ws.binaryType = 'arraybuffer';
      var audioParts = [];
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; try { ws.close(); } catch (e) {} reject(new Error('Edge TTS timed out')); }
      }, WS_TIMEOUT_MS);

      function finish(err, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (_activeWS === ws) _activeWS = null;
        try { ws.close(); } catch (e) {}
        if (err) reject(err); else resolve(data);
      }

      ws.onopen = function () {
        if (_cancelled) { finish(new Error('cancelled')); return; }
        var date = new Date().toUTCString();
        var config = 'X-Timestamp:' + date + '\r\n' +
          'Content-Type:application/json; charset=utf-8\r\n' +
          'Path:speech.config\r\n\r\n' +
          '{"context":{"synthesis":{"audio":{"metadataoptions":' +
          '{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
          '"outputFormat":"' + EDGE_AUDIO_FORMAT + '"}}}}';
        var ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/XMLSchema" xml:lang="' + lang + '">' +
          '<voice name="' + _edgeFullVoiceName(shortName) + '">' +
          '<prosody rate="+0%" pitch="+0Hz">' + _escapeXml(chunk) + '</prosody>' +
          '</voice></speak>';
        var msg = 'X-RequestId:' + _uuid() + '\r\n' +
          'Content-Type:application/ssml+xml\r\n' +
          'X-Timestamp:' + date + '\r\n' +
          'Path:ssml\r\n\r\n' + ssml;
        try {
          ws.send(config);
          ws.send(msg);
        } catch (e) { finish(e); }
      };

      ws.onmessage = function (ev) {
        var data = ev.data;
        if (typeof data === 'string') {
          if (data.indexOf('Path:turn.end') !== -1) {
            finish(null, audioParts.length ? _concatU8(audioParts) : null);
          }
          // 'Path:turn.start' and metadata messages are informational; ignore.
        } else {
          var u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
          var cut = _indexOfCRLF2(u8);
          audioParts.push(cut === -1 ? u8 : u8.subarray(cut + 4));
        }
      };
      ws.onerror = function () { finish(new Error('Edge WebSocket error (endpoint may be blocked here)')); };
      ws.onclose = function () {
        if (!done) finish(new Error('Edge WebSocket closed before turn.end (likely blocked by network)'));
      };
    });
  }

  function _indexOfCRLF2(u8) {
    for (var i = 0; i + 3 < u8.length; i++) {
      if (u8[i] === CRLF2[0] && u8[i + 1] === CRLF2[1] && u8[i + 2] === CRLF2[2] && u8[i + 3] === CRLF2[3]) return i;
    }
    return -1;
  }

  function _concatU8(parts) {
    var total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Engine 2: Google Translate TTS (client=tw-ob, free, no key)         */
  /* ------------------------------------------------------------------ */
  function _googleSynthesizeChunk(tl, chunk, signal) {
    var url = GOOGLE_TTS_URL + '?client=tw-ob&tl=' + encodeURIComponent(tl) +
      '&q=' + encodeURIComponent(chunk);
    return fetch(url, { signal: signal }).then(function (resp) {
      if (!resp.ok) throw new Error('Google TTS HTTP ' + resp.status);
      return resp.arrayBuffer();
    }).then(function (ab) { return new Uint8Array(ab); });
  }

  /* ------------------------------------------------------------------ */
  /* Google browser path: best-effort real durations via metadata preload  */
  /* (5s per URL). Never rejects — falls back to the text estimate so the  */
  /* mouth clock always has a sane duration.                               */
  /* ------------------------------------------------------------------ */
  function _googlePreloadDurations(urls, text) {
    var jobs = urls.map(function (u) {
      return new Promise(function (resolve) {
        var done = false;
        function fin(v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } }
        var timer = setTimeout(function () { fin(0); }, 5000);
        var el;
        try { el = new Audio(); } catch (e) { fin(0); return; }
        el.preload = 'metadata';
        el.onloadedmetadata = function () {
          fin(el.duration > 0 && isFinite(el.duration) ? el.duration : 0);
        };
        el.onerror = function () { fin(0); };
        try { el.src = u; } catch (e) { fin(0); }
      });
    });
    return Promise.all(jobs).then(function (ds) {
      var total = ds.reduce(function (a, b) { return a + b; }, 0);
      var okCount = ds.filter(function (d) { return d > 0; }).length;
      return {
        duration: total > 0.5 ? total : _estimateDurationSec(text),
        okCount: okCount // how many chunk URLs actually preloaded
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Engine 3: Web Speech API (offline; speaks aloud, no capturable       */
  /* buffer — returns timing only so the chain never dead-ends)          */
  /* ------------------------------------------------------------------ */
  function _webspeechSpeak(text, voiceId) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
          reject(new Error('Web Speech API not available'));
          return;
        }
      } catch (e) { reject(e); return; }
      var utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1; utter.pitch = 1;
      try {
        var key = voiceId && voiceId.indexOf('webspeech:') === 0 ? voiceId.slice('webspeech:'.length) : null;
        var vs = speechSynthesis.getVoices() || [];
        for (var i = 0; i < vs.length; i++) {
          if ((vs[i].voiceURI || vs[i].name) === key) { utter.voice = vs[i]; break; }
        }
        if (!utter.voice) {
          var want = _baseLang(_guessLang(text));
          for (var j = 0; j < vs.length; j++) {
            if (vs[j].lang && vs[j].lang.toLowerCase().indexOf(want) === 0) { utter.voice = vs[j]; break; }
          }
        }
      } catch (e) { /* voice matching is best-effort */ }
      var t0 = Date.now();
      // Do NOT speak here — app.js speaks on Play via startWebSpeechPlayback,
      // so the utterance always starts from a real user gesture (browsers may
      // block speechSynthesis without one). Return the utterance for later.
      if (_cancelled) { reject(new Error('cancelled')); return; }
      resolve({
        audioBuffer: null,
        blob: null,
        url: null,
        duration: _estimateDurationSec(text),
        engine: 'webspeech',
        utterance: utter
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* MP3 -> AudioBuffer (browser decode, with per-chunk fallback)        */
  /* ------------------------------------------------------------------ */
  function _getAudioContext() {
    if (_sharedCtx) return _sharedCtx;
    var AC = null;
    try {
      AC = (typeof AudioContext !== 'undefined' && AudioContext) ||
           (typeof webkitAudioContext !== 'undefined' && webkitAudioContext) || null;
    } catch (e) { AC = null; }
    if (!AC) return null;
    try { _sharedCtx = new AC(); } catch (e) { _sharedCtx = null; }
    return _sharedCtx;
  }

  function _decodeOne(ctx, u8) {
    var ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    return ctx.decodeAudioData(ab);
  }

  // Decode concatenated MP3; if the joint stream won't decode, decode each
  // chunk and stitch the PCM into one AudioBuffer.
  function _decodeMp3(u8, chunkU8List) {
    var ctx = _getAudioContext();
    if (!ctx) return Promise.resolve(null);
    return _decodeOne(ctx, u8).catch(function () {
      var jobs = (chunkU8List || [u8]).map(function (c) {
        return _decodeOne(ctx, c).catch(function () { return null; });
      });
      return Promise.all(jobs).then(function (bufs) {
        bufs = bufs.filter(Boolean);
        if (!bufs.length) return null;
        var rate = bufs[0].sampleRate;
        var channels = bufs[0].numberOfChannels;
        var totalLen = bufs.reduce(function (a, b) { return a + b.length; }, 0);
        var out = ctx.createBuffer(channels, totalLen, rate);
        var off = 0, ch, i;
        for (i = 0; i < bufs.length; i++) {
          for (ch = 0; ch < channels; ch++) {
            if (ch < bufs[i].numberOfChannels) {
              out.getChannelData(ch).set(bufs[i].getChannelData(ch), off);
            }
          }
          off += bufs[i].length;
        }
        return out;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* TTS.synthesize(text, voiceId)                                       */
  /* ------------------------------------------------------------------ */
  function synthesize(text, voiceId) {
    _cancelled = false;
    var clean = String(text == null ? '' : text).trim();
    if (!clean) return Promise.resolve({ error: 'Empty text — nothing to synthesize.' });

    var voice = _findVoice(voiceId) || _findVoice(_defaultVoiceId(clean));
    var preferredEngine = voice ? voice.engine : 'edge';

    // Engine order: the explicitly chosen voice's engine first, then the rest.
    var order = [preferredEngine];
    ['edge', 'google', 'webspeech'].forEach(function (e) {
      if (order.indexOf(e) === -1) order.push(e);
    });

    var lastError = null;
    var chain = Promise.resolve(null);

    order.forEach(function (engine) {
      chain = chain.then(function (result) {
        if (result || _cancelled) return result; // already succeeded / cancelled
        return _runEngine(engine, clean, voice).then(
          function (r) { return r; },
          function (err) { lastError = err; return null; }
        );
      });
    });

    return chain.then(function (result) {
      if (_cancelled) return { error: 'cancelled' };
      if (result) return result;
      var msg = lastError ? (lastError.message || String(lastError)) : 'all TTS engines failed';
      return { error: msg };
    });
  }

  // One engine attempt. Resolves the full SPEC result object, or rejects so
  // the chain can try the next engine.
  function _runEngine(engine, text, voice) {
    if (engine === 'edge') {
      var shortName = voice && voice.engine === 'edge'
        ? voice.id.slice('edge:'.length)
        : _defaultVoiceId(text).replace(/^edge:/, '');
      var lang = voice && voice.lang ? voice.lang : _guessLang(text);
      var chunks = _chunkText(text, EDGE_CHUNK_LIMIT);
      var parts = [];
      var seq = Promise.resolve();
      chunks.forEach(function (ch) {
        seq = seq.then(function () {
          if (_cancelled) throw new Error('cancelled');
          return _edgeSynthesizeChunk(shortName, lang, ch);
        }).then(function (u8) {
          if (!u8 || !u8.length) throw new Error('Edge returned no audio');
          parts.push(u8);
        });
      });
      return seq.then(function () {
        return _finishMp3Result(_concatU8(parts), parts, text, 'edge');
      });
    }

    if (engine === 'google') {
      var tl = _baseLang(voice && voice.lang ? voice.lang : _guessLang(text));
      if (GOOGLE_LANGS.indexOf(tl) === -1) tl = 'en';
      var gchunks = _chunkText(text, GOOGLE_CHUNK_LIMIT);
      var gurls = gchunks.map(function (ch) {
        return GOOGLE_TTS_URL + '?client=tw-ob&tl=' + encodeURIComponent(tl) +
          '&q=' + encodeURIComponent(ch);
      });
      // BROWSER PATH (API.md §3): translate_tts sends NO CORS headers, so
      // fetch() is blocked. Play through <audio> elements instead — same
      // result shape as the webspeech path (no byte access; app.js drives the
      // mouth from LipSync.makeTalkingCues). Edge failure stays a silent,
      // normal step of the chain (Bilal finding #2 — confirmed by design).
      if (typeof Audio !== 'undefined') {
        return _googlePreloadDurations(gurls, text).then(function (info) {
          if (_cancelled) return Promise.reject(new Error('cancelled'));
          // If NONE of the chunk URLs preloaded, the audio is unloadable in
          // this browser (blocked network/region) — reject so the chain falls
          // through to Web Speech instead of returning a dead, silent result.
          if (!info.okCount) {
            return Promise.reject(new Error('Google TTS audio unreachable in this browser'));
          }
          return {
            audioBuffer: null, // CORS: Google MP3 bytes are unreadable from JS
            blob: null,
            url: gurls[0],
            urls: gurls,       // chunk playlist — app.js plays them in order
            duration: info.duration,
            engine: 'google'
          };
        });
      }
      // NODE / test-harness path: no CORS in Node, so keep the fetch/byte
      // path — this is what keeps the module verifiable off-browser.
      var gparts = [];
      var gseq = Promise.resolve();
      gchunks.forEach(function (ch) {
        gseq = gseq.then(function () {
          if (_cancelled) throw new Error('cancelled');
          var ctrl = null;
          try {
            if (typeof AbortController !== 'undefined') {
              ctrl = new AbortController();
              _markActive(ctrl);
              setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, FETCH_TIMEOUT_MS);
            }
          } catch (e) { ctrl = null; }
          return _googleSynthesizeChunk(tl, ch, ctrl ? ctrl.signal : undefined)
            .then(function (u8) {
              if (ctrl) _unmarkActive(ctrl);
              if (!u8 || !u8.length) throw new Error('Google returned no audio');
              gparts.push(u8);
            }, function (err) {
              if (ctrl) _unmarkActive(ctrl);
              throw err;
            });
        });
      });
      return gseq.then(function () {
        return _finishMp3Result(_concatU8(gparts), gparts, text, 'google');
      });
    }

    if (engine === 'webspeech') {
      var vid = voice && voice.engine === 'webspeech' ? voice.id : null;
      return _webspeechSpeak(text, vid).then(function (info) {
        return {
          audioBuffer: null, // Web Speech has no capturable buffer; app may synthesize silence of this duration for lip-sync
          blob: null,
          url: null,
          duration: (info && info.duration) || _estimateDurationSec(text),
          engine: 'webspeech',
          utterance: info && info.utterance // must pass through — app.js plays it on Play
        };
      });
    }

    return Promise.reject(new Error('unknown engine: ' + engine));
  }

  function _finishMp3Result(allBytes, chunkList, text, engineName) {
    if (_cancelled) return Promise.reject(new Error('cancelled'));
    return _decodeMp3(allBytes, chunkList).then(function (audioBuffer) {
      var blob = null, url = null;
      try {
        if (typeof Blob !== 'undefined') {
          blob = new Blob([allBytes], { type: 'audio/mpeg' });
          if (typeof URL !== 'undefined' && URL.createObjectURL) {
            url = URL.createObjectURL(blob);
          }
        }
      } catch (e) { blob = null; url = null; }
      return {
        audioBuffer: audioBuffer, // null only where AudioContext is unavailable (e.g. Node)
        blob: blob,
        url: url,
        duration: audioBuffer ? audioBuffer.duration : _estimateDurationSec(text),
        engine: engineName
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* TTS.cancel() — abort in-flight synthesis on every engine            */
  /* ------------------------------------------------------------------ */
  function cancel() {
    _cancelled = true;
    try {
      if (_activeWS) { _activeWS.close(); _activeWS = null; }
    } catch (e) {}
    _activeControllers.slice().forEach(function (c) {
      try { c.abort(); } catch (e) {}
    });
    _activeControllers.length = 0;
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Public API (exact SPEC.md contract)                                 */
  /* ------------------------------------------------------------------ */
  return {
    getVoices: getVoices,
    synthesize: synthesize,
    cancel: cancel,
    // underscore helpers for QA/unit tests (not part of the UI contract)
    _chunkText: _chunkText,
    _guessLang: _guessLang
  };
});
