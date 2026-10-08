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
    recordSaved: 'Recording saved to Downloads — tap Play to hear it.',
    btn_dictate: 'Voice to Text',
    btn_stop_dictate: 'Stop Listening',
    listening: 'Listening… speak now. Tap again to stop.',
    sttUnsupported: 'Voice typing is not supported in this browser.',
    sttError: 'Voice typing had a problem. Try again.',
    tune_speed: 'Speed',
    tune_pitch: 'Pitch',
    btn_music: 'Music',
    musicLoaded: 'Music loaded — it will play softly under the voice.',
    btn_srt: 'Subtitles (SRT)',
    srtSaved: 'Subtitles downloaded.',
    shared: 'Shared.',
    shareFallback: 'Sharing not supported here — downloaded instead.',
    preset_label: 'Preset',
    preset_none: '— No preset —',
    preset_save: 'Save',
    presetLoaded: 'Preset loaded.',
    presetSaved: 'Preset saved.',
    presetDeleted: 'Preset deleted.',
    presetNamePrompt: 'Name this preset:',
    easy_mode: 'Easy Mode',
    easyOn: 'Easy Mode on — just Type, Generate, Play, Save.',
    easyOff: 'Easy Mode off — all options visible.',
    voice_preview: 'Preview',
    previewing: 'Previewing voice…',
    engineFallback: 'Note: {want} voice was unavailable — played with {got} instead (all voices may sound similar).',
    engineFallbackShort: 'fallback — voices may sound similar',
    dialogue_mode: 'Dialogue mode (two voices)',
    dialogue_hint: 'Start lines with 1: for Voice 1 and 2: for Voice 2.',
    dialogueNeedMarkers: 'Dialogue mode: start lines with 1: and 2: to assign voices.',
    dialogueNeedAudio: 'Dialogue mode needs voices with downloadable audio (not the device voice).',
    modulesLabel: 'Modules'
  };

  var state = {
    lang: 'en',          // UI language (I18N)
    ttsLang: 'en',       // synthesis language (auto-detected from text on Generate)
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
    dictating: false,     // speech-to-text in progress
    dictater: null,       // active SpeechRecognition
    dictateBase: '',      // text that was in the box when dictation started
    dictateFinals: '',    // finalized transcripts this session
    speed: 1,             // playback speed 0.5–2.0
    pitch: 0,             // pitch shift in semitones -12..+12
    audioCtx: null,       // Web Audio context for pitched playback
    audioSrc: null,       // buffer source node for pitched playback
    musicUrl: null,       // background music object URL
    musicVolume: 0.2,     // background music level 0..1
    musicEl: null,        // background music audio element
    musicFileName: '',
    dialogueMode: false,  // two-voice dialogue mode
    voiceId2: null,       // Voice 2 for dialogue mode
    romanUrdu: false,     // Roman Urdu -> Urdu script pre-pass
    rafId: 0             // timeline rAF id
  };

  function t(key) {
    var s = safeGet(function () { return window.I18N.strings[state.lang][key]; }, undefined);
    if (typeof s === 'string' && s) return s;
    return FALLBACK[key] || key;
  }

  // Q1+Q2: always-visible engine badge — which engine actually spoke?
  // Shows on EVERY result path, not just Web Speech.
  function updateEngineBadge() {
    var badge = $('engineBadge');
    if (!badge) return;
    var r = state.lastResult;
    if (!r || !r.engine) { badge.hidden = true; return; }
    var engineNames = {
      edge: 'Edge Neural', google: 'Google', webspeech: 'Device voice',
      chatterbox: 'Chatterbox', dialogue: 'Dialogue', mic: 'Recording'
    };
    var label = engineNames[r.engine] || r.engine;
    var isFallback = !!state.lastEngineNote;
    badge.textContent = (isFallback ? '⚠️ ' : '🔊 ') + label +
      (isFallback ? ' — ' + t('engineFallbackShort') : '');
    badge.className = 'engine-badge' + (isFallback ? ' warn' : '');
    badge.hidden = false;
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
    var d = $('btnDictate');
    if (d) d.addEventListener('click', toggleDictate);
    // Feature 1: Roman Urdu toggle
    var ru = $('romanUrdu');
    if (ru) ru.addEventListener('change', function () { state.romanUrdu = !!ru.checked; });
    initTuning();
    initMusic();
  }

  /* ---------------- background music ---------------- */

  function initMusic() {
    var f = $('musicFile'), v = $('musicVol'), c = $('btnMusicClear'), p = $('btnMusicPick');
    if (p && f) p.addEventListener('click', function () { f.click(); }); // Team 2 M13: keyboard access
    if (f) f.addEventListener('change', function () {
      var file = f.files && f.files[0];
      if (!file) return;
      if (state.musicUrl) { try { URL.revokeObjectURL(state.musicUrl); } catch (e) {} }
      stopMusic();
      state.musicUrl = URL.createObjectURL(file);
      state.musicFileName = file.name;
      var n = $('musicName'); if (n) n.textContent = file.name;
      if (c) c.hidden = false;
      setMsg(t('musicLoaded'));
    });
    if (v) v.addEventListener('input', function () {
      state.musicVolume = (parseFloat(v.value) || 0) / 100;
      if (state.musicEl) { try { state.musicEl.volume = state.musicVolume; } catch (e) {} }
    });
    if (c) c.addEventListener('click', function () {
      stopMusic();
      if (state.musicUrl) { try { URL.revokeObjectURL(state.musicUrl); } catch (e) {} }
      state.musicUrl = null; state.musicFileName = '';
      var n = $('musicName'); if (n) n.textContent = '';
      if (f) f.value = '';
      c.hidden = true;
    });
  }

  function startMusic() {
    stopMusic();
    if (!state.musicUrl) return;
    try {
      var el = new Audio(state.musicUrl);
      el.loop = true;
      el.volume = state.musicVolume;
      state.musicEl = el;
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { state.musicEl = null; }
  }

  function stopMusic() {
    if (state.musicEl) {
      try { state.musicEl.pause(); } catch (e) {}
      state.musicEl = null;
    }
  }

  function initTuning() {
    var sr = $('speedRange'), pr = $('pitchRange');
    var sv = $('speedVal'), pv = $('pitchVal');
    if (sr) sr.addEventListener('input', function () {
      state.speed = parseFloat(sr.value) || 1;
      if (sv) sv.textContent = state.speed.toFixed(1) + '×';
    });
    if (pr) pr.addEventListener('input', function () {
      state.pitch = parseInt(pr.value, 10) || 0;
      if (pv) pv.textContent = (state.pitch > 0 ? '+' : '') + state.pitch;
    });
  }

  // Pitched playback via Web Audio: true pitch shift (detune) without
  // changing speed. Used when pitch != 0 and we have real audio bytes.
  function startPitchedPlayback(result, cues) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !result.audioBuffer) { startAudioPlayback(result, cues); return; }
    stopAll();
    var ctx;
    try {
      ctx = new AC();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    } catch (e) { startAudioPlayback(result, cues); return; }
    var src;
    try {
      src = ctx.createBufferSource();
      src.buffer = result.audioBuffer;
      src.playbackRate.value = state.speed || 1;
      try { src.detune.value = (state.pitch || 0) * 100; } catch (e) {}
      src.connect(ctx.destination);
    } catch (e) {
      try { ctx.close(); } catch (e2) {}
      startAudioPlayback(result, cues);
      return;
    }
    var dur = result.audioBuffer.duration / (state.speed || 1);
    var t0 = ctx.currentTime;
    var timeSrc = {
      get currentTime() {
        var t = ctx.currentTime - t0;
        return t < 0 ? 0 : (t > dur ? dur : t);
      },
      addEventListener: function () {},
      removeEventListener: function () {}
    };
    state.audioCtx = ctx;
    state.audioSrc = src;
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(scaleCues(cues, state.speed || 1), timeSrc); } catch (e) {}
    }
    src.onended = function () {
      stopMusic(); stopAvatar(); stopTimeline(); state.speaking = false;
      setMsg(t('done')); cleanupPitched();
    };
    state.speaking = true;
    setMsg(t('playing'));
    startMusic();
    try { src.start(0); }
    catch (e) { cleanupPitched(); startAudioPlayback(result, cues); return; }
    startTimeline(function () { return timeSrc.currentTime; }, dur);
  }

  function cleanupPitched() {
    if (state.audioSrc) {
      try { state.audioSrc.onended = null; state.audioSrc.stop(); } catch (e) {}
      state.audioSrc = null;
    }
    if (state.audioCtx) {
      try { state.audioCtx.close(); } catch (e) {}
      state.audioCtx = null;
    }
  }

  /* ---------------- voice-to-text (dictation) ---------------- */
  // Free, built-in: Chrome's SpeechRecognition transcribes the mic straight
  // into the script box. No server, no key.

  function toggleDictate() {
    if (state.dictating) { stopDictate(); setMsg(t('stopped')); return; }
    startDictate();
  }

  function sttLang() {
    var b = state.ttsLang || 'en';
    if (b === 'ur') return 'ur-PK';
    if (b === 'en') return 'en-US';
    if (b === 'zh') return 'zh-CN';
    return b;
  }

  function startDictate() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMsg(t('sttUnsupported'), true); return; }
    stopAll();
    var rec;
    try { rec = new SR(); } catch (e) { setMsg(t('sttUnsupported'), true); return; }
    rec.lang = sttLang();
    rec.continuous = true;
    rec.interimResults = true;
    var box0 = $('textInput');
    state.dictateBase = box0 ? box0.value : '';
    if (state.dictateBase && !/[\s\n]$/.test(state.dictateBase)) state.dictateBase += ' ';
    state.dictateFinals = '';
    rec.onresult = function (ev) {
      var interim = '', finals = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finals += tr + ' ';
        else interim += tr;
      }
      if (finals) state.dictateFinals += finals;
      var box = $('textInput');
      if (box) {
        box.value = state.dictateBase + state.dictateFinals + interim;
        updateCharCount();
      }
    };
    rec.onerror = function (ev) {
      var err = ev && ev.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') setMsg(t('micDenied'), true);
      else if (err && err !== 'aborted' && err !== 'no-speech') setMsg(t('sttError'), true);
      stopDictate();
    };
    rec.onend = function () {
      // Chrome auto-stops after a pause; resume while the toggle is on.
      if (state.dictating) { try { rec.start(); } catch (e) { stopDictate(); } }
    };
    state.dictater = rec;
    state.dictating = true;
    try { rec.start(); }
    catch (e) { stopDictate(); setMsg(t('sttError'), true); return; }
    updateDictateBtn();
    setMsg(t('listening'));
  }

  function stopDictate() {
    state.dictating = false;
    if (state.dictater) {
      try { state.dictater.onend = null; state.dictater.stop(); } catch (e) {}
    }
    state.dictater = null;
    updateDictateBtn();
  }

  function updateDictateBtn() {
    var b = $('btnDictate');
    if (!b) return;
    var label = b.querySelector('[data-i18n="btn_dictate"]') || b.querySelector('span:last-child');
    if (state.dictating) {
      b.classList.add('btn-recording');
      if (label) label.textContent = t('btn_stop_dictate');
    } else {
      b.classList.remove('btn-recording');
      if (label) label.textContent = t('btn_dictate');
    }
  }

  /* ---------------- voices ---------------- */

  function initTtsControls() {
    var tl = $('ttsLang');
    if (tl) {
      tl.value = state.ttsLang;
      tl.addEventListener('change', function () {
        state.ttsLang = tl.value || 'en';
        loadVoices();
      });
    }
    loadVoices();
    // Voice preview: hear the selected voice before generating.
    var pv = $('btnVoicePreview');
    if (pv) pv.addEventListener('click', previewVoice);
  }

  // Preview the currently selected voice with a short sample.
  async function previewVoice() {
    if (!hasModule('TTS') || typeof window.TTS.synthesize !== 'function') return;
    var vid = state.voiceId;
    if (!vid) { setMsg(t('noVoices'), true); return; }
    // Q4: busy-guard — no overlapping previews.
    if (state.previewing) return;
    state.previewing = true;
    var sample = (state.ttsLang === 'ur') ? 'السلام علیکم! یہ میری آواز کا نمونہ ہے۔'
      : (state.ttsLang === 'hi') ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।'
      : 'Hello! This is a preview of my voice.';
    setMsg(t('previewing'));
    stopAll();
    state.previewing = true; // stopAll clears it; re-arm
    try {
      var r = await window.TTS.synthesize(sample, vid);
      if (!r || r.error) { setMsg(t('ttsFailed') + ': ' + ((r && r.error) || ''), true); state.previewing = false; return; }
      // Q2: show which engine actually spoke the preview.
      state.lastResult = { engine: r.engine };
      state.lastEngineNote = null;
      if (r.engine && vid) {
        var wantEngine = vid.split(':')[0];
        if (wantEngine && r.engine !== wantEngine) {
          state.lastEngineNote = t('engineFallback').replace('{want}', wantEngine).replace('{got}', r.engine);
        }
      }
      updateEngineBadge();
      if (state.lastEngineNote) setMsg(state.lastEngineNote, true);
      // Q5: preview honors speed/pitch.
      var spd = state.speed || 1, pit = state.pitch || 0;
      // Play directly without touching the main pipeline.
      if (r.audioBuffer) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          var ctx = new AC();
          var src = ctx.createBufferSource();
          src.buffer = r.audioBuffer;
          src.playbackRate.value = spd;
          try { src.detune.value = pit * 100; } catch (e) {}
          src.connect(ctx.destination);
          src.onended = function () { try { ctx.close(); } catch (e) {} state.previewing = false; setMsg(t('done')); };
          if (!state.lastEngineNote) setMsg(t('playing'));
          src.start(0);
          state.previewCtx = ctx; state.previewSrc = src;
          return;
        }
      }
      if (r.utterance && typeof window.speechSynthesis !== 'undefined') {
        try {
          r.utterance.rate = spd;
          r.utterance.pitch = Math.max(0, Math.min(2, 1 + pit / 12));
        } catch (e) {}
        r.utterance.onend = function () { state.previewing = false; };
        if (!state.lastEngineNote) setMsg(t('playing'));
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(r.utterance);
        return;
      }
      if (r.url) {
        var el = new Audio(r.url);
        try { el.playbackRate = spd; } catch (e) {}
        state.previewEl = el;
        el.onended = function () { state.previewing = false; setMsg(t('done')); };
        if (!state.lastEngineNote) setMsg(t('playing'));
        el.play();
        return;
      }
      state.previewing = false;
      setMsg(t('noAudio'), true);
    } catch (e) {
      state.previewing = false;
      setMsg(t('ttsFailed') + ': ' + (e && e.message || e), true);
    }
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
    if (state.dialogueMode) syncVoice2();
  }

  /* ---------------- dialogue mode: two voices, one script ---------------- */
  // Lines starting with "1:" use Voice 1, "2:" use Voice 2. Each segment is
  // synthesized with its own voice, then merged into one audio buffer so the
  // normal playback / lip-sync / export pipeline just works.

  /* ---------------- Feature 4: named presets ---------------- */
  var PRESET_KEY = 'voicesync-presets';

  function getPresets() {
    try {
      var raw = localStorage.getItem(PRESET_KEY);
      var p = raw ? JSON.parse(raw) : {};
      return (p && typeof p === 'object') ? p : {};
    } catch (e) { return {}; }
  }
  function setPresets(p) {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function refreshPresetList() {
    var sel = $('presetSelect');
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = t('preset_none');
    sel.appendChild(none);
    var presets = getPresets();
    Object.keys(presets).sort().forEach(function (name) {
      var o = document.createElement('option');
      o.value = name; o.textContent = name;
      sel.appendChild(o);
    });
    sel.value = keep || '';
  }
  function applyPreset(name) {
    var p = getPresets()[name];
    if (!p) return;
    if (p.ttsLang) {
      state.ttsLang = p.ttsLang;
      var tl = $('ttsLang'); if (tl) tl.value = p.ttsLang;
    }
    var applyRest = function () {
      if (p.voiceId) {
        var vs = $('voiceSelect');
        if (vs) { vs.value = p.voiceId; state.voiceId = p.voiceId; }
      }
      if (typeof p.speed === 'number') {
        state.speed = p.speed;
        var sr = $('speedRange'); if (sr) { sr.value = p.speed; }
        var sl = $('speedVal'); if (sl) sl.textContent = p.speed + 'x';
      }
      if (typeof p.pitch === 'number') {
        state.pitch = p.pitch;
        var pr = $('pitchRange'); if (pr) { pr.value = p.pitch; }
        var pl = $('pitchVal'); if (pl) pl.textContent = (p.pitch > 0 ? '+' : '') + p.pitch;
      }
      if (typeof p.dialogueMode === 'boolean') {
        state.dialogueMode = p.dialogueMode;
        var cb = $('dialogueMode'); if (cb) cb.checked = p.dialogueMode;
        var s2 = $('voiceSelect2'), hint = $('dialogueHint');
        if (s2) s2.hidden = !p.dialogueMode;
        if (hint) hint.hidden = !p.dialogueMode;
        if (p.dialogueMode && p.voiceId2) {
          syncVoice2();
          if (s2) { s2.value = p.voiceId2; state.voiceId2 = p.voiceId2; }
        }
      }
      setMsg(t('presetLoaded'));
    };
    if (p.ttsLang && p.ttsLang !== state.ttsLang) {
      loadVoices().then(applyRest, applyRest);
    } else applyRest();
  }
  /* ---------------- Feature 5: Easy Mode ---------------- */
  function initEasyMode() {
    var tgl = $('easyToggle');
    if (!tgl) return;
    var saved = false;
    try { saved = localStorage.getItem('voicesync-easy') === '1'; } catch (e) {}
    if (saved) {
      document.body.classList.add('easy-mode');
      tgl.setAttribute('aria-pressed', 'true');
    }
    tgl.addEventListener('click', function () {
      var on = document.body.classList.toggle('easy-mode');
      tgl.setAttribute('aria-pressed', on ? 'true' : 'false');
      try { localStorage.setItem('voicesync-easy', on ? '1' : '0'); } catch (e) {}
      setMsg(t(on ? 'easyOn' : 'easyOff'));
    });
  }

  function initPresets() {
    refreshPresetList();
    var sel = $('presetSelect'), sv = $('btnPresetSave'), del = $('btnPresetDelete');
    if (sel) sel.addEventListener('change', function () {
      if (sel.value) applyPreset(sel.value);
    });
    if (sv) sv.addEventListener('click', function () {
      var name = null;
      try { name = window.prompt(t('presetNamePrompt'), ''); } catch (e) {}
      if (!name || !(name = name.trim())) return;
      var presets = getPresets();
      presets[name] = {
        ttsLang: state.ttsLang,
        voiceId: state.voiceId,
        speed: state.speed,
        pitch: state.pitch,
        dialogueMode: state.dialogueMode,
        voiceId2: state.voiceId2
      };
      setPresets(presets);
      refreshPresetList();
      var s2 = $('presetSelect'); if (s2) s2.value = name;
      setMsg(t('presetSaved'));
    });
    if (del) del.addEventListener('click', function () {
      var s2 = $('presetSelect');
      var name = s2 ? s2.value : '';
      if (!name) return;
      var presets = getPresets();
      delete presets[name];
      setPresets(presets);
      refreshPresetList();
      setMsg(t('presetDeleted'));
    });
  }

  function initDialogue() {
    var cb = $('dialogueMode'), s2 = $('voiceSelect2'), hint = $('dialogueHint');
    if (cb) cb.addEventListener('change', function () {
      state.dialogueMode = !!cb.checked;
      if (s2) s2.hidden = !state.dialogueMode;
      if (hint) hint.hidden = !state.dialogueMode;
      if (state.dialogueMode) syncVoice2();
    });
    if (s2) s2.addEventListener('change', function () { state.voiceId2 = s2.value; });
  }

  function syncVoice2() {
    var s1 = $('voiceSelect'), s2 = $('voiceSelect2');
    if (!s1 || !s2) return;
    s2.innerHTML = s1.innerHTML;
    var idx = 1;
    // Prefer a different voice than Voice 1 when possible.
    for (var i = 0; i < s2.options.length; i++) {
      if (s2.options[i].value && s2.options[i].value !== state.voiceId) { idx = i; break; }
    }
    s2.selectedIndex = idx;
    state.voiceId2 = s2.value;
  }

  function parseDialogue(text) {
    var segs = [], curSp = 1, curLines = [], hasMarkers = false;
    text.split('\n').forEach(function (line) {
      var m = line.match(/^\s*([12])\s*:\s*([\s\S]*)$/);
      if (m) {
        hasMarkers = true;
        if (curLines.length) segs.push({ speaker: curSp, text: curLines.join('\n') });
        curSp = parseInt(m[1], 10);
        curLines = [m[2]];
      } else {
        curLines.push(line);
      }
    });
    if (curLines.length) segs.push({ speaker: curSp, text: curLines.join('\n') });
    segs = segs.filter(function (s) { return s.text.trim(); });
    return hasMarkers ? segs : null;
  }

  function resampleLinear(data, fromRate, toRate) {
    if (fromRate === toRate) return data;
    var ratio = fromRate / toRate;
    var len = Math.max(1, Math.floor(data.length / ratio));
    var out = new Float32Array(len);
    for (var i = 0; i < len; i++) {
      var pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0;
      var a = data[i0] || 0, b = data[i0 + 1] || 0;
      out[i] = a + (b - a) * frac;
    }
    return out;
  }

  async function synthesizeDialogue(segments) {
    var parts = [], rate = 0;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var vid = seg.speaker === 2 ? (state.voiceId2 || state.voiceId) : state.voiceId;
      setMsg(t('generating') + ' (' + (i + 1) + '/' + segments.length + ')');
      var r = await window.TTS.synthesize(seg.text, vid);
      if (!r || r.error || !r.audioBuffer) {
        return { error: t('dialogueNeedAudio') };
      }
      if (!rate) rate = r.audioBuffer.sampleRate;
      var d = r.audioBuffer.getChannelData(0);
      if (r.audioBuffer.sampleRate !== rate) d = resampleLinear(d, r.audioBuffer.sampleRate, rate);
      parts.push(d);
    }
    var total = parts.reduce(function (a, p) { return a + p.length; }, 0);
    var merged = new Float32Array(total), off = 0;
    parts.forEach(function (p) { merged.set(p, off); off += p.length; });
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return { error: 'AudioContext unavailable' };
    var ctx;
    try { ctx = new AC(); } catch (e) { return { error: 'AudioContext unavailable' }; }
    var buf;
    try {
      buf = ctx.createBuffer(1, total, rate);
      buf.getChannelData(0).set(merged);
    } catch (e) {
      try { ctx.close(); } catch (e2) {}
      return { error: String(e && e.message || e) };
    }
    var blob = null, url = null;
    try {
      if (hasModule('Exporter') && typeof window.Exporter.encodeWAV === 'function') {
        blob = await window.Exporter.encodeWAV(buf);
        url = URL.createObjectURL(blob);
      }
    } catch (e) { blob = null; url = null; }
    try { ctx.close(); } catch (e) {}
    return {
      result: {
        audioBuffer: buf,
        blob: blob,
        url: url,
        duration: total / rate,
        engine: 'dialogue'
      }
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
    if (state.dictating) { stopDictate(); }
    // Stop voice preview too.
    try { if (state.previewSrc) state.previewSrc.stop(); } catch (e) {}
    try { if (state.previewCtx) state.previewCtx.close(); } catch (e) {}
    state.previewSrc = null; state.previewCtx = null;
    try { if (state.previewEl) state.previewEl.pause(); } catch (e) {}
    state.previewEl = null;
    stopMusic();
    cleanupPitched();
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
  /* Scale lip-sync cue times when playback speed != 1 so the avatar's
     mouth stays in sync with the faster/slower audio.
     Team 2 M1: cues carry `viseme` (lipsync.js) — preserve it, else the
     mouth freezes at speed != 1. */
  function scaleCues(cues, speed) {
    var s = speed || 1;
    if (!cues || !cues.length || s === 1) return cues || [];
    return cues.map(function (c) {
      return { start: c.start / s, end: c.end / s, viseme: c.viseme, value: c.value };
    });
  }

  function startAudioPlayback(result, cues) {
    stopAll();
    var el = new Audio();
    state.audioEl = el;
    el.preload = 'auto';
    el.src = result.url;
    try { el.playbackRate = state.speed || 1; el.preservesPitch = true; } catch (e) {}
    el.onended = function () { stopMusic(); stopAvatar(); stopTimeline(); state.speaking = false; setMsg(t('done')); };
    el.onerror = function () { stopAll(); setMsg(t('audioLoadFailed'), true); };
    // SPEC §3: Avatar.speak(cues, timeSrc) — timeSrc may be HTMLAudioElement.
    // el.currentTime is audio-time, same base as the cues: no scaling needed.
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(cues || [], el); } catch (e) {}
    }
    state.speaking = true;
    setMsg(t('playing'));
    startMusic();
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
    try {
      u.rate = state.speed || 1;
      var p = 1 + (state.pitch || 0) / 12;
      u.pitch = Math.max(0, Math.min(2, p));
    } catch (e) {}
    var cues = [];
    if (hasModule('LipSync') && typeof window.LipSync.makeTalkingCues === 'function') {
      try { cues = window.LipSync.makeTalkingCues(dur) || []; } catch (e) { cues = []; }
    }
    // Virtual timing source: Avatar.speak only reads .currentTime (SPEC §3).
    // The virtual clock advances in real time while the utterance speaks at
    // u.rate = speed, so cue times must be scaled to the real-time base.
    var clock = { currentTime: 0 };
    var t0 = performance.now();
    state.clockTimer = setInterval(function () {
      clock.currentTime = (performance.now() - t0) / 1000;
    }, 50);
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(scaleCues(cues, state.speed || 1), clock); } catch (e) {}
    }
    u.onend = function () { stopAll(); setMsg(t('done')); };
    u.onerror = function (ev) {
      stopAll();
      setMsg(t('ttsFailed') + (ev && ev.error ? ': ' + ev.error : ''), true);
    };
    state.speaking = true;
    setMsg(t('playing'));
    startMusic();
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      stopAll();
      setMsg(t('ttsFailed') + ': ' + (e && e.message ? e.message : e), true);
      return;
    }
    startTimeline(function () { return clock.currentTime; }, dur / (state.speed || 1));
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
    startMusic();

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
      try { el.playbackRate = state.speed || 1; } catch (e) {}
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
    var result = null; // Team 2 C1: must be declared ('use strict' -> ReferenceError otherwise)
    if (!hasModule('TTS') || typeof window.TTS.synthesize !== 'function') {
      setMsg(t('ttsMissing'), true);
      renderModuleStatus();
      return;
    }
    var box = $('textInput');
    var text = box ? box.value.trim() : '';
    if (!text) { setMsg(t('enterText'), true); return; }
    // Feature 1: Roman Urdu pre-pass — convert to Urdu script, route to ur-PK.
    if (state.romanUrdu && window.TTS && typeof window.TTS._romanToUrdu === 'function') {
      text = window.TTS._romanToUrdu(text);
      if (box) box.value = text; // show the user what will be spoken
    }

    stopAll();
    setBusy(true);
    // Auto-detect the text's script so pasted text always gets the right
    // voice: Urdu text with English selected (or vice versa) switches the
    // language dropdown automatically. Only switches across script families —
    // a manually chosen Latin-script language (French, German…) is untouched.
    try {
      if (window.TTS && typeof window.TTS._guessLang === 'function') {
        var detected = String(window.TTS._guessLang(text)).split('-')[0].toLowerCase();
        var cur = state.ttsLang || 'en';
        var want = null;
        if (detected === 'ur' && ['ur', 'ar', 'fa'].indexOf(cur) === -1) want = 'ur';
        else if (detected === 'hi' && cur !== 'hi') want = 'hi';
        else if (detected === 'ar' && ['ur', 'ar', 'fa'].indexOf(cur) === -1) want = 'ar'; // Team 2 C2
        else if (detected === 'en' && ['ur', 'ar', 'fa', 'hi'].indexOf(cur) !== -1) want = 'en';
        if (want && want !== cur) {
          state.ttsLang = want;
          var tlSel = $('ttsLang');
          if (tlSel) tlSel.value = want;
          await loadVoices();
        }
      }
    } catch (e) {}
    // Chatterbox is human-like but slow (free shared GPU) — set expectations.
    setMsg(state.voiceId && state.voiceId.indexOf('chatterbox:') === 0 ? t('chatterboxWorking') : t('generating'));
    // Dialogue mode: synthesize each speaker's lines with their own voice,
    // merge into one buffer, then run the normal pipeline.
    if (state.dialogueMode) {
      var segs = parseDialogue(text);
      if (!segs) { setBusy(false); setMsg(t('dialogueNeedMarkers'), true); return; }
      var dout = await synthesizeDialogue(segs);
      setBusy(false);
      if (!dout || dout.error || !dout.result) {
        setMsg(t('ttsFailed') + ': ' + ((dout && dout.error) || 'unknown'), true);
        return;
      }
      result = dout.result;
    } else {
      try {
        result = await window.TTS.synthesize(text, state.voiceId);
      } catch (e) {
        result = { error: String((e && e.message) || e) };
      }
      setBusy(false);
    }

    if (!result || result.error) {
      setMsg(t('ttsFailed') + ': ' + ((result && result.error) || 'unknown'), true);
      return;
    }

    releaseLastAudio();
    state.lastResult = result;
    if (result.url) state.lastUrl = result.url;
    // Honesty: if the selected voice's engine failed and a fallback produced
    // the audio, say so — e.g. all Edge voices collapse to one Google voice.
    try {
      var selVoice = null;
      var vsel = $('voiceSelect');
      if (vsel && vsel.selectedOptions && vsel.selectedOptions[0]) {
        selVoice = vsel.selectedOptions[0].textContent || '';
      }
      state.lastEngineNote = null;
      if (result.engine && state.voiceId) {
        var wantEngine = state.voiceId.split(':')[0];
        if (wantEngine && result.engine !== wantEngine && result.engine !== 'dialogue' && result.engine !== 'mic') {
          state.lastEngineNote = t('engineFallback')
            .replace('{want}', wantEngine).replace('{got}', result.engine);
        }
      }
      state.lastVoiceLabel = selVoice;
    } catch (e) {}
    updateEngineBadge(); // Q1: visible on EVERY path

    if (result.audioBuffer) {
      // Audio path: real buffer -> lip-sync analysis -> playback.
      // Team 2 M2: honor the pitch slider on Generate too, not just replay().
      setMsg(t('analyzing'));
      var cues = await getCues(result.audioBuffer);
      state.lastCues = cues;
      if (state.pitch) startPitchedPlayback(result, cues);
      else startAudioPlayback(result, cues);
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
      // Q1: fallback note shows on ALL paths now (badge also always visible).
      if (state.voiceId && state.voiceId.indexOf('chatterbox:') === 0) {
        setMsg(t('chatterboxBusy'));
      } else if (state.lastEngineNote) {
        setMsg(state.lastEngineNote, true);
      } else {
        setMsg(t('readyTapPlay'));
      }
    } else if (result.engine === 'google' && result.url) {
      // Google <audio>-element path (API.md §3): no byte access, but the
      // mouth still moves via text-timing cues — never a dead mouth.
      // Q1: show fallback warning here too, not just Web Speech.
      if (state.lastEngineNote) setMsg(state.lastEngineNote, true);
      startGooglePlayback(result);
    } else {
      setMsg(t('noAudio'), true);
    }
  }

  function replay() {
    var r = state.lastResult;
    if (!r) { setMsg(t('nothingToPlay'), true); return; }
    // Pitched Web Audio path when the user shifted pitch and we have bytes.
    if (r.audioBuffer && state.pitch) startPitchedPlayback(r, state.lastCues || []);
    else if (r.audioBuffer) startAudioPlayback(r, state.lastCues || []);
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
    // Auto-save: download the WAV straight to the Downloads folder, so the
    // recording is a real file (not just in-memory).
    var saved = false;
    if (audioBuffer && hasModule('Exporter') && typeof window.Exporter.encodeWAV === 'function') {
      try {
        var wavBlob = await window.Exporter.encodeWAV(audioBuffer);
        // Team 2 M7: timestamped filename so 20 takes don't overwrite each other.
        var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        window.Exporter.downloadAudio(wavBlob, 'voicesync-recording-' + stamp + '.wav');
        saved = true;
      } catch (e) { saved = false; }
    }
    setMsg(t(saved ? 'recordSaved' : 'recordReady'));
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
    // Feature 2: 9:16 Shorts — composite canvas (avatar top + captions bottom).
    var fmtSel = $('videoFormat');
    var portrait = fmtSel && fmtSel.value === 'portrait';
    var outCanvas = canvas, captionTimer = null, audioRef = { el: null };
    if (portrait) {
      var box = $('textInput');
      var capText = box ? box.value.trim() : '';
      var capDur = (r.duration || 5) / (state.speed || 1);
      var caps = getCaptionBlocks(capText, capDur);
      outCanvas = document.createElement('canvas');
      outCanvas.width = 720; outCanvas.height = 1280;
      var octx = outCanvas.getContext('2d');
      var drawFrame = function () {
        try {
          // Background
          octx.fillStyle = '#0b0f1a'; octx.fillRect(0, 0, 720, 1280);
          // Avatar on top (720x720)
          var aw = canvas.width || 480, ah = canvas.height || 480;
          var s = Math.min(720 / aw, 720 / ah);
          var dw = aw * s, dh = ah * s;
          octx.drawImage(canvas, (720 - dw) / 2, (720 - dh) / 2, dw, dh);
          // Caption bar at bottom
          var now = audioRef.el && typeof audioRef.el.currentTime === 'number' ? audioRef.el.currentTime : 0;
          var cur = null;
          for (var i = 0; i < caps.length; i++) {
            if (now >= caps[i].start && now <= caps[i].end) { cur = caps[i]; break; }
          }
          if (cur) {
            octx.fillStyle = 'rgba(0,0,0,0.55)';
            octx.fillRect(40, 880, 640, 320);
            octx.fillStyle = '#fff';
            octx.font = 'bold 44px system-ui, sans-serif';
            octx.textAlign = 'center'; octx.textBaseline = 'middle';
            var words = cur.text.split(' '), lines = [], line = '';
            words.forEach(function (w) {
              if ((line + ' ' + w).trim().length > 28) { lines.push(line.trim()); line = w; }
              else line += ' ' + w;
            });
            if (line.trim()) lines.push(line.trim());
            lines.slice(0, 4).forEach(function (ln, li) {
              octx.fillText(ln, 360, 960 + li * 60);
            });
          }
        } catch (e) { /* keep recording even if a frame fails */ }
        captionTimer = requestAnimationFrame(drawFrame);
      };
      drawFrame();
    }
    try {
      // SPEC §3: onAudio hook lets app.js attach lip-sync so the exported
      // video has moving lips.
      var blob = await window.Exporter.recordVideo(outCanvas, r.url, {
        width: outCanvas.width || 480,
        height: outCanvas.height || 480,
        musicURL: state.musicUrl,       // background music mixed into the video
        musicVolume: state.musicVolume,
        onAudio: function (audioEl) {
          audioRef.el = audioEl;
          // Team 2 round 3: match captions — play export audio at user speed.
          try { audioEl.playbackRate = state.speed || 1; } catch (e) {}
          try { window.Avatar.speak(cues, audioEl); } catch (e) {}
        }
      });
      if (captionTimer) cancelAnimationFrame(captionTimer);
      stopAvatar();
      window.Exporter.downloadAudio(blob, portrait ? 'voicesync-shorts-9x16.webm' : 'voicesync-video.webm');
      setMsg(t('videoSaved'));
    } catch (e) {
      if (captionTimer) cancelAnimationFrame(captionTimer);
      stopAvatar();
      setMsg((e && e.message) || t('videoUnsupported'), true);
    }
  }

  function initExport() {
    var w = $('btnWav'), m = $('btnMp3'), v = $('btnVideo'), s = $('btnSrt'), sh = $('btnShare');
    if (w) w.addEventListener('click', exportWav);
    if (m) m.addEventListener('click', exportMp3);
    if (v) v.addEventListener('click', exportVideo);
    if (s) s.addEventListener('click', exportSrt);
    if (sh) sh.addEventListener('click', shareAudio);
  }

  // Feature 3: one-tap share (WhatsApp etc.) via Web Share API, download fallback.
  async function shareAudio() {
    var r = state.lastResult;
    if (!r || !r.audioBuffer) { setMsg(t('exportNeedsAudio'), true); return; }
    try {
      var blob = r.blob;
      if (!blob && hasModule('Exporter') && typeof window.Exporter.encodeWAV === 'function') {
        blob = await window.Exporter.encodeWAV(r.audioBuffer);
      }
      if (!blob) { setMsg(t('exportFailed'), true); return; }
      var file = new File([blob], 'voicesync-voice.wav', { type: 'audio/wav' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'VoiceSync Studio' });
        setMsg(t('shared'));
      } else {
        // Fallback: just download it.
        window.Exporter.downloadAudio(blob, 'voicesync-voice.wav');
        setMsg(t('shareFallback'));
      }
    } catch (e) {
      if (e && e.name !== 'AbortError') setMsg(t('exportFailed') + ': ' + (e.message || e), true);
    }
  }

  /* ---------------- subtitles (SRT) ---------------- */
  // Timing is estimated from the generated voice duration, distributed by
  // character count — accurate enough for YouTube captions.

  function fmtSrt(sec) {
    var ms = Math.max(0, Math.floor(sec * 1000));
    function p(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
    return p(Math.floor(ms / 3600000), 2) + ':' + p(Math.floor(ms / 60000) % 60, 2) +
      ':' + p(Math.floor(ms / 1000) % 60, 2) + ',' + p(ms % 1000, 3);
  }

  function wrapSrtLine(b) {
    if (b.length <= 42) return b;
    var words = b.split(' '), mid = b.length / 2, pos = 0, best = 0, bestDist = 1e9, i;
    for (i = 0; i < words.length; i++) {
      pos += words[i].length + 1;
      var dist = Math.abs(pos - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return words.slice(0, best + 1).join(' ') + '\n' + words.slice(best + 1).join(' ');
  }

  // Shared caption blocks for SRT export AND Shorts burnt-in captions.
  // Returns [{start, end, text}] timed across dur seconds.
  function getCaptionBlocks(text, dur) {
    if (state.dialogueMode) text = text.replace(/^[ \t]*[12]:[ \t]*/gm, '');
    var sens = text.replace(/\s+/g, ' ').split(/(?<=[.!?؟۔])\s+/);
    var blocks = [], cur = '';
    sens.forEach(function (s) {
      if ((cur + ' ' + s).trim().length <= 84) cur = (cur + ' ' + s).trim();
      else { if (cur) blocks.push(cur); cur = s; }
    });
    if (cur) blocks.push(cur);
    if (!blocks.length) blocks.push(text.slice(0, 84));
    var totalChars = blocks.reduce(function (a, b) { return a + b.length; }, 0) || 1;
    var t = 0, out = [];
    blocks.forEach(function (b) {
      var d = Math.max(0.8, dur * b.length / totalChars);
      out.push({ start: t, end: t + d, text: b });
      t += d;
    });
    return out;
  }

  function exportSrt() {
    var box = $('textInput');
    var text = box ? box.value.trim() : '';
    if (!text) { setMsg(t('enterText'), true); return; }
    var r = state.lastResult;
    var dur = (r && r.duration) ? r.duration : Math.max(1, text.length / 14);
    // Match the user's playback speed: at 2x the voice finishes in half the time.
    dur = dur / (state.speed || 1);
    var blocks = getCaptionBlocks(text, dur);
    var out = blocks.map(function (b, i) {
      return (i + 1) + '\n' + fmtSrt(b.start) + ' --> ' + fmtSrt(b.end) + '\n' + wrapSrtLine(b.text) + '\n';
    });
    try {
      var blob = new Blob(['\ufeff' + out.join('\n')], { type: 'text/plain;charset=utf-8' });
      window.Exporter.downloadAudio(blob, 'voicesync-subtitles.srt');
      setMsg(t('srtSaved'));
    } catch (e) {
      setMsg(t('exportFailed') + ': ' + (e && e.message ? e.message : e), true);
    }
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
    // Team 2 M6: validate against the real dropdown options, not a hardcoded pair.
    var tl = $('ttsLang');
    if (typeof p.ttsLang === 'string' && tl) {
      var valid = false;
      for (var i = 0; i < tl.options.length; i++) {
        if (tl.options[i].value === p.ttsLang) { valid = true; break; }
      }
      if (valid) { state.ttsLang = p.ttsLang; tl.value = p.ttsLang; }
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
    initDialogue();
    initPresets();
    initEasyMode();
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
