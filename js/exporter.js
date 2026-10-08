/**
 * js/exporter.js — Faraz (Export & Storage Engineer)
 *
 * VoiceSync Studio export layer. Exposes exactly the SPEC.md contract:
 *
 *   Exporter.downloadAudio(blob, filename)
 *   Exporter.encodeWAV(audioBuffer) -> Blob            // RIFF-valid WAV
 *   Exporter.recordVideo(canvas, audioURL, {width,height}) -> Promise<Blob>  // WebM
 *   Exporter.saveProject(obj) / Exporter.loadProject()  // JSON file + localStorage
 *
 * Design notes
 * - The WAV encoder is factored as pure logic (no browser globals) so it can
 *   be unit-tested in node. The node entry point is exposed at the bottom
 *   (`_encodeWAVBytes`); it never touches window/document/navigator.
 * - recordVideo never crashes: if MediaRecorder or canvas.captureStream() is
 *   missing it rejects with a clean, user-friendly Error message.
 * - The exported WebM carries the voiceover audio too: the playing <audio>
 *   element is routed through a MediaStreamDestination and its track is added
 *   to the captured stream. If that fails (old browser, CORS taint), the
 *   export still resolves as video-only rather than failing.
 */
(function (globalScope) {
  'use strict';

  var STORAGE_KEY = 'voicesync-studio.project.v1';
  var VIDEO_UNSUPPORTED_MSG =
    'Video export is not supported in this browser. ' +
    'Please use Chrome or Edge on desktop to export video — ' +
    'audio export and project save still work everywhere.';

  /* =====================================================================
   * Pure WAV encoding — no browser globals. Safe to run in node.
   * ===================================================================== */

  function writeAscii(view, offset, text) {
    for (var i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  function floatTo16BitPCM(view, offset, data) {
    for (var i = 0; i < data.length; i++, offset += 2) {
      var s = Math.max(-1, Math.min(1, data[i]));
      // eslint-disable-next-line no-bitwise
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }

  // Interleave the channels of an AudioBuffer-like ({sampleRate, length,
  // numberOfChannels, getChannelData}) into a single Float32Array.
  // Stereo is preserved; >2 channels are downmixed to the first two.
  function interleaveChannels(audioBuffer) {
    var channels = Math.max(1, Math.min(2, audioBuffer.numberOfChannels || 1));
    var frames = audioBuffer.length >>> 0; // sample frames per channel
    var out = new Float32Array(frames * channels);
    for (var c = 0; c < channels; c++) {
      var src = audioBuffer.getChannelData(c);
      for (var i = 0; i < frames; i++) {
        out[i * channels + c] = src[i] || 0;
      }
    }
    return { samples: out, channels: channels };
  }

  // Pure function: AudioBuffer-like -> RIFF/WAV bytes (16-bit PCM).
  function encodeWAVBytes(audioBuffer) {
    if (
      !audioBuffer ||
      typeof audioBuffer.getChannelData !== 'function' ||
      !(audioBuffer.sampleRate > 0) ||
      !(audioBuffer.length >= 0)
    ) {
      throw new Error(
        'encodeWAV needs an AudioBuffer with sampleRate, length and getChannelData().'
      );
    }
    var sampleRate = audioBuffer.sampleRate >>> 0;
    var mixed = interleaveChannels(audioBuffer);
    var samples = mixed.samples;
    var numChannels = mixed.channels;
    var dataLen = samples.length * 2; // 16 bits per sample

    var buffer = new ArrayBuffer(44 + dataLen);
    var view = new DataView(buffer);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLen, true); // RIFF chunk size
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size (PCM)
    view.setUint16(20, 1, true); // audio format: PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataLen, true); // data chunk length
    floatTo16BitPCM(view, 44, samples);

    return new Uint8Array(buffer);
  }

  /* =====================================================================
   * Browser helpers (never called from node tests)
   * ===================================================================== */

  /* B5 (Play Store round): Android wrapper bridge. When the WebView
     wrapper is present, hand the file to it so it lands in the user's real
     Downloads folder; otherwise use the normal browser anchor download. */
  function wrapperBridge() {
    try {
      if (typeof window === 'undefined') return null;
      var b = window.VoiceSyncBridge;
      if (b && typeof b.saveFile === 'function') return b;
      var vn = window.VSNative;
      if (vn && vn.isNative === true && typeof vn.saveFile === 'function') {
        // Capacitor app: saveFile(name, base64) — adapt argument order.
        return { saveFile: function (b64, filename /*, mime */) { return vn.saveFile(filename, b64); } };
      }
    } catch (e) {}
    return null;
  }

  function blobToBase64(blob, cb) {
    try {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || '');
        cb(s.indexOf(',') >= 0 ? s.split(',')[1] : s);
      };
      fr.onerror = function () { cb(null); };
      fr.readAsDataURL(blob);
    } catch (e) { cb(null); }
  }

  function anchorDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'voicesync-download.bin';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function triggerDownload(blob, filename) {
    if (!blob) {
      throw new Error('Nothing to download — no file data was provided.');
    }
    filename = filename || 'voicesync-download.bin';
    var bridge = wrapperBridge();
    if (bridge) {
      var mime = blob.type || 'application/octet-stream';
      blobToBase64(blob, function (b64) {
        if (b64) {
          try { bridge.saveFile(b64, filename, mime); return; }
          catch (e) { /* bridge failed — fall through to anchor */ }
        }
        anchorDownload(blob, filename);
      });
      return;
    }
    anchorDownload(blob, filename);
  }

  function pickVideoMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      return '';
    }
    var candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (e) {
        /* try next candidate */
      }
    }
    return '';
  }

  // Route the playing <audio> element into the captured stream so the WebM
  // includes the voiceover. Best-effort: failures keep video-only export.
  // Returns the created AudioContext (or null) so the caller can close it
  // when the export finishes (M4: prevents one-leak-per-export).
  function muxAudioIntoStream(stream, audioEl, musicEl, musicVolume) {
    var ctx = null; // hoisted so fail paths can still return it for close()
    try {
      var AC =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : typeof webkitAudioContext !== 'undefined'
            ? webkitAudioContext
            : null;
      if (!AC) return null;
      ctx = new AC();
      var src = ctx.createMediaElementSource(audioEl);
      var dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ctx.destination); // keep it audible while recording
      // Optional background music, mixed low under the voiceover.
      if (musicEl) {
        try {
          var msrc = ctx.createMediaElementSource(musicEl);
          var gain = ctx.createGain();
          gain.gain.value = typeof musicVolume === 'number' ? musicVolume : 0.2;
          msrc.connect(gain);
          gain.connect(dest);
          msrc.connect(ctx.destination);
        } catch (e2) { /* music is best-effort */ }
      }
      var tracks = dest.stream.getAudioTracks();
      if (tracks.length > 0) stream.addTrack(tracks[0]);
      return ctx;
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Exporter] voiceover audio not embedded in video:', e.message);
      }
      return ctx;
    }
  }

  /* =====================================================================
   * SPEC.md contract surface
   * ===================================================================== */

  var Exporter = {
    /**
     * Trigger a browser download of a Blob (WAV audio in normal use).
     */
    downloadAudio: function (blob, filename) {
      triggerDownload(blob, filename || 'voicesync-audio.wav');
    },

    /**
     * Encode an AudioBuffer (or AudioBuffer-like) to a RIFF/WAV Blob.
     * 16-bit PCM, keeps sampleRate + mono/stereo of the source.
     */
    encodeWAV: function (audioBuffer) {
      var bytes = encodeWAVBytes(audioBuffer); // throws a clean Error on bad input
      return new Blob([bytes], { type: 'audio/wav' });
    },

    /**
     * Record the talking-character canvas while the voiceover plays.
     * Resolves with a WebM Blob. Rejects with a clean, user-friendly Error
     * when MediaRecorder/captureStream is unavailable (never crashes).
     *
     * @param {HTMLCanvasElement} canvas   live avatar canvas (Avatar.getCanvas())
     * @param {string}            audioURL blob/object URL of the voiceover audio
     * @param {object}            opts     {width, height} — used to size the
     *                                    video bitrate; the canvas's own
     *                                    resolution is the output resolution.
     *                                    {durationMs} fallback when no audioURL.
     */
    recordVideo: function (canvas, audioURL, opts) {
      opts = opts || {};
      return new Promise(function (resolve, reject) {
        if (
          typeof MediaRecorder === 'undefined' ||
          !canvas ||
          typeof canvas.captureStream !== 'function'
        ) {
          reject(new Error(VIDEO_UNSUPPORTED_MSG));
          return;
        }

        var width = opts.width || canvas.width || 1280;
        var height = opts.height || canvas.height || 720;
        var settled = false;
        var safetyTimer = null;
        var audioEl = null;
        var musicEl = null;
        var recorder = null;
        var audioCtx = null; // AudioContext from muxAudioIntoStream — closed in onstop/fail (M4)

        function clearTimer() {
          if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
        }

        // M4: close the mux AudioContext exactly once (guard against
        // double-close from onstop-after-fail and AudioContext.close() quirks).
        function closeAudioCtx() {
          var c = audioCtx;
          audioCtx = null; // null first: makes this safe to call twice
          if (c && typeof c.close === 'function') {
            try {
              var p = c.close();
              if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) {
              /* already closed / closing — ignore */
            }
          }
        }

        function stopRecorder() {
          try {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
          } catch (e) {
            /* already stopped */
          }
        }

        function finish() {
          if (settled) return;
          stopRecorder(); // onstop below resolves the promise
        }

        function fail(message) {
          if (settled) return;
          settled = true;
          clearTimer();
          stopRecorder();
          closeAudioCtx(); // M4: no leak on error paths
          if (audioEl) {
            try {
              audioEl.pause();
            } catch (e) {
              /* ignore */
            }
          }
          reject(new Error(message));
        }

        try {
          var stream = canvas.captureStream(30);
          var mimeType = pickVideoMimeType();
          // Bitrate scales with the requested output size (width/height are
          // the contract's output-size hint), clamped to sane bounds.
          var videoBitsPerSecond = Math.max(
            500000,
            Math.min(8000000, Math.round(width * height * 0.12))
          );
          var recorderOptions = { videoBitsPerSecond: videoBitsPerSecond };
          if (mimeType) recorderOptions.mimeType = mimeType;
          recorder = new MediaRecorder(stream, recorderOptions);

          var chunks = [];
          recorder.ondataavailable = function (ev) {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };
          recorder.onstop = function () {
            if (settled) return;
            settled = true;
            clearTimer();
            if (audioEl) {
              try {
                audioEl.pause();
              } catch (e) {
                /* ignore */
              }
            }
            if (musicEl) {
              try {
                musicEl.pause();
              } catch (e) {
                /* ignore */
              }
            }
            closeAudioCtx(); // M4: release the mux AudioContext on completion
            resolve(new Blob(chunks, { type: 'video/webm' }));
          };
          recorder.onerror = function (ev) {
            var detail =
              ev && ev.error && ev.error.message ? ev.error.message : 'unknown recorder error';
            fail('Video recording failed: ' + detail);
          };


          if (audioURL) {
            audioEl = new Audio(audioURL);
            // Optional background music mixed under the voiceover in the video.
            musicEl = null;
            if (opts.musicURL) {
              try {
                musicEl = new Audio(opts.musicURL);
                musicEl.loop = true;
                musicEl.volume = 1; // level is set by the mixer's gain node
              } catch (e) { musicEl = null; }
            }
            audioCtx = muxAudioIntoStream(stream, audioEl, musicEl, opts.musicVolume); // embed voiceover in the WebM
            // M1: SPEC §3 onAudio hook — app.js attaches live lip-sync
            // (Avatar.speak) and drives Shorts captions off this element.
            // Called before play() so the hook can set playbackRate first.
            if (typeof opts.onAudio === 'function') {
              try {
                opts.onAudio(audioEl);
              } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                  console.warn('[Exporter] onAudio hook failed:', e.message);
                }
              }
            }
            audioEl.onended = function () {
              if (musicEl) { try { musicEl.pause(); } catch (e) {} }
              finish();
            };
            audioEl.onerror = function () {
              if (musicEl) { try { musicEl.pause(); } catch (e) {} }
              fail('Video export stopped: the voiceover audio could not be played.');
            };
            recorder.start(250);
            safetyTimer = setTimeout(finish, 180000); // 3-minute hard cap
            var playPromise = audioEl.play();
            if (musicEl) {
              try {
                var mpp = musicEl.play();
                if (mpp && typeof mpp.catch === 'function') mpp.catch(function () {});
              } catch (e) {}
            }
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch(function (err) {
                fail(
                  'Video export stopped: audio playback was blocked by the browser' +
                    (err && err.message ? ' (' + err.message + ')' : '') +
                    '. Tap the export button again.'
                );
              });
            }
          } else {
            // No audio: record a short silent clip of the canvas.
            recorder.start(250);
            safetyTimer = setTimeout(finish, opts.durationMs || 5000);
          }
        } catch (err) {
          fail(
            'Video export could not start: ' +
              (err && err.message ? err.message : String(err))
          );
        }
      });
    },

    /**
     * Persist the project: JSON file download AND localStorage copy.
     * Returns the JSON string (handy for tests / debugging).
     */
    saveProject: function (obj) {
      var json = JSON.stringify(obj == null ? {} : obj, null, 2);
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch (e) {
        // Private browsing / disabled storage: the file download still works.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Exporter] localStorage unavailable, project saved as file only.');
        }
      }
      triggerDownload(new Blob([json], { type: 'application/json' }), 'voicesync-project.json');
      return json;
    },

    /**
     * Load the project back from localStorage. Returns the parsed object,
     * or null when nothing was saved yet (or storage is unavailable).
     */
    loadProject: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
  };

  // Browser global for app.js wiring.
  globalScope.Exporter = Exporter;

  // Node testability: expose the contract surface and the pure WAV logic
  // (no browser globals touched at require time).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      Exporter: Exporter,
      _encodeWAVBytes: encodeWAVBytes,
      _storageKey: STORAGE_KEY,
      _videoUnsupportedMsg: VIDEO_UNSUPPORTED_MSG
    };
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
