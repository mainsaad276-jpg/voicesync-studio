/* VoxNova — js/lipsync.js
 * Owner: Hina (Lip-Sync Engine Developer)
 *
 * Contract (SPEC.md §3):
 *   LipSync.ready()        -> Promise<'rhubarb'|'heuristic'>   // which engine will be used
 *   LipSync.analyze(audioBuffer) -> Promise<{cues:[{viseme,start,end}], duration, engine}>
 *
 * Primary: Rhubarb LipSync WASM (open-source, free) from a pinned, verified CDN URL.
 * Fallback: built-in energy/amplitude heuristic — always works, zero network.
 * ready() honestly reports which engine will actually be used.
 * analyze() never throws: any Rhubarb failure degrades to the heuristic.
 */
(function (root) {
  'use strict';

  // Pinned CDN build, verified live 2026-10-08 (HTTP 200, content-type ok, CORS *):
  //   - ESM entry:  https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/index.mjs
  //                 sha256 of the exact served bytes (11,416 bytes):
  //                 bc9b36a83ea3707cdda4ecaf47d37ebff00a12b2764607c60a5cdb47f9cef198
  //                 -> runtime-verified by verifiedImport() before execution.
  //   - WASM glue:  https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/wasm/lip-sync-engine.js
  //   - WASM bin:   https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/wasm/lip-sync-engine.wasm
  //                 sha256 of the exact served bytes (1,890,181 bytes):
  //                 1846795c8f25b5069416d00f5053c40514725ad0899a9c3e2da6065dce54fa5a
  // The wasm binary is fetched internally by the glue script itself — there is
  // no import-boundary hook to verify it at runtime without duplicating the
  // ~1.9MB download, so its hash is verified out-of-band by the maintainer:
  //     curl -sL https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/wasm/lip-sync-engine.wasm | sha256sum
  // must print the value above. The version is pinned in the URL, so the bytes
  // are immutable; any drift fails init and ready() honestly reports 'heuristic'.
  var CDN_BASE   = 'https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3';
  var ENGINE_URL = CDN_BASE + '/dist/index.mjs';
  // Pinned hash of the ESM entry bytes (sha256, hex). Mismatch -> throw, so
  // ready() degrades honestly to the heuristic instead of running tampered code.
  var ENGINE_SHA256 = 'bc9b36a83ea3707cdda4ecaf47d37ebff00a12b2764607c60a5cdb47f9cef198';
  // "lip-sync-engine" is a WASM port of Rhubarb Lip Sync; mouthCues use Rhubarb
  // cue format {start, end, value} with visemes A..H + X.

  var TARGET_RATE = 16000;        // Rhubarb-class engines expect 16 kHz mono PCM
  var READY_TIMEOUT_MS = 25000;   // then honestly report 'heuristic' instead of hanging
  var VISEMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];

  var _state = null;              // 'rhubarb' | 'heuristic' once ready() settles
  var _readyPromise = null;
  var _analyzeFn = null;          // rhubarb analyze(pcm16, {sampleRate}) when loaded

  /* ---------------- pure helpers (unit-testable, node-safe) ---------------- */

  function validViseme(v) {
    return VISEMES.indexOf(v) !== -1 ? v : 'X';
  }

  // Accepts a real AudioBuffer OR a duck-typed {sampleRate, numberOfChannels, getChannelData(i)}.
  // Returns mono Int16Array PCM at targetRate Hz.
  function audioBufferToPCM16(audioBuffer, targetRate) {
    targetRate = targetRate || TARGET_RATE;
    var srcRate = audioBuffer.sampleRate || 44100;
    var channels = audioBuffer.numberOfChannels || 1;
    var frames = Infinity, data = [], c, i;
    for (c = 0; c < channels; c++) {
      var ch = audioBuffer.getChannelData(c);
      data.push(ch);
      if (ch.length < frames) frames = ch.length;
    }
    if (!isFinite(frames) || frames === 0) return new Int16Array(0);
    // downmix to mono
    var mono = new Float32Array(frames);
    for (i = 0; i < frames; i++) {
      var s = 0;
      for (c = 0; c < channels; c++) s += data[c][i];
      mono[i] = s / channels;
    }
    // linear resample
    var outLen = Math.max(1, Math.round(frames * targetRate / srcRate));
    var out = new Int16Array(outLen);
    for (var j = 0; j < outLen; j++) {
      var t = (j * srcRate) / targetRate;
      var i0 = Math.floor(t);
      var frac = t - i0;
      var a = mono[Math.min(i0, frames - 1)];
      var b = mono[Math.min(i0 + 1, frames - 1)];
      var v = a + (b - a) * frac;
      if (v > 1) v = 1; else if (v < -1) v = -1;
      out[j] = Math.round(v * 32767);
    }
    return out;
  }

  // Energy/amplitude heuristic. 40 ms windows -> one viseme per window, merged into cues.
  // Fully deterministic (no Math.random) so output is stable and testable.
  //   silence (low RMS)              -> X (rest)
  //   noisy/fricative (high ZCR)    -> F / C
  //   loud vowel-like (high RMS)    -> A / D / E
  //   mid energy (consonant-like)   -> B / G / H
  function heuristicCues(pcm16, sampleRate, totalDuration) {
    sampleRate = sampleRate || TARGET_RATE;
    var duration = (typeof totalDuration === 'number' && totalDuration > 0)
      ? totalDuration
      : pcm16.length / sampleRate;
    duration = Math.max(duration, 0);
    if (pcm16.length === 0 || duration <= 0) {
      return { cues: [{ viseme: 'X', start: 0, end: duration }], duration: duration, engine: 'heuristic' };
    }
    var WIN = Math.max(1, Math.floor(sampleRate * 0.04)); // 40 ms
    var SILENCE_RMS = 150;  // int16 units
    var LOUD_RMS = 5000;
    var FRIC_ZCR = 0.30;    // zero-crossings per sample
    var VOWELS = ['A', 'D', 'E'];
    var CONS = ['B', 'G', 'H'];
    var FRICS = ['F', 'C'];

    var winCount = Math.max(1, Math.ceil(pcm16.length / WIN));
    var per = [];
    for (var w = 0; w < winCount; w++) {
      var s0 = w * WIN;
      var s1 = Math.min(s0 + WIN, pcm16.length);
      var n = s1 - s0;
      var sum = 0, sumSq = 0, zc = 0, prev = 0;
      for (var i = s0; i < s1; i++) {
        var x = pcm16[i];
        sum += x;
        sumSq += x * x;
        if (i > s0 && ((prev < 0 && x >= 0) || (prev >= 0 && x < 0))) zc++;
        prev = x;
      }
      var mean = sum / n;
      var rms = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
      var zcr = zc / n;
      var vis;
      if (rms < SILENCE_RMS) vis = 'X';
      else if (zcr > FRIC_ZCR) vis = FRICS[w % FRICS.length];
      else if (rms > LOUD_RMS) vis = VOWELS[w % VOWELS.length];
      else vis = CONS[w % CONS.length];
      per.push(vis);
    }
    // merge consecutive identical visemes into cues
    var cues = [];
    var cur = per[0], start = 0;
    for (var k = 1; k <= winCount; k++) {
      if (k === winCount || per[k] !== cur) {
        cues.push({
          viseme: cur,
          start: (start * WIN) / sampleRate,
          end: Math.min(duration, (k * WIN) / sampleRate)
        });
        if (k < winCount) { cur = per[k]; start = k; }
      }
    }
    if (cues.length === 0) {
      cues = [{ viseme: 'X', start: 0, end: duration }];
    } else {
      cues[0].start = 0;                    // guarantee full coverage from t=0
      cues[cues.length - 1].end = duration; // ...to t=duration
    }
    return { cues: cues, duration: duration, engine: 'heuristic' };
  }

  /* ---------------- Rhubarb WASM (primary) ---------------- */

  // Native dynamic import() — lazy, only runs when ready() is called; the
  // classic-script wrapper stays parseable everywhere and no 'unsafe-eval'
  // (new Function) is used, so strict CSPs keep working.
  function verifiedImport(url) {
    return fetch(url).then(function (res) {
      if (!res || !res.ok) throw new Error('rhubarb: entry fetch failed');
      return res.arrayBuffer();
    }).then(function (buf) {
      if (typeof crypto !== 'undefined' && crypto.subtle &&
          typeof crypto.subtle.digest === 'function') {
        return crypto.subtle.digest('SHA-256', buf).then(function (digest) {
          if (hexOf(new Uint8Array(digest)) !== ENGINE_SHA256) {
            throw new Error('rhubarb: entry integrity mismatch');
          }
          return buf;
        });
      }
      return buf; // non-secure context: crypto.subtle unavailable, import unchecked
    }).then(function (buf) {
      // Import the VERIFIED bytes (self-contained bundle, no relative
      // sub-imports — checked 2026-10-08). The WASM glue resolves its binary
      // relative to its own CDN URL, unaffected by the blob base.
      // CSP note: a policy that blocks blob: scripts makes this reject, and
      // ready() then honestly reports 'heuristic'.
      return import(URL.createObjectURL(new Blob([buf], { type: 'text/javascript' })));
    });
  }

  function hexOf(bytes) {
    var out = '', i, b;
    for (i = 0; i < bytes.length; i++) {
      b = bytes[i].toString(16);
      out += (b.length === 1 ? '0' + b : b);
    }
    return out;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, ms);
      promise.then(
        function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
      );
    });
  }

  function loadRhubarb() {
    var p = verifiedImport(ENGINE_URL);
    return withTimeout(p, READY_TIMEOUT_MS).then(function (mod) {
      if (!mod) throw new Error('rhubarb: module load failed or timed out');
      var inst = null;
      if (mod.LipSyncEngine && typeof mod.LipSyncEngine.getInstance === 'function') {
        inst = mod.LipSyncEngine.getInstance();
      }
      var initP = (inst && typeof inst.init === 'function') ? inst.init() : Promise.resolve();
      return withTimeout(Promise.resolve(initP), READY_TIMEOUT_MS).then(function (ok) {
        if (ok === null) throw new Error('rhubarb: init failed or timed out');
        var fn = (typeof mod.analyze === 'function')
          ? mod.analyze
          : (inst && typeof inst.analyze === 'function' ? inst.analyze.bind(inst) : null);
        if (!fn) throw new Error('rhubarb: no analyze() export found');
        return { analyzeFn: fn };
      });
    });
  }

  function rhubarbAnalyze(pcm16, duration) {
    return _analyzeFn(pcm16, { sampleRate: TARGET_RATE }).then(function (res) {
      var raw = (res && res.mouthCues) || [];
      var cues = [];
      for (var i = 0; i < raw.length; i++) {
        var c = raw[i] || {};
        var start = +c.start, end = +c.end;
        if (!(start >= 0) || !(end > start)) continue; // drop malformed cues
        cues.push({ viseme: validViseme(c.value), start: start, end: end });
      }
      if (cues.length === 0) throw new Error('rhubarb returned no usable cues');
      var dur = (res && res.metadata && +res.metadata.duration) || duration;
      return { cues: cues, duration: dur, engine: 'rhubarb' };
    });
  }

  /* ---------------- public contract ---------------- */

  // SPEC §3: synthetic speech-like cue stream for playback paths where no
  // audio buffer exists (Google <audio>-element playback, Web Speech).
  // Pure function, no WASM. Alternating open/close visemes ≈8/sec so the
  // avatar's mouth always moves — deterministic (no Math.random), so it is
  // stable and unit-testable.
  function makeTalkingCues(durationSec) {
    var duration = Math.max(0.1, +durationSec || 0);
    var STEP = 0.125; // 8 viseme changes per second
    var OPEN = ['A', 'D', 'E', 'C'];
    var SHUT = ['X', 'B'];
    var cues = [];
    var t = 0, i = 0;
    while (t < duration) {
      var end = Math.min(duration, t + STEP);
      var v = (i % 2 === 0)
        ? OPEN[((i / 2) % OPEN.length) | 0]
        : SHUT[(((i - 1) / 2) % SHUT.length) | 0];
      cues.push({ viseme: validViseme(v), start: t, end: end });
      t = end;
      i++;
    }
    return cues;
  }

  function ready() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = loadRhubarb().then(
      function (ok) {
        _analyzeFn = ok.analyzeFn;
        _state = 'rhubarb';
        return 'rhubarb';
      },
      function () {
        _analyzeFn = null;
        _state = 'heuristic';
        return 'heuristic';
      }
    );
    return _readyPromise;
  }

  function analyze(audioBuffer) {
    var duration = (audioBuffer && typeof audioBuffer.duration === 'number' && audioBuffer.duration > 0)
      ? audioBuffer.duration
      : ((audioBuffer && audioBuffer.length && audioBuffer.sampleRate)
          ? audioBuffer.length / audioBuffer.sampleRate : 0);
    var pcm16;
    try {
      pcm16 = audioBufferToPCM16(audioBuffer, TARGET_RATE);
    } catch (e) {
      pcm16 = new Int16Array(0);
    }
    return ready().then(function () {
      if (_state === 'rhubarb' && _analyzeFn) {
        // never let a mid-run Rhubarb failure reach the UI: degrade to heuristic
        return rhubarbAnalyze(pcm16, duration).catch(function () {
          return heuristicCues(pcm16, TARGET_RATE, duration);
        });
      }
      return heuristicCues(pcm16, TARGET_RATE, duration);
    });
  }

  var LipSync = { ready: ready, analyze: analyze, makeTalkingCues: makeTalkingCues };

  root.LipSync = LipSync;

  // node test hook: exposes pure internals without affecting browser usage
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      LipSync: LipSync,
      _internal: {
        VISEMES: VISEMES,
        ENGINE_URL: ENGINE_URL,
        validViseme: validViseme,
        audioBufferToPCM16: audioBufferToPCM16,
        heuristicCues: heuristicCues,
        makeTalkingCues: makeTalkingCues
      }
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
