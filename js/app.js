/* ============================================================
 * VoiceSync Studio — js/app.js
 * Owner: Daniyal (Team Lead / Architect)
 *
 * Defensive orchestrator. Feature-detects every teammate module
 * (tts.js, lipsync.js, avatar.js, exporter.js, i18n.js) and
 * degrades gracefully instead of crashing when one is missing —
 * teammates work in parallel, so this file NEVER assumes a module
 * exists. Wires the SPEC §3 contracts + §3.6 DOM ids.
 * Vanilla JS, no build step, no API keys.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- tiny helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  // SPEC §3.7: each module attaches its namespace to window.
  function hasModule(name) {
    return typeof window[name] !== 'undefined' && window[name] !== null;
  }

  function safeGet(fn, fallback) {
    try { var v = fn(); return (v === undefined || v === null) ? fallback : v; }
    catch (e) { return fallback; }
  }

  /* ---------------- strings ----------------
   * Fallback English used when i18n.js is not loaded yet.
   * t(key) prefers I18N.strings[state.lang][key] when available. */
  var FALLBACK = {
    enterText: 'Please type or paste some text first.',
    ttsMissing: 'TTS module (js/tts.js) is not loaded yet.',
    avatarMissing: 'Avatar module (js/avatar.js) is not loaded.',
    exporterMissing: 'Exporter module (js/exporter.js) is not loaded yet.',
    generating: 'Generating voice…',
    working: 'Working…',
    analyzing: 'Analyzing lip-sync…',
    playing: 'Playing…',
    done: 'Done.',
    stopped: 'Stopped.',
    ttsFailed: 'Voice generation failed',
    noAudio: 'TTS returned no audio and no utterance.',
    playFailed: 'Playback was blocked by the browser. Tap Play to try again.',
    audioLoadFailed: 'Audio failed to load in this browser — the built-in voice will be used instead. Tap Play.',
    readyTapPlay: 'Voice ready — tap Play to hear it.',
    nothingToPlay: 'Generate a voiceover first, then press Play.',
    exportNeedsAudio: 'Nothing to export yet — generate a voiceover first. (Browser-voice playback has no audio file to export; pick a neural voice with internet on.)',
    lipsyncLoading: 'Loading lip-sync engine (one-time download)…',
    wavSaved: 'WAV downloaded.',
    mp3Saved: 'MP3 downloaded.',
    videoSaved: 'Video downloaded.',
    videoUnsupported: 'Video export is not supported in this browser.',
    exportFailed: 'Export failed',
    recording: 'Recording video…',
    voicesLoading: 'Loading voices…',
    noVoices: 'No voices found for this language.',
    projectSaved: 'Project saved.',
    projectLoaded: 'Project loaded.',
    projectLoadFailed: 'Could not read that project file.',
    btn_record: 'Record My Voice',
    btn_stop_record: 'Stop Recording',
    requestingMic: 'Requesting microphone…',
    recording: 'Recording… tap Record again to stop.',
    recordReady: 'Recording ready — tap Play to hear it.',
    recordEmpty: 'No audio recorded.',
    micDenied: 'Microphone access was denied.',
    micUnsupported: 'Recording is not supported in this browser.',
    useWavForMic: 'For your recording use Download WAV (MP3 encoding is not available for mic audio).',
    chatterboxWorking: 'Making the human-like voice… (free shared server, may take a minute)',
    chatterboxBusy: 'Human-like voice server is busy right now — tap Play for the device voice, or try Chatterbox again later.',
    modulesLabel: 'Modules'
  };

  var state = {
    lang: 'en',          // UI language (I18N)
    ttsLang: 'ur',       // synthesis language
    voiceId: null,
    lastResult: null,    // last TTS.synthesize result
    lastCues: [],        // last LipSync cue list
    lastUrl: null,       // object URL of last audio (revoked on regenerate)
    audioEl: null,       // HTMLAudioElement for the audio playback path
    speaking: false,
    clockTimer: 0,       // interval id for the webspeech virtual clock
    playToken: 0,        // bumped by stopAll(); Google chunk chains check it
    lipEngine: '',       // 'rhubarb' | 'heuristic' | '' (from LipSync.ready)
    recording: false,    // mic recording in progress
    recorder: null,       // active MediaRecorder
    recordChunks: [],     // recorded audio chunks
    recordStream: null,   // microphone MediaStream
    recordT0: 0,          // recording start timestamp
    micUrl: null,         // object URL of last mic recording
    rafId: 0             // timeline rAF id
  };

  function t(key) {
    var s = safeGet(function () { return window.I18N.strings[state.lang][key]; }, undefined);
    if (typeof s === 'string' && s) return s;
    return FALLBACK[key] || key;
  }

  function setMsg(msg, isError) {
    var el = $('statusMsg');
    if (!el) return;
    el.textContent = msg || '';
    el.setAttribute('data-kind', isError ? 'error' : 'info');
  }

  /* ---------------- module status line ---------------- */

  function renderModuleStatus() {
    var el = $('moduleStatus');
    if (!el) return;
    var parts = [
      'TTS ' + (hasModule('TTS') ? '✓' : '✗'),
      'LipSync ' + (hasModule('LipSync') ? '✓' : '✗') + (state.lipEngine ? ' (' + state.lipEngine + ')' : ''),
      'Avatar ' + (hasModule('Avatar') ? '✓' : '✗'),
      'Exporter ' + (hasModule('Exporter') ? '✓' : '✗'),
      'I18N ' + (hasModule('I18N') ? '✓' : '✗')
    ];
    el.textContent = t('modulesLabel') + ': ' + parts.join(' · ');
  }

  function probeLipSync() {
    // SPEC §3: LipSync.ready() -> Promise<'rhubarb'|'heuristic'>
    if (!hasModule('LipSync') || typeof window.LipSync.ready !== 'function') {
      renderModuleStatus();
      return;
    }
    // Integration finding #4: the ~37 MB Rhubarb model downloads on first
    // init() — show a status line instead of a silent page while it loads.
    var settled = false;
    var nag = setTimeout(function () {
      if (!settled) setMsg(t('lipsyncLoading'));
    }, 2000);
    function done(engine) {
      settled = true;
      clearTimeout(nag);
      state.lipEngine = engine || 'unknown';
      renderModuleStatus();
    }
    window.LipSync.ready().then(done).catch(function () { done('heuristic'); });
  }

  /* ---------------- language (I18N) ---------------- */

  function applyI18n() {
    if (hasModule('I18N') && typeof window.I18N.apply === 'function') {
      try { window.I18N.apply(state.lang); } catch (e) { /* never crash on i18n */ }
    }
    try { localStorage.setItem('voicesync-lang', state.lang); } catch (e) {}
    renderModuleStatus();
  }

  function initLanguage() {
    var saved = safeGet(function () { return localStorage.getItem('voicesync-lang'); }, null);
    if (saved === 'ur' || saved === 'en') state.lang = saved;
    var lt = $('langToggle');
    if (lt) {
      lt.value = state.lang;
      lt.addEventListener('change', function () {
        state.lang = (lt.value === 'ur') ? 'ur' : 'en';
        applyI18n();
      });
    }
  }

  /* ---------------- text input ---------------- */

  function updateCharCount() {
    var box = $('textInput'), cc = $('charCount');
    if (!box || !cc) return;
    cc.textContent = String(box.value.length);
  }

  function initTextInput() {
    var box = $('textInput');
    if (box) box.addEventListener('input', updateCharCount);
    updateCharCount();
  }

  /* ---------------- voices ---------------- */

  function initTtsControls() {
    var tl = $('ttsLang');
    if (tl) {
      tl.value = state.ttsLang;
      tl.addEventListener('change', function () {
        state.ttsLang = (tl.value === 'en') ? 'en' : 'ur';
        loadVoices();
      });
    }
    loadVoices();
  }

  // SPEC §3: TTS.getVoices(lang) -> Promise<[{id,name,lang,gender,engine}]>
  async function loadVoices() {
    var sel = $('voiceSelect');
    if (!sel) return;
    sel.innerHTML = '';
    if (!hasModule('TTS') || typeof window.TTS.getVoices !== 'function') {
      var missing = document.createElement('option');
      missing.textContent = t('ttsMissing');
      sel.appendChild(missing);
      state.voiceId = null;
      renderModuleStatus();
      return;
    }
    var loading = document.createElement('option');
    loading.textContent = t('voicesLoading');
    sel.appendChild(loading);
    var voices = [];
    try { voices = await window.TTS.getVoices(state.ttsLang); } catch (e) { voices = []; }
    sel.innerHTML = '';
    if (!voices || !voices.length) {
      var none = document.createElement('option');
      none.textContent = t('noVoices');
      sel.appendChild(none);
      state.voiceId = null;
      return;
    }
    voices.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.name + ' (' + v.engine + ')';
      sel.appendChild(o);
    });
    var saved = safeGet(function () { return localStorage.getItem('voicesync-voice'); }, null);
    var pick = voices[0];
    if (saved) {
      var found = null;
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].id === saved) { found = voices[i]; break; }
      }
      if (found) pick = found;
    }
    sel.value = pick.id;
    state.voiceId = pick.id;
    sel.onchange = function () {
      state.voiceId = sel.value;
      try { localStorage.setItem('voicesync-voice', sel.value); } catch (e) {}
    };
  }

  /* ---------------- avatar ---------------- */

  function mountAvatar() {
    var mount = $('avatarMount');
    if (!mount) return;
    if (!hasModule('Avatar') || typeof window.Avatar.mount !== 'function') {
      mount.textContent = t('avatarMissing');
      return;
    }
    try { window.Avatar.mount(mount); }
    catch (e) { mount.textContent = 'Avatar failed to mount: ' + (e && e.message ? e.message : e); }
  }

  function stopAvatar() {
    try {
      if (hasModule('Avatar') && typeof window.Avatar.stop === 'function') window.Avatar.stop();
    } catch (e) { /* never crash on avatar */ }
  }

  /* ---------------- playback ---------------- */

  function releaseLastAudio() {
    if (state.lastUrl) {
      try { URL.revokeObjectURL(state.lastUrl); } catch (e) {}
      state.lastUrl = null;
    }
  }

  function stopAll() {
    state.playToken++; // invalidate any in-flight Google chunk chain
    if (state.recording) { stopRecording(); }
    try {
      if (hasModule('TTS') && typeof window.TTS.cancel === 'function') window.TTS.cancel();
    } catch (e) {}
    if (state.audioEl) {
      try { state.audioEl.pause(); state.audioEl.removeAttribute('src'); } catch (e) {}
      state.audioEl = null;
    }
    try { if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel(); } catch (e) {}
    stopAvatar();
    if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = 0; }
    stopTimeline();
    state.speaking = false;
  }

  // SPEC §3: LipSync.analyze never rejects; {error} -> static mouth.
  async function getCues(audioBuffer) {
    if (!hasModule('LipSync') || typeof window.LipSync.analyze !== 'function') return [];
    if (!state.lipEngine) setMsg(t('lipsyncLoading')); // model still downloading
    try {
      var out = await window.LipSync.analyze(audioBuffer);
      if (out && !out.error && Array.isArray(out.cues)) return out.cues;
      return [];
    } catch (e) { return []; }
  }

  // Audio path: real audio element + real viseme cues.
  function startAudioPlayback(result, cues) {
    stopAll();
    var el = new Audio();
    state.audioEl = el;
    el.preload = 'auto';
    el.src = result.url;
    el.onended = function () { stopAvatar(); stopTimeline(); state.speaking = false; setMsg(t('done')); };
    el.onerror = function () { stopAll(); setMsg(t('audioLoadFailed'), true); };
    // SPEC §3: Avatar.speak(cues, timeSrc) — timeSrc may be HTMLAudioElement.
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(cues || [], el); } catch (e) {}
    }
    state.speaking = true;
    setMsg(t('playing'));
    var p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { stopAll(); setMsg(t('playFailed'), true); });
    }
    startTimeline(function () { return el.currentTime || 0; }, result.duration || 0);
  }

  // Web Speech path: no audio buffer exists — synthetic cues + virtual clock.
  function startWebSpeechPlayback(result) {
    stopAll();
    if (typeof window.speechSynthesis === 'undefined' || !result.utterance) {
      setMsg(t('ttsFailed') + ': speechSynthesis unavailable', true);
      return;
    }
    var u = result.utterance;
    var dur = result.duration || 5;
    var cues = [];
    if (hasModule('LipSync') && typeof window.LipSync.makeTalkingCues === 'function') {
      try { cues = window.LipSync.makeTalkingCues(dur) || []; } catch (e) { cues = []; }
    }
    // Virtual timing source: Avatar.speak only reads .currentTime (SPEC §3).
    var clock = { currentTime: 0 };
    var t0 = performance.now();
    state.clockTimer = setInterval(function () {
      clock.currentTime = (performance.now() - t0) / 1000;
    }, 50);
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(cues, clock); } catch (e) {}
    }
    u.onend = function () { stopAll(); setMsg(t('done')); };
    u.onerror = function (ev) {
      stopAll();
      setMsg(t('ttsFailed') + (ev && ev.error ? ': ' + ev.error : ''), true);
    };
    state.speaking = true;
    setMsg(t('playing'));
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      stopAll();
      setMsg(t('ttsFailed') + ': ' + (e && e.message ? e.message : e), true);
      return;
    }
    startTimeline(function () { return clock.currentTime; }, dur);
  }

  // Google path (API.md §3): translate_tts sends no CORS headers, so the
  // MP3 bytes are unreadable from JS — playback goes through <audio>
  // elements, one per ≤200-char chunk URL. The mouth moves from
  // LipSync.makeTalkingCues (SPEC §3): NEVER a dead mouth on this path.
  // Avatar.speak only reads .currentTime, so a virtual clock that
  // accumulates across chunks is a valid timeSrc.
  function startGooglePlayback(result) {
    stopAll();
    var token = state.playToken;
    var urls = (result.urls && result.urls.length) ? result.urls.slice() : [result.url];
    var dur = result.duration || 5;
    var perChunk = dur / urls.length;
    var cues = [];
    if (hasModule('LipSync') && typeof window.LipSync.makeTalkingCues === 'function') {
      try { cues = window.LipSync.makeTalkingCues(dur) || []; } catch (e) { cues = []; }
    }
    state.lastCues = cues;
    var clock = { currentTime: 0 };
    var offset = 0, idx = 0, el = null;

    state.clockTimer = setInterval(function () {
      clock.currentTime = offset + (el && typeof el.currentTime === 'number' ? el.currentTime : 0);
    }, 50);

    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(cues, clock); } catch (e) {}
    }

    function playNext() {
      if (token !== state.playToken) return; // superseded by stopAll()
      if (idx >= urls.length) { stopAll(); setMsg(t('done')); return; }
      el = new Audio();
      state.audioEl = el;
      el.preload = 'auto';
      try { el.src = urls[idx]; } catch (e) { stopAll(); setMsg(t('playFailed'), true); return; }
      el.onended = function () {
        try { offset += (el.duration > 0 && isFinite(el.duration)) ? el.duration : perChunk; }
        catch (e) { offset += perChunk; }
        idx++;
        playNext();
      };
      el.onerror = function () {
        if (token === state.playToken) { stopAll(); setMsg(t('audioLoadFailed'), true); }
      };
      state.speaking = true;
      setMsg(t('playing'));
      var p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          if (token === state.playToken) { stopAll(); setMsg(t('playFailed'), true); }
        });
      }
      startTimeline(function () { return clock.currentTime; }, dur);
    }
    playNext();
  }

  /* ---------------- timeline ---------------- */

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function startTimeline(getTime, duration) {
    stopTimeline();
    var bar = $('timeline'), label = $('timeLabel');
    if (!bar) return;
    try { bar.max = 100; bar.value = 0; } catch (e) {}
    var step = function () {
      var ct = 0;
      try { ct = getTime() || 0; } catch (e) {}
      var pct = duration > 0 ? Math.min(100, (ct / duration) * 100) : 0;
      try { bar.value = pct; } catch (e) {}
      // Sana's visual timeline: #timeline (div) > #progress (inner bar).
      var prog = $('progress');
      if (prog) {
        try {
          prog.style.width = pct + '%';
          bar.setAttribute('aria-valuenow', String(Math.round(pct)));
        } catch (e) {}
      }
      if (label) {
        try { label.textContent = fmtTime(ct) + ' / ' + fmtTime(duration); } catch (e) {}
      }
      state.rafId = requestAnimationFrame(step);
    };
    state.rafId = requestAnimationFrame(step);
  }

  function stopTimeline() {
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
  }

  /* ---------------- generate flow ---------------- */

  function setBusy(busy) {
    ['btnGenerate', 'btnPlay'].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = !!busy;
    });
  }

  // SPEC §3: TTS.synthesize(text, voiceId) -> Promise<Result | {error}>
  async function onGenerate() {
    if (!hasModule('TTS') || typeof window.TTS.synthesize !== 'function') {
      setMsg(t('ttsMissing'), true);
      renderModuleStatus();
      return;
    }
    var box = $('textInput');
    var text = box ? box.value.trim() : '';
    if (!text) { setMsg(t('enterText'), true); return; }

    stopAll();
    setBusy(true);
    // Chatterbox is human-like but slow (free shared GPU) — set expectations.
    setMsg(state.voiceId && state.voiceId.indexOf('chatterbox:') === 0 ? t('chatterboxWorking') : t('generating'));
    var result = null;
    try {
      result = await window.TTS.synthesize(text, state.voiceId);
    } catch (e) {
      result = { error: String((e && e.message) || e) };
    }
    setBusy(false);

    if (!result || result.error) {
      setMsg(t('ttsFailed') + ': ' + ((result && result.error) || 'unknown'), true);
      return;
    }

    releaseLastAudio();
    state.lastResult = result;
    if (result.url) state.lastUrl = result.url;

    if (result.audioBuffer) {
      // Audio path: real buffer -> lip-sync analysis -> playback.
      setMsg(t('analyzing'));
      var cues = await getCues(result.audioBuffer);
      state.lastCues = cues;
      startAudioPlayback(result, cues);
    } else if (result.utterance) {
      // Offline Web Speech path: do NOT auto-speak here — browsers may block
      // speechSynthesis without a fresh user gesture, and Generate's gesture
      // may have expired during synthesis. Arm Play instead; replay() speaks.
      state.lastCues = [];
      if (hasModule('LipSync') && typeof window.LipSync.makeTalkingCues === 'function') {
        try { state.lastCues = window.LipSync.makeTalkingCues(result.duration || 5) || []; } catch (e) {}
      }
      // Honesty: if the user picked Chatterbox but the free server was busy,
      // say so instead of silently substituting the device voice.
      if (state.voiceId && state.voiceId.indexOf('chatterbox:') === 0) {
        setMsg(t('chatterboxBusy'));
      } else {
        setMsg(t('readyTapPlay'));
      }
    } else if (result.engine === 'google' && result.url) {
      // Google <audio>-element path (API.md §3): no byte access, but the
      // mouth still moves via text-timing cues — never a dead mouth.
      startGooglePlayback(result);
    } else {
      setMsg(t('noAudio'), true);
    }
  }

  function replay() {
    var r = state.lastResult;
    if (!r) { setMsg(t('nothingToPlay'), true); return; }
    if (r.audioBuffer) startAudioPlayback(r, state.lastCues || []);
    else if (r.utterance) startWebSpeechPlayback(r);
    else if (r.engine === 'google' && r.url) startGooglePlayback(r);
    else setMsg(t('noAudio'), true);
  }

  function initTransport() {
    var g = $('btnGenerate'), p = $('btnPlay'), s = $('btnStop'), r = $('btnRecord');
    if (g) g.addEventListener('click', onGenerate);
    if (p) p.addEventListener('click', replay);
    if (s) s.addEventListener('click', function () { stopAll(); setMsg(t('stopped')); });
    if (r) r.addEventListener('click', toggleRecord);
  }

  /* ---------------- mic recording: "Record My Voice" ---------------- */
  // Records from the microphone, decodes to an AudioBuffer, and installs it
  // as state.lastResult so the SAME playback / lip-sync / export pipeline
  // just works (replay -> startAudioPlayback, getCues, exportWav, exportVideo).

  function toggleRecord() {
    if (state.recording) { stopRecording(); return; }
    startRecording();
  }

  function updateRecordBtn() {
    var b = $('btnRecord');
    if (!b) return;
    var label = b.querySelector('[data-i18n="btn_record"]') || b.querySelector('span:last-child');
    if (state.recording) {
      b.classList.add('btn-recording');
      if (label) label.textContent = t('btn_stop_record');
    } else {
      b.classList.remove('btn-recording');
      if (label) label.textContent = t('btn_record');
    }
  }

  function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia ||
        typeof MediaRecorder === 'undefined') {
      setMsg(t('micUnsupported'), true);
      return;
    }
    stopAll();
    setMsg(t('requestingMic'));
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var rec = null;
      try {
        var mime = '';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
          else if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/mp4')) mime = 'audio/mp4';
        }
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        try { stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e2) {}
        setMsg(t('micUnsupported'), true);
        return;
      }
      state.recordChunks = [];
      state.recordStream = stream;
      state.recorder = rec;
      state.recording = true;
      state.recordT0 = Date.now();
      rec.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) state.recordChunks.push(ev.data);
      };
      rec.onstop = function () { finishRecording(); };
      try { rec.start(); }
      catch (e) { cleanupRecording(); setMsg(t('micUnsupported'), true); return; }
      updateRecordBtn();
      setMsg(t('recording'));
    }, function () {
      setMsg(t('micDenied'), true);
    });
  }

  function stopRecording() {
    if (state.recorder && state.recording) {
      try { state.recorder.stop(); } catch (e) { cleanupRecording(); }
    }
  }

  function cleanupRecording() {
    if (state.recordStream) {
      try { state.recordStream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {}
    }
    state.recordStream = null;
    state.recorder = null;
    state.recording = false;
    state.recordChunks = [];
    updateRecordBtn();
  }

  async function finishRecording() {
    var chunks = state.recordChunks.slice();
    var mime = (state.recorder && state.recorder.mimeType) || 'audio/webm';
    cleanupRecording();
    if (!chunks.length) { setMsg(t('recordEmpty'), true); return; }
    setMsg(t('working'));
    var blob = null, url = null;
    try {
      blob = new Blob(chunks, { type: mime });
      url = URL.createObjectURL(blob);
    } catch (e) { setMsg(t('recordEmpty'), true); return; }
    // Decode for duration, lip-sync cues and WAV export.
    var audioBuffer = null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var ctx = new AC();
        var ab = await blob.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(ab);
        try { ctx.close(); } catch (e) {}
      }
    } catch (e) { audioBuffer = null; }
    if (state.micUrl) { try { URL.revokeObjectURL(state.micUrl); } catch (e) {} }
    state.micUrl = url;
    state.lastResult = {
      audioBuffer: audioBuffer,
      blob: blob,
      url: url,
      duration: audioBuffer ? audioBuffer.duration : 0,
      engine: 'mic'
    };
    state.lastUrl = url;
    state.lastCues = audioBuffer ? await getCues(audioBuffer) : [];
    // Hand the recording to the Chatterbox engine as a clone reference too.
    if (window.TTS && typeof window.TTS.setReferenceAudio === 'function') {
      try { window.TTS.setReferenceAudio(blob); } catch (e) {}
    }
    setMsg(t('recordReady'));
    // No auto-play — the user taps Play (same pattern as the Web Speech path).
  }

  /* ---------------- export ---------------- */

  async function exportWav() {
    if (!hasModule('Exporter')) { setMsg(t('exporterMissing'), true); return; }
    var r = state.lastResult;
    if (!r || !r.audioBuffer) { setMsg(t('exportNeedsAudio'), true); return; }
    setMsg(t('working'));
    try {
      var blob = await window.Exporter.encodeWAV(r.audioBuffer);
      window.Exporter.downloadAudio(blob, 'voicesync-voice.wav');
      setMsg(t('wavSaved'));
    } catch (e) {
      setMsg(t('exportFailed') + ': ' + (e && e.message ? e.message : e), true);
    }
  }

  async function exportMp3() {
    if (!hasModule('Exporter')) { setMsg(t('exporterMissing'), true); return; }
    var r = state.lastResult;
    // Mic recordings: the blob is webm/opus, not MP3 — WAV is the honest export.
    if (r && r.engine === 'mic') { setMsg(t('useWavForMic'), true); return; }
    // SPEC §3: synthesize blob is the engine's native container (MP3 for Edge).
    if (r && r.blob) {
      setMsg(t('working'));
      try {
        window.Exporter.downloadAudio(r.blob, 'voicesync-voice.mp3');
        setMsg(t('mp3Saved'));
      } catch (e) {
        setMsg(t('exportFailed') + ': ' + (e && e.message ? e.message : e), true);
      }
      return;
    }
    // Google path: no bytes (CORS) — download straight from the TTS URL (API.md §3).
    if (r && r.engine === 'google' && r.url) {
      downloadUrl(r.url, 'voicesync-voice.mp3');
      setMsg(t('mp3Saved'));
      return;
    }
    setMsg(t('exportNeedsAudio'), true);
  }

  // Best-effort direct-URL download (used for Google TTS audio, which has no
  // byte access). If the browser plays it instead of downloading, the user
  // can long-press / right-click > Save.
  function downloadUrl(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'voicesync-download.mp3';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { a.remove(); } catch (e) {} }, 1000);
  }

  async function exportVideo() {
    if (!hasModule('Exporter') || typeof window.Exporter.recordVideo !== 'function') {
      setMsg(t('exporterMissing'), true);
      return;
    }
    if (!hasModule('Avatar') || typeof window.Avatar.getCanvas !== 'function') {
      setMsg(t('avatarMissing'), true);
      return;
    }
    var r = state.lastResult;
    if (!r || !r.url || !r.audioBuffer) { setMsg(t('exportNeedsAudio'), true); return; }
    var canvas = null;
    try { canvas = window.Avatar.getCanvas(); } catch (e) { canvas = null; }
    if (!canvas) { setMsg(t('avatarMissing'), true); return; }

    setMsg(t('recording'));
    var cues = state.lastCues || [];
    try {
      // SPEC §3: onAudio hook lets app.js attach lip-sync so the exported
      // video has moving lips.
      var blob = await window.Exporter.recordVideo(canvas, r.url, {
        width: canvas.width || 480,
        height: canvas.height || 480,
        onAudio: function (audioEl) {
          try { window.Avatar.speak(cues, audioEl); } catch (e) {}
        }
      });
      stopAvatar();
      window.Exporter.downloadAudio(blob, 'voicesync-video.webm');
      setMsg(t('videoSaved'));
    } catch (e) {
      stopAvatar();
      setMsg((e && e.message) || t('videoUnsupported'), true);
    }
  }

  function initExport() {
    var w = $('btnWav'), m = $('btnMp3'), v = $('btnVideo');
    if (w) w.addEventListener('click', exportWav);
    if (m) m.addEventListener('click', exportMp3);
    if (v) v.addEventListener('click', exportVideo);
  }

  /* ---------------- project save/load ---------------- */

  function collectProject() {
    var box = $('textInput');
    return {
      app: 'voicesync-studio',
      v: 1,
      text: box ? box.value : '',
      ttsLang: state.ttsLang,
      voiceId: state.voiceId,
      uiLang: state.lang,
      savedAt: new Date().toISOString()
    };
  }

  function applyProject(p) {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.text === 'string' && $('textInput')) {
      $('textInput').value = p.text;
      updateCharCount();
    }
    if (p.uiLang === 'en' || p.uiLang === 'ur') {
      state.lang = p.uiLang;
      var lt = $('langToggle');
      if (lt) lt.value = p.uiLang;
      applyI18n();
    }
    if (p.ttsLang === 'ur' || p.ttsLang === 'en') {
      state.ttsLang = p.ttsLang;
      var tl = $('ttsLang');
      if (tl) tl.value = p.ttsLang;
    }
    if (typeof p.voiceId === 'string' && p.voiceId) {
      try { localStorage.setItem('voicesync-voice', p.voiceId); } catch (e) {}
    }
    return true;
  }

  function manualJsonDownload(obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch (e) {}
      a.remove();
    }, 1000);
  }

  function initProject() {
    var bs = $('btnSave'), bl = $('btnLoad'), fi = $('fileLoad');
    if (bs) bs.addEventListener('click', function () {
      var p = collectProject();
      if (hasModule('Exporter') && typeof window.Exporter.saveProject === 'function') {
        try { window.Exporter.saveProject(p); setMsg(t('projectSaved')); }
        catch (e) { setMsg(t('exportFailed') + ': ' + (e && e.message ? e.message : e), true); }
      } else {
        // Honest fallback when exporter.js is not loaded yet.
        manualJsonDownload(p, 'voicesync-project.json');
        setMsg(t('projectSaved'));
      }
    });
    if (bl && fi) {
      bl.addEventListener('click', function () { fi.click(); });
      fi.addEventListener('change', function () {
        if (!fi.files || !fi.files[0]) return;
        var reader = new FileReader();
        reader.onload = function () {
          var parsed = null;
          try {
            if (hasModule('Exporter') && typeof window.Exporter.loadProject === 'function') {
              parsed = window.Exporter.loadProject(String(reader.result));
            } else {
              parsed = JSON.parse(String(reader.result));
            }
          } catch (e) { parsed = null; }
          if (applyProject(parsed)) {
            loadVoices(); // refresh list, restore project voiceId
            setMsg(t('projectLoaded'));
          } else {
            setMsg(t('projectLoadFailed'), true);
          }
          fi.value = '';
        };
        reader.readAsText(fi.files[0]);
      });
    }
  }

  /* ---------------- boot ---------------- */

  function boot() {
    renderModuleStatus();
    initLanguage();
    initTextInput();
    initTtsControls();
    initTransport();
    initExport();
    initProject();
    mountAvatar();
    applyI18n();
    probeLipSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
