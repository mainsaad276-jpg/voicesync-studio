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

  /* ---------------- Play Store wrapper bridge (Part B) ----------------
   * Two Android wrappers are supported:
   *  1. The native WebView wrapper exposes window.VoiceSyncBridge with EXACT
   *     signatures: saveFile(base64, filename, mime),
   *     shareFile(base64, filename, mime, text), setKeepAwake(on).
   *  2. The Capacitor app exposes window.VSNative = { isNative: true,
   *     saveFile(name, base64) } (note the argument order) — adapted below.
   * Every bridge call is optional-chained so plain browsers are unaffected. */
  var IN_WRAPPER = (function () {
    try {
      if (window.VoiceSyncBridge && typeof window.VoiceSyncBridge.saveFile === 'function') return true;
      var vn = window.VSNative;
      if (vn && vn.isNative === true && typeof vn.saveFile === 'function') return true;
    } catch (e) {}
    return false;
  })();

  function wrapperBridge() {
    try {
      if (window.VoiceSyncBridge && typeof window.VoiceSyncBridge.saveFile === 'function') {
        return window.VoiceSyncBridge;
      }
      var vn = window.VSNative;
      if (vn && vn.isNative === true && typeof vn.saveFile === 'function') {
        // Adapt Capacitor's saveFile(name, base64) to the (base64, filename, mime) shape.
        return { saveFile: function (b64, filename /*, mime */) { return vn.saveFile(filename, b64); } };
      }
    } catch (e) {}
    return null;
  }

  // Keep the screen awake during long generation/export when the wrapper
  // bridge is present. Harmless no-op in plain browsers.
  function bridgeKeepAwake(on) {
    try {
      var b = wrapperBridge();
      if (b && typeof b.setKeepAwake === 'function') b.setKeepAwake(!!on);
    } catch (e) {}
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
    recordSaved: 'Recording saved to your device — tap Play to hear it.',
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

  /* ---------------- bilingual privacy/consent text (Part B) ----------------
   * Local bilingual constants (English + اردو in one string), per the
   * established M39 pattern — no new i18n keys, no dict drift. */

  // B3 (verbatim): the honest dictation/privacy text for the privacy-page worker.
  // NOTE (Team 5 flag): Team 5's promised "exact verbatim text" file was not in
  // the repo — this text was written fresh by Team 1 (Part B) to be truthful.
  var DICTATION_PRIVACY_TEXT =
    'Voice-to-Text (dictation) uses your browser\'s built-in speech recognition, which sends your spoken audio to Google\'s servers for transcription. It is NOT processed on-device, and it needs an internet connection. VoiceSync Studio itself does not record, store, or share your speech — the transcribed words go straight into your text box. / ' +
    'وائس ٹو ٹیکسٹ (ڈکٹیشن) آپ کے براؤزر کی بلٹ اِن اسپیچ ریکگنیشن استعمال کرتا ہے جو آپ کی بولی ہوئی آواز گوگل کے سرورز پر ٹرانسکرپشن کے لیے بھیجتا ہے۔ یہ ڈیوائس پر پروسیس نہیں ہوتا اور انٹرنیٹ درکار ہے۔ VoiceSync Studio خود آپ کی آواز ریکارڈ، محفوظ یا شیئر نہیں کرتا — لکھے ہوئے الفاظ سیدھے آپ کے ٹیکسٹ باکس میں جاتے ہیں۔';

  // B1 (Team 5 flag: same note — verbatim text file was missing, written fresh):
  // mic pre-permission disclosure shown BEFORE any getUserMedia call.
  var MIC_MODAL_RECORD_TITLE = 'Microphone access / مائیک کی اجازت';
  var MIC_MODAL_RECORD_BODY =
    'Tapping "Allow microphone" lets VoiceSync Studio use your microphone. Your recording is processed and kept ON YOUR DEVICE — nothing is uploaded. If you later use Chatterbox voice cloning, your recording is sent to a public Hugging Face Space so the AI can copy your voice style. / ' +
    '"مائیک کی اجازت دیں" دبانے سے VoiceSync Studio آپ کا مائیک استعمال کرے گا۔ آپ کی ریکارڈنگ آپ کے ڈیوائس پر ہی پروسیس اور محفوظ رہتی ہے — کچھ بھی اپ لوڈ نہیں ہوتا۔ اگر آپ بعد میں Chatterbox وائس کلوننگ استعمال کریں تو آپ کی ریکارڈنگ ایک پبلک Hugging Face Space پر بھیجی جائے گی تاکہ AI آپ کی آواز کی نقل کر سکے۔';
  var MIC_MODAL_DICTATE_TITLE = 'Voice-to-Text / وائس ٹو ٹیکسٹ';
  var MIC_MODAL_ALLOW = 'Allow microphone / مائیک کی اجازت دیں';
  var MIC_MODAL_LATER = 'Not now / ابھی نہیں';

  // B4: offline messaging.
  var OFFLINE_MSG = 'You are offline — voice generation needs internet. / آپ آف لائن ہیں — آواز بنانے کے لیے انٹرنیٹ درکار ہے۔';
  var ONLINE_MSG = 'Back online — you can generate again. / انٹرنیٹ واپس آگیا — اب آواز بنا سکتے ہیں۔';

  // B2: prompt shown when a mic recording would become a clone reference
  // but the consent checkbox was never ticked.
  var CLONE_CONSENT_NOTE =
    'To use your recording for voice cloning, please tick the voice-cloning consent checkbox below first. / اپنی ریکارڈنگ وائس کلوننگ کے لیے استعمال کرنے کے لیے پہلے نیچے وائس کلوننگ کی اجازت والا خانہ چیک کریں۔';

  var state = {
    lang: 'en',          // UI language (I18N)
    ttsLang: 'en',       // synthesis language (auto-detected from text on Generate)
    voiceId: null,
    selChar: null,       // selected CHARACTER object (not voiceId — shared voices differ)
    lastResult: null,    // last TTS.synthesize result
    lastCues: [],        // last LipSync cue list
    lastUrl: null,       // object URL of last audio (revoked on regenerate)
    audioEl: null,       // HTMLAudioElement for the audio playback path
    pausedKind: null,    // which playback path is paused (for resume toggle)
    previewEngine: null, // engine that spoke the last voice preview (M15: badge only, never lastResult)
    lastEngineNote: null, // M44: fallback note for the main pipeline (set by onGenerate)
    previewing: false,   // M44: voice preview audio in flight (busy-guard)
    previewEl: null,     // M44: HTMLAudioElement for preview playback (Google URL path)
    previewCtx: null,    // M44: AudioContext for preview playback (buffer path)
    previewSrc: null,     // M44: buffer source node for preview playback
    speechClock: null,   // {clock, box} virtual clock for the Web Speech path (M3)
    speechPausedAt: 0,   // performance.now() when speech was paused (M3)
    musicWasPlaying: false, // music was audible when pause hit (M5)
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
    rafId: 0,             // timeline rAF id
    voicesReq: 0,        // C4: loadVoices request token — stale responses are discarded
    voicesPromise: null, // C4: latest loadVoices() promise (onGenerate awaits it)
    generating: false,   // M17/C8: a generation run is in flight (voice frozen)
    genRunId: null,      // C8: TTS run id of the in-flight generation
    previewRunId: null,  // C8: TTS run id of the in-flight voice preview
    recordTimer: 0,      // M27: auto-stop timer id for mic recording
    recordAutoStopped: false // M27: recording hit the 10-minute cap
  };

  function t(key) {
    var s = safeGet(function () { return window.I18N.strings[state.lang][key]; }, undefined);
    if (typeof s === 'string' && s) return s;
    return FALLBACK[key] || key;
  }

  // Team 3 M29: translated character lang/gender/style for Urdu UI mode.
  // The char_*_ur maps (i18n.js) were dead — wire them here so cards show
  // translated text instead of hardcoded English in Urdu mode.
  function charI18n(mapKey, value) {
    if (state.lang !== 'ur') return value;
    var map = safeGet(function () { return window.I18N.strings.ur[mapKey]; }, null);
    if (map && typeof map === 'object' && map[value]) return map[value];
    return value;
  }

  // Q1+Q2: always-visible engine badge — which engine actually spoke?
  // Shows on EVERY result path, not just Web Speech.
  // M15: optional (engine, note) override lets the voice preview show its
  // engine WITHOUT going through state.lastResult (the preview must never
  // clobber the generated result). No-arg calls behave exactly as before.
  function updateEngineBadge(engine, note) {
    var badge = $('engineBadge');
    if (!badge) return;
    var r = engine ? { engine: engine } : state.lastResult;
    var engNote = (typeof note === 'undefined') ? state.lastEngineNote : note;
    if (!r || !r.engine) { badge.hidden = true; return; }
    var engineNames = {
      edge: 'Edge Neural', google: 'Google', webspeech: 'Device voice',
      chatterbox: 'Chatterbox', dialogue: 'Dialogue', mic: 'Recording'
    };
    var label = r.provider === 'azure' ? 'Studio Voice (Azure)' : (engineNames[r.engine] || r.engine);
    var isFallback = !!engNote;
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

  // B7 (Play Store round, deferred M37): the ~37 MB Rhubarb model must NOT
  // load at boot. probeLipSync() is now idempotent and is triggered either
  // lazily (requestIdleCallback once the page is idle) or on the first
  // Generate that actually needs lip-sync.
  var _lipSyncProbed = false;
  function ensureLipSync() {
    if (_lipSyncProbed) return;
    _lipSyncProbed = true;
    probeLipSync();
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

  /* ---------------- Play Store wrapper visibility (B4/B8) ---------------- */
  function applyWrapperVisibility() {
    // B4: no speechSynthesis inside the WebView wrapper — hide the dead
    // "Browser Voice (offline engine)" controls entirely.
    if (IN_WRAPPER && typeof window.speechSynthesis === 'undefined') {
      var bvs = $('browserVoiceSelect');
      if (bvs) bvs.hidden = true;
      var bvl = $('browserVoiceLabel');
      if (bvl) bvl.hidden = true;
    }
    // B8: SpeechRecognition doesn't exist in the WebView either — hide the
    // dictation button there (in a plain browser it stays, with a message).
    var bd = $('btnDictate');
    if (bd && IN_WRAPPER &&
        !(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      bd.hidden = true;
    }
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
        // Text built in JS (cards, counter, presets, selected voice) must
        // switch language too, not only the static labels.
        [updateCharCount, renderCharCards, refreshPresetList, updateSelCharBox].forEach(function (fn) {
          try { fn(); } catch (e) { /* never crash on a language switch */ }
        });
      });
    }
  }

  /* ---------------- text input ---------------- */

  function updateCharCount() {
    var box = $('textInput'), tc = $('textCounter');
    if (!box || !tc) return;
    var txt = box.value;
    var words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    var parts = Math.max(1, Math.ceil(txt.length / 400)); // Team 2 Fix: worst-case chunk limit (Edge 400 / Google 200)
    tc.textContent = txt.length + ' ' + t('counter_chars') + ' \u2022 ' +
      words + ' ' + t('counter_words') + ' \u2022 ' + parts + ' ' + t('counter_parts');
  }

  function initTextButtons() {
    var box = $('textInput');
    var smp = $('btnSample'), pst = $('btnPaste'), cpy = $('btnCopy'), clr = $('btnClear');
    if (smp) smp.addEventListener('click', function () {
      if (!box) return;
      box.value = t('sample_text');
      updateCharCount();
    });
    if (pst) pst.addEventListener('click', function () {
      if (!box || !navigator.clipboard || !navigator.clipboard.readText) { setMsg(t('paste_unavail'), true); return; }
      navigator.clipboard.readText().then(function (tx) {
        // M23: APPEND, never replace — and never wipe the box on an empty
        // clipboard (the old code did `box.value = tx || ''`).
        if (!tx) { setMsg(PASTE_EMPTY_NOTE); return; }
        box.value = box.value ? box.value + '\n' + tx : tx;
        updateCharCount();
      }).catch(function () { setMsg(t('paste_unavail'), true); });
    });
    if (cpy) cpy.addEventListener('click', function () {
      if (!box || !navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(box.value).then(function () { setMsg(t('copied')); })
        .catch(function () {});
    });
    if (clr) clr.addEventListener('click', function () {
      if (!box) return;
      box.value = ''; updateCharCount();
      // Team 2 Fix Round: clear stale audio too — old result must not survive.
      stopAll();
      state.lastResult = null; state.lastCues = [];
      // MINOR (Team 3): revoke the blob URL — stopAll() doesn't touch
      // lastUrl, so Clear leaked one object URL per press.
      releaseLastAudio();
      state.lastEngineNote = null; updateEngineBadge();
      ['btnPlay', 'btnListenBig'].forEach(function (id) {
        var b = $(id); if (b) b.disabled = true;
      });
      setMsg(t('cleared'));
    });
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

  // MINOR (Team 3): honest bilingual rejection for bad music files.
  // (Bilingual constant — no new i18n keys, per M39.)
  var MUSIC_FILE_REJECTED =
    'That file is not audio — pick an MP3, WAV or other audio file. / وہ آڈیو فائل نہیں ہے — کوئی MP3 یا WAV فائل چنیں۔';
  var MUSIC_FILE_TOO_BIG =
    'That music file is too large (over 50 MB) — pick a smaller one. / وہ میوزک فائل بہت بڑی ہے (50 MB سے زیادہ) — چھوٹی فائل چنیں۔';

  function initMusic() {
    var f = $('musicFile'), v = $('musicVol'), c = $('btnMusicClear'), p = $('btnMusicPick');
    if (p && f) p.addEventListener('click', function () { f.click(); }); // Team 2 M13: keyboard access
    if (f) f.addEventListener('change', function () {
      var file = f.files && f.files[0];
      if (!file) return;
      // MINOR (Team 3): validate type + size before accepting.
      var ftype = String(file.type || '').toLowerCase();
      if (ftype && ftype.indexOf('audio/') !== 0) { setMsg(MUSIC_FILE_REJECTED, true); f.value = ''; return; }
      if (file.size && file.size > 50 * 1024 * 1024) { setMsg(MUSIC_FILE_TOO_BIG, true); f.value = ''; return; }
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

  // Pitch slider shows a multiplier like the reference UI (1.00 = normal).
  // Behavior unchanged: semitones drive detune/utterance pitch.
  function pitchDisplay(st) { return Math.pow(2, (st || 0) / 12).toFixed(2); }

  function initTuning() {
    var sr = $('speedRange'), pr = $('pitchRange');
    var sv = $('speedVal'), pv = $('pitchVal');
    if (sr) sr.addEventListener('input', function () {
      state.speed = parseFloat(sr.value) || 1;
      if (sv) sv.textContent = state.speed.toFixed(1) + '×';
    });
    if (pr) pr.addEventListener('input', function () {
      state.pitch = parseInt(pr.value, 10) || 0;
      if (pv) pv.textContent = pitchDisplay(state.pitch);
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
    state.pitchedTimeSrc = timeSrc; // Team 3 M2: resume re-arms the mouth from here
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

  /* ---------------- B1: mic pre-permission disclosure modal ----------------
   * Shown between the tap and getUserMedia (or SpeechRecognition start) for
   * BOTH the "Record My Voice" button and the "Voice to Text" button.
   * NOTE (Team 5 flag): Team 5's promised file with "exact verbatim text"
   * was not in the repo — this disclosure text was written fresh by Team 1
   * (Part B) to be truthful about where audio goes. */
  var _micModalAllowCb = null;

  function hideMicModal() {
    _micModalAllowCb = null;
    var m = $('micModal');
    if (m) m.hidden = true;
  }

  function showMicConsent(kind, onAllow) {
    var m = $('micModal'), title = $('micModalTitle'), body = $('micModalBody'),
        allow = $('micModalAllow');
    if (!m || !title || !body || !allow) { // no modal markup — degrade to old behavior
      try { onAllow(); } catch (e) {}
      return;
    }
    title.textContent = (kind === 'dictate') ? MIC_MODAL_DICTATE_TITLE : MIC_MODAL_RECORD_TITLE;
    body.textContent = (kind === 'dictate') ? DICTATION_PRIVACY_TEXT : MIC_MODAL_RECORD_BODY;
    _micModalAllowCb = onAllow;
    m.hidden = false;
    try { allow.focus(); } catch (e) {}
  }

  function initMicModal() {
    var allow = $('micModalAllow'), later = $('micModalLater'), m = $('micModal');
    if (allow) allow.addEventListener('click', function () {
      var cb = _micModalAllowCb;
      hideMicModal();
      if (typeof cb === 'function') { try { cb(); } catch (e) {} }
    });
    if (later) later.addEventListener('click', hideMicModal);
    if (m) m.addEventListener('click', function (ev) { if (ev.target === m) hideMicModal(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        var mm = $('micModal');
        if (mm && !mm.hidden) hideMicModal();
      }
    });
  }

  /* ---------------- voice-to-text (dictation) ---------------- */
  // B3: the old comment below was FALSE — dictation is not "no server".
  // Chrome's SpeechRecognition transcribes the mic straight into the script
  // box, but the transcription itself happens on Google's servers.

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
    // B1: privacy disclosure first — only start listening after "Allow".
    showMicConsent('dictate', function () { startDictateNow(SR); });
  }

  function startDictateNow(SR) {
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
      // M19: restore the saved synthesis language BEFORE the first
      // loadVoices() (it was written on every change but never read back).
      var savedLang = null;
      try { savedLang = localStorage.getItem('voicesync-ttsLang'); } catch (e) {}
      if (savedLang) {
        var okL = false, li;
        for (li = 0; li < tl.options.length; li++) {
          if (tl.options[li].value === savedLang) { okL = true; break; }
        }
        if (okL) { state.ttsLang = savedLang; tl.value = savedLang; }
      }
      tl.addEventListener('change', function () {
        // M17: language frozen while a generation runs — the run keeps the
        // language it started with.
        if (state.generating) { setMsg(t('generating')); tl.value = state.ttsLang; return; }
        state.ttsLang = tl.value || 'en';
        loadVoices();
        renderLangPills(); // Team 2 Fix: keep pills in sync
      });
    }
    loadVoices();
    // Chrome/Edge load device voices asynchronously: getVoices() is empty on
    // first call and fills in later via 'voiceschanged'. Reload when they arrive.
    try {
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis.addEventListener) {
        speechSynthesis.addEventListener('voiceschanged', function () { loadVoices(); });
      }
    } catch (e) { /* not supported — offline voices just stay hidden */ }
    // Voice preview: hear the selected voice before generating.
    var pv = $('btnVoicePreview');
    if (pv) pv.addEventListener('click', previewVoice);
  }

  // Preview the given (or currently selected) voice with a short sample.
  async function previewVoice(voiceId, pitchOverride) {
    if (!hasModule('TTS') || typeof window.TTS.synthesize !== 'function') return;
    var vid = voiceId || state.voiceId;
    if (!vid) { setMsg(t('noVoices'), true); return; }
    // C8: never clobber an in-flight generation — no TTS cancel, no state
    // writes, no overlapping audio. The user waits for the run to finish.
    if (state.generating) { setMsg(t('generating')); return; }
    // Round 2: character pitch offset honored in preview (does not clobber state).
    var pit = (typeof pitchOverride === 'number') ? pitchOverride : (state.pitch || 0);
    // Q4: busy-guard — no overlapping previews.
    if (state.previewing) return;
    state.previewing = true;
    // Sample in the voice's own language (character cards pass their voice).
    var sampleLang = state.ttsLang;
    if (voiceId) {
      if (/^edge:(ur|hi)/.test(voiceId)) sampleLang = voiceId.indexOf(':hi') !== -1 ? 'hi' : 'ur';
      else if (/^edge:ru/.test(voiceId)) sampleLang = 'ru';
      else if (/^edge:ar/.test(voiceId)) sampleLang = 'ar';
      else sampleLang = 'en';
    }
    var sample = (sampleLang === 'ur') ? 'السلام علیکم! یہ میری آواز کا نمونہ ہے۔'
      : (sampleLang === 'hi') ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।'
      : (sampleLang === 'ru') ? 'Здравствуйте! Это образец моего голоса.'
      : (sampleLang === 'ar') ? 'مرحباً! هذه عينة من صوتي.'
      : 'Hello! This is a preview of my voice.';
    setMsg(t('previewing'));
    stopAll();
    state.previewing = true; // stopAll clears it; re-arm
    // C8: per-run identity — the preview must never clobber a generation.
    // Remember which generation (if any) was current when we started.
    var genAtStart = state.genRunId;
    try {
      var pr = window.TTS.synthesize(sample, vid);
      state.previewRunId = pr && pr.runId;
      var r = await pr;
      state.previewRunId = null; // this run settled
      // C8: a generation started while we were synthesizing — abort now and
      // touch NOTHING (no badge, no message, no state).
      if (state.genRunId !== genAtStart) { state.previewing = false; return; }
      if (!r || r.error) {
        state.previewing = false;
        if (r && isCancelled(r.error)) return; // superseded — clean abort
        setMsg(t('ttsFailed') + ': ' + ((r && r.error) || ''), true);
        return;
      }
      // Q2/M15: show which engine actually spoke the preview — via the
      // separate state.previewEngine field. The preview must NEVER touch
      // state.lastResult (it destroyed the generated result: Team 3 M15).
      state.previewEngine = r.engine;
      var previewEngineNote = null;
      if (r.engine && vid) {
        var wantEngine = parseVoiceId(vid).engine;
        if (wantEngine && r.engine !== wantEngine) {
          previewEngineNote = t('engineFallback').replace('{want}', wantEngine).replace('{got}', r.engine);
        }
      }
      updateEngineBadge(state.previewEngine, previewEngineNote);
      if (previewEngineNote) setMsg(previewEngineNote, true);
      // Q5: preview honors speed/pitch.
      var spd = state.speed || 1;
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
          if (!previewEngineNote) setMsg(t('playing'));
          // Team 3 M6: iOS creates the AudioContext in 'suspended' state when
          // `new AC()` runs after an await (outside the user gesture) — resume
          // it or the preview is silent on iOS Safari.
          try { if (ctx.state === 'suspended') await ctx.resume(); } catch (e) {}
          src.start(0);
          state.previewCtx = ctx; state.previewSrc = src;
          return;
        }
      }
      if (r.utterance && typeof window.speechSynthesis !== 'undefined') {
        try {
          r.utterance.rate = spd;
          r.utterance.pitch = Math.max(0.5, Math.min(2, Math.pow(2, pit / 12))); // semitones -> pitch ratio
        } catch (e) {}
        r.utterance.onend = function () { state.previewing = false; };
        if (!previewEngineNote) setMsg(t('playing'));
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(r.utterance);
        return;
      }
      if (r.url) {
        var el = new Audio(r.url);
        try { el.playbackRate = spd; } catch (e) {}
        // Team 2 note (Medium 11): pitch is NOT applied here — a plain
        // <audio> element cannot pitch-shift, and the Google URL is
        // CORS-blocked from fetch->WebAudio->detune routing. Speed works.
        state.previewEl = el;
        el.onended = function () { state.previewing = false; setMsg(t('done')); };
        el.onerror = function () { state.previewing = false; setMsg(t('noAudio'), true); };
        if (!previewEngineNote) setMsg(t('playing'));
        // Team 2 Round 4: catch play() rejection so the guard never sticks.
        try {
          var pp = el.play();
          if (pp && pp.catch) pp.catch(function () { state.previewing = false; setMsg(t('noAudio'), true); });
        } catch (e) { state.previewing = false; setMsg(t('noAudio'), true); }
        return;
      }
      state.previewing = false;
      setMsg(t('noAudio'), true);
    } catch (e) {
      state.previewing = false; state.previewRunId = null;
      if (isCancelled(e)) return; // superseded by Generate — a clean abort, not an error
      setMsg(t('ttsFailed') + ': ' + (e && e.message || e), true);
    }
  }

  // SPEC §3: TTS.getVoices(lang) -> Promise<[{id,name,lang,gender,engine}]>
  // C4: concurrency guard — callers fire-and-forget, so responses can resolve
  // out of order (click card B then card A fast). Only the NEWEST request may
  // write state; stale responses return without touching anything.
  // state.voicesPromise always points at the latest call so onGenerate can
  // await it before reading state.voiceId.
  function loadVoices() {
    var my = (state.voicesReq = (state.voicesReq || 0) + 1);
    state.voicesPromise = _loadVoices(my);
    return state.voicesPromise;
  }
  async function _loadVoices(my) {
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
    // B4: in the Android wrapper speechSynthesis does not exist, so the
    // "Browser Voice (offline engine)" entries would be dead — hide them.
    if (IN_WRAPPER && typeof window.speechSynthesis === 'undefined') {
      voices = (voices || []).filter(function (v) { return v.engine !== 'webspeech'; });
    }
    if (my !== state.voicesReq) return; // C4: stale — a newer load superseded this one; touch nothing
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
    // Team 2 Fix: warn when the previously selected voice was filtered out
    // by the language pill instead of silently switching to voices[0].
    try {
      var prevWant = (state.selChar && state.selChar.voiceId) ||
        localStorage.getItem('voicesync-voice');
      if (prevWant && prevWant !== pick.id) {
        var stillThere = false;
        for (var vi = 0; vi < voices.length; vi++) {
          if (voices[vi].id === prevWant) { stillThere = true; break; }
        }
        if (!stillThere) {
          setMsg(t('voice_filtered_out'), true);
          state.selChar = null; // the character is gone from this language
          updateSelCharBox();
          renderCharCards(); // C4: the CARDS must reflect the filtered list too, not just the info box
        }
      }
    } catch (e) {}
    refreshBrowserVoices(voices);
    sel.onchange = function () {
      // M17: voice is frozen while a generation runs — the run keeps the
      // voice it started with.
      if (state.generating) { setMsg(t('generating')); if (state.voiceId) sel.value = state.voiceId; return; }
      state.voiceId = sel.value;
      // Team 2 Fix: re-derive the selected character from the dropdown pick.
      state.selChar = null;
      for (var ci = 0; ci < CHARACTERS.length; ci++) {
        if (CHARACTERS[ci].voiceId === sel.value) { state.selChar = CHARACTERS[ci]; break; }
      }
      // MINOR FIX (Team 2 R6): apply the matched character's pitch offset so
      // shared base voices stay distinct when picked from the dropdown too.
      if (state.selChar && typeof state.selChar.pitch === 'number') {
        state.pitch = state.selChar.pitch;
        var pr2 = $('pitchRange'), pv2 = $('pitchVal');
        if (pr2) pr2.value = String(state.selChar.pitch);
        if (pv2) pv2.textContent = pitchDisplay(state.selChar.pitch);
      }
      try { localStorage.setItem('voicesync-voice', sel.value); } catch (e) {}
      renderCharCards();
      updateSelCharBox();
    };
    if (state.dialogueMode) syncVoice2();
    renderCharCards();
  }

  /* ---------------- Language pills (Free Voice Over skin) ---------------- */
  var LANG_PILLS = [
    { code: 'ur',    label: 'Urdu • \u0627\u0631\u062f\u0648' },
    { code: 'hi',    label: 'Hindi • \u0939\u093f\u0928\u094d\u0926\u0940' },
    { code: 'ru',    label: 'Russian • \u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
    { code: 'en',    label: 'English (US) • English' },
    { code: 'en-GB', label: 'English (UK) • English UK' },
    { code: 'ar',    label: 'Arabic • \u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
    { code: 'es',    label: 'Spanish • Espa\u00f1ol' },
    { code: 'fr',    label: 'French • Fran\u00e7ais' }
  ];

  function renderLangPills() {
    var wrap = $('langPills');
    if (!wrap) return;
    var q = ($('langSearch') && $('langSearch').value || '').trim().toLowerCase();
    wrap.innerHTML = '';
    LANG_PILLS.forEach(function (L) {
      if (q && L.label.toLowerCase().indexOf(q) === -1) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-pill' + (state.ttsLang === L.code ? ' selected' : '');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', state.ttsLang === L.code ? 'true' : 'false');
      b.textContent = L.label;
      b.addEventListener('click', function () { setLangPill(L.code); });
      wrap.appendChild(b);
    });
    // M17: re-applied on every render — a render during a generation run
    // (auto-detect) must not resurrect enabled pills. setLangPill guards too.
    if (state.generating) {
      var pb = wrap.querySelectorAll('button');
      for (var bi = 0; bi < pb.length; bi++) pb[bi].disabled = true;
    }
  }

  // Team 3 M40-light: single voiceId-parsing helper. VoiceIds look like
  // 'engine:locale-voice' (e.g. 'edge:ur-PK-AsadNeural').
  function parseVoiceId(id) {
    var parts = String(id).split(':');
    return { engine: parts[0], parts: parts };
  }

  // Team 2 Fix (Medium 10): derive the language code from a character's voiceId.
  function charLangCode(c) {
    try {
      var v = parseVoiceId(c.voiceId); // 'edge:ur-PK-AsadNeural'
      if (v.parts.length > 1) return v.parts[1].split('-').slice(0, 2).join('-');
    } catch (e) {}
    return 'en';
  }

  // Team 2 Fix (Medium 10): point the whole language UI at the given code.
  function syncLangUiToCode(code) {
    var tl = $('ttsLang');
    var use = code, ok = false, base = String(code).split('-')[0];
    if (tl) {
      var i;
      for (i = 0; i < tl.options.length; i++) {
        if (tl.options[i].value === code) { ok = true; break; }
      }
      if (!ok) {
        for (i = 0; i < tl.options.length; i++) {
          if (tl.options[i].value === base) { use = base; ok = true; break; }
        }
      }
      if (!ok) return; // unknown language — leave UI alone
      tl.value = use;
    }
    state.ttsLang = use;
    try { localStorage.setItem('voicesync-ttsLang', use); } catch (e) {}
    renderLangPills();
    loadVoices(); // reload voices; saved voiceId keeps the character picked
  }

  function setLangPill(code) {
    if (state.generating) { setMsg(t('generating')); return; } // M17: language frozen mid-run
    state.ttsLang = code;
    try { localStorage.setItem('voicesync-ttsLang', code); } catch (e) {}
    // Sync the full language dropdown (exact or base-language match).
    var tl = $('ttsLang');
    if (tl) {
      var base = String(code).split('-')[0];
      var matched = false;
      for (var i = 0; i < tl.options.length; i++) {
        if (tl.options[i].value === code) { tl.value = code; matched = true; break; }
      }
      if (!matched) {
        for (var j = 0; j < tl.options.length; j++) {
          if (tl.options[j].value === base) { tl.value = base; break; }
        }
      }
    }
    loadVoices();
    renderLangPills();
  }

  function initLangPills() {
    renderLangPills();
    var s = $('langSearch');
    if (s) s.addEventListener('input', renderLangPills);
  }

  // Browser (device) voices dropdown — offline engine only.
  function refreshBrowserVoices(voices) {
    var sel = $('browserVoiceSelect');
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '';
    var dev = (voices || []).filter(function (v) { return v.engine === 'webspeech'; });
    if (!dev.length) {
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = t('browser_voice_none');
      sel.appendChild(o0);
      return;
    }
    dev.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.name;
      sel.appendChild(o);
    });
    sel.value = keep || '';
    if (sel.selectedIndex < 0) sel.selectedIndex = 0; // never show a blank box
    sel.onchange = function () {
      if (!sel.value) return;
      state.voiceId = sel.value;
      try { localStorage.setItem('voicesync-voice', sel.value); } catch (e) {}
      var main = $('voiceSelect');
      if (main) main.value = sel.value;
      renderCharCards();
      updateSelCharBox();
    };
  }

  /* ---------------- Character Voices (Free Voice Over skin) ---------------- */
  // Each character maps to a REAL Edge Neural voice ID (edge:<ShortName>).
  // `pitch` is a semitone offset applied on select/preview so characters that
  // share one base voice still sound genuinely different (boss: "sab ki
  // voice 1 jaisi na ho"). Verified against EDGE_VOICES in QA.
  var CHARACTERS = [
    // Urdu
    { name: 'Ahmed',        voiceId: 'edge:ur-PK-AsadNeural',    lang: 'Urdu',    gender: 'Male',   style: 'News Narrator', pitch: 0 },
    { name: 'Fatima',       voiceId: 'edge:ur-PK-UzmaNeural',    lang: 'Urdu',    gender: 'Female', style: 'Soft Story', pitch: 0 },
    { name: 'Bilal',        voiceId: 'edge:ur-IN-SalmanNeural',  lang: 'Urdu',    gender: 'Male',   style: 'Deep Calm Voice', pitch: 0 },
    { name: 'Aisha',        voiceId: 'edge:ur-IN-GulNeural',     lang: 'Urdu',    gender: 'Female', style: 'Kids Teacher', pitch: 0 },
    { name: 'Dastaan Go',   voiceId: 'edge:ur-PK-AsadNeural',    lang: 'Urdu',    gender: 'Male',   style: 'Storyteller \u2022 Dastaan', pitch: -4 },
    { name: 'Guddu',        voiceId: 'edge:ur-IN-GulNeural',     lang: 'Urdu',    gender: 'Female', style: 'Cartoon \u2022 Urdu Kids Fun', pitch: 7 },
    // Hindi
    { name: 'Priya Sharma', voiceId: 'edge:hi-IN-SwaraNeural',   lang: 'Hindi',   gender: 'Female', style: 'Bollywood Story', pitch: 0 },
    { name: 'Arjun Kumar',  voiceId: 'edge:hi-IN-MadhurNeural',  lang: 'Hindi',   gender: 'Male',   style: 'News Anchor', pitch: 0 },
    { name: 'Ananya',       voiceId: 'edge:hi-IN-SwaraNeural',   lang: 'Hindi',   gender: 'Female', style: 'Soft Narration', pitch: 3 },
    // Russian
    { name: 'Ivan Petrov',     voiceId: 'edge:ru-RU-DmitryNeural',   lang: 'Russian', gender: 'Male',   style: 'Deep Narrator', pitch: 0 },
    { name: 'Natasha Volkova', voiceId: 'edge:ru-RU-SvetlanaNeural', lang: 'Russian', gender: 'Female', style: 'Clear Studio', pitch: 0 },
    { name: 'Dmitri',          voiceId: 'edge:ru-RU-DmitryNeural',   lang: 'Russian', gender: 'Male',   style: 'Documentary', pitch: -3 },
    // English (US)
    { name: 'Alex Carter',   voiceId: 'edge:en-US-ChristopherNeural', lang: 'English', gender: 'Male',   style: 'Youtube Voice', pitch: 0 },
    { name: 'Sophia Miller', voiceId: 'edge:en-US-JennyNeural',       lang: 'English', gender: 'Female', style: 'Natural', pitch: 0 },
    { name: 'Emma Rose',     voiceId: 'edge:en-US-AriaNeural',        lang: 'English', gender: 'Female', style: 'Kids/Friendly', pitch: 0 },
    { name: 'The Narrator',  voiceId: 'edge:en-US-GuyNeural',        lang: 'English', gender: 'Male',   style: 'Deep \u2022 Movie Trailer', pitch: -5 },
    // English (UK)
    { name: 'Oliver Reed',  voiceId: 'edge:en-GB-RyanNeural',  lang: 'English', gender: 'Male',   style: 'BBC Style', pitch: 0 },
    { name: 'Amelia Hart',  voiceId: 'edge:en-GB-SoniaNeural', lang: 'English', gender: 'Female', style: 'Elegant', pitch: 0 },
    // Arabic
    { name: 'Omar Farooq', voiceId: 'edge:ar-SA-HamedNeural',  lang: 'Arabic', gender: 'Male',   style: 'News', pitch: 0 },
    { name: 'Layla Noor',  voiceId: 'edge:ar-SA-ZariyahNeural', lang: 'Arabic', gender: 'Female', style: 'Soft', pitch: 0 },
    // Bengali
    { name: 'Yusuf Ali',   voiceId: 'edge:bn-BD-PradeepNeural', lang: 'Bengali', gender: 'Male', style: 'Narrator', pitch: 0 },
    // German
    { name: 'Hans Weber',  voiceId: 'edge:de-DE-ConradNeural', lang: 'German', gender: 'Male', style: 'Documentary', pitch: 0 },
    // French
    { name: 'Pierre Dubois', voiceId: 'edge:fr-FR-HenriNeural', lang: 'French', gender: 'Male', style: 'Storyteller', pitch: 0 },
    // Japanese
    { name: 'Kenji Sato',  voiceId: 'edge:ja-JP-NanamiNeural', lang: 'Japanese', gender: 'Female', style: 'Anime Narrator', pitch: -6 },
    { name: 'Yuki Tanaka', voiceId: 'edge:ja-JP-NanamiNeural', lang: 'Japanese', gender: 'Female', style: 'Friendly', pitch: 0 },
    // Korean
    { name: 'Seo-yeon',    voiceId: 'edge:ko-KR-SunHiNeural', lang: 'Korean', gender: 'Female', style: 'K-Drama Style', pitch: 0 },
    // Cartoon
    { name: 'Chotu',       voiceId: 'edge:hi-IN-MadhurNeural', lang: 'Hindi', gender: 'Male', style: 'Boy \u2022 Funny Kids', pitch: 8 }
  ];

  // Two-letter initials like the reference ("PS", "AK", "IP").
  function charInitials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  function charMatches(c, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return c.name.toLowerCase().indexOf(q) !== -1 ||
      c.lang.toLowerCase().indexOf(q) !== -1 ||
      c.style.toLowerCase().indexOf(q) !== -1;
  }

  function renderCharCards() {
    var grid = $('charGrid');
    if (!grid) return;
    var q = ($('charSearch') && $('charSearch').value || '').trim();
    grid.innerHTML = '';
    var shown = 0;
    CHARACTERS.forEach(function (c) {
      if (!charMatches(c, q)) return;
      shown++;
      var card = document.createElement('button');
      card.type = 'button';
      // Team 2 Fix (Medium 12): highlight ONLY the selected card object,
      // not every card sharing the same voiceId.
      var isSel = (state.selChar === c);
      card.className = 'char-card' + (isSel ? ' selected' : '');
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', isSel ? 'true' : 'false');
      card.setAttribute('aria-label', c.name + ' — ' +
        charI18n('char_lang_ur', c.lang) + ' ' + charI18n('char_gender_ur', c.gender));

      var avatar = document.createElement('span');
      avatar.className = 'char-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = charInitials(c.name);
      card.appendChild(avatar);

      var play = document.createElement('span');
      play.className = 'char-play';
      play.setAttribute('role', 'button');
      // Team 3 M32: keyboard-reachable + activatable (a <button> can't nest
      // inside the card's <button>, so the span gets tabindex + keydown).
      play.setAttribute('tabindex', '0');
      play.setAttribute('aria-label', t('char_preview') + ' ' + c.name);
      play.textContent = '▶';
      var doPreview = function (ev) {
        ev.stopPropagation();
        previewVoice(c.voiceId, c.pitch || 0);
      };
      play.addEventListener('click', doPreview);
      play.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          doPreview(ev);
        }
      });
      card.appendChild(play);

      var nm = document.createElement('p');
      nm.className = 'char-name';
      nm.textContent = c.name;
      card.appendChild(nm);

      var desc = document.createElement('p');
      desc.className = 'char-desc';
      // Team 3 M29: translated lang/gender/style in Urdu mode.
      desc.textContent = charI18n('char_lang_ur', c.lang) + ' • ' +
        charI18n('char_gender_ur', c.gender) + ' • ' + charI18n('char_style_ur', c.style);
      card.appendChild(desc);

      var tags = document.createElement('div');
      tags.className = 'char-tags';
      var t1 = document.createElement('span'); t1.className = 'char-tag'; t1.textContent = state.lang === 'ur' ? 'مفت' : 'FREE';
      var t2 = document.createElement('span'); t2.className = 'char-tag'; t2.textContent = state.lang === 'ur' ? 'اسٹوڈیو' : 'Studio';
      tags.appendChild(t1); tags.appendChild(t2);
      card.appendChild(tags);

      card.addEventListener('click', function () { selectCharacter(c); });
      grid.appendChild(card);
    });
    if (!shown) {
      var empty = document.createElement('p');
      empty.className = 'char-empty';
      empty.textContent = t('char_no_match');
      grid.appendChild(empty);
    }
  }

  // Clicking a card selects that voice for generation.
  function selectCharacter(c) {
    // M17: voice frozen while a generation runs — the run keeps the voice it
    // started with (syncLangUiToCode is only called from here, so it's covered).
    if (state.generating) { setMsg(t('generating')); return; }
    state.voiceId = c.voiceId;
    state.selChar = c; // Team 2 Fix: track the CHARACTER, not just voiceId
    // Character pitch offset so shared base voices sound different.
    if (typeof c.pitch === 'number') {
      state.pitch = c.pitch;
      var pr = $('pitchRange'), pv = $('pitchVal');
      if (pr) pr.value = String(c.pitch);
      if (pv) pv.textContent = pitchDisplay(c.pitch);
    }
    // Medium 10: sync language UI to the character's language.
    // MAJOR FIX (Team 2 R6): persist FIRST so loadVoices() (triggered by
    // syncLangUiToCode) picks up the NEW voice instead of clobbering
    // state.voiceId with the previously saved one.
    try { localStorage.setItem('voicesync-voice', c.voiceId); } catch (e) {}
    try { syncLangUiToCode(charLangCode(c)); } catch (e) {}
    updateSelCharBox();
    var sel = $('voiceSelect');
    if (sel) {
      var found = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === c.voiceId) { sel.value = c.voiceId; found = true; break; }
      }
      // Voice may live under a different ttsLang filter — add it if missing.
      if (!found) {
        var o = document.createElement('option');
        o.value = c.voiceId;
        o.textContent = c.name + ' (Edge Neural)';
        sel.appendChild(o);
        sel.value = c.voiceId;
      }
    }
    renderCharCards();
    setMsg(t('char_selected').replace('{name}', c.name));
  }

  function initCharVoices() {
    renderCharCards();
    updateSelCharBox();
    var s = $('charSearch');
    if (s) s.addEventListener('input', renderCharCards);
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
  // MINOR (Team 3): preset restore must clamp numerics to the slider
  // ranges (speed 0.5–2.0, pitch -12–+12 per index.html), so a hand-edited
  // or stale preset can never leave state out of range.
  function clampNum(v, lo, hi) {
    v = Number(v);
    if (isNaN(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }

  function applyPreset(name) {
    var p = getPresets()[name];
    if (!p) return;
    if (p.ttsLang) {
      state.ttsLang = p.ttsLang;
      var tl = $('ttsLang'); if (tl) tl.value = p.ttsLang;
      renderLangPills(); // M18: pill highlight follows the restored language
    }
    var applyRest = function () {
      // M18: validate the preset's voiceId against the LOADED voices — a stale
      // preset must never set an invisible voiceId. Then persist it and
      // re-render pills + cards + selChar + the info box so every layer agrees.
      if (p.voiceId) {
        var vs = $('voiceSelect');
        var okV = false, vi;
        if (vs) {
          for (vi = 0; vi < vs.options.length; vi++) {
            if (vs.options[vi].value === p.voiceId) { okV = true; break; }
          }
        }
        if (okV) {
          vs.value = p.voiceId;
          state.voiceId = p.voiceId;
          try { localStorage.setItem('voicesync-voice', p.voiceId); } catch (e) {}
          state.selChar = null;
          for (var ci = 0; ci < CHARACTERS.length; ci++) {
            if (CHARACTERS[ci].voiceId === p.voiceId) { state.selChar = CHARACTERS[ci]; break; }
          }
          renderCharCards();
          updateSelCharBox();
        }
      }
      if (typeof p.speed === 'number') {
        state.speed = clampNum(p.speed, 0.5, 2);
        var sr = $('speedRange'); if (sr) { sr.value = state.speed; }
        var sl = $('speedVal'); if (sl) sl.textContent = state.speed + 'x';
      }
      if (typeof p.pitch === 'number') {
        state.pitch = Math.round(clampNum(p.pitch, -12, 12));
        var pr = $('pitchRange'); if (pr) { pr.value = state.pitch; }
        var pl = $('pitchVal'); if (pl) pl.textContent = pitchDisplay(state.pitch);
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
    if (s2) s2.addEventListener('change', function () {
      // M17: voice frozen while a generation runs.
      if (state.generating) { setMsg(t('generating')); if (state.voiceId2) s2.value = state.voiceId2; return; }
      state.voiceId2 = s2.value;
    });
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

  // Team 3 M40: single shared implementation — delegates to TTS._resampleLinear.
  // (tts.js is always loaded with app.js; the old local copy was byte-identical.)
  function resampleLinear(data, fromRate, toRate) {
    return window.TTS._resampleLinear(data, fromRate, toRate);
  }

  async function synthesizeDialogue(segments) {
    // M24: markers present but every speaker empty — an honest message, not a
    // raw createBuffer(…, sampleRate 0) browser error.
    if (!segments || !segments.length) return { error: t('dialogueNeedMarkers') };
    var parts = [], rate = 0;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var vid = seg.speaker === 2 ? (state.voiceId2 || state.voiceId) : state.voiceId;
      setMsg(t('generating') + ' (' + (i + 1) + '/' + segments.length + ')');
      var r = await window.TTS.synthesize(seg.text, vid);
      // M12: a Stop mid-dialogue surfaces as 'cancelled' — report it cleanly
      // instead of the misleading "needs downloadable audio".
      if (r && r.error && isCancelled(r.error)) return { error: 'cancelled' };
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

  function stopAll(opts) {
    state.playToken++; // invalidate any in-flight Google chunk chain
    state.pausedKind = null; // any pause/resume state dies with playback
    if (state.recording) { stopRecording(); }
    if (state.dictating) { stopDictate(); }
    // Stop voice preview too. Team 2 Round 4: also reset the busy-guard,
    // otherwise stopping a Google-fallback preview kills the button forever.
    state.previewing = false;
    try { if (state.previewSrc) state.previewSrc.stop(); } catch (e) {}
    try { if (state.previewCtx) state.previewCtx.close(); } catch (e) {}
    state.previewSrc = null; state.previewCtx = null;
    try { if (state.previewEl) state.previewEl.pause(); } catch (e) {}
    state.previewEl = null;
    showAudioPlayer(null);
    stopMusic();
    cleanupPitched();
    try {
      // C8: onGenerate pre-cancels only the stale preview run and passes
      // skipTtsCancel — a bare cancel-all here could clobber an in-flight
      // generation started from another path.
      if (hasModule('TTS') && typeof window.TTS.cancel === 'function' &&
          !(opts && opts.skipTtsCancel)) window.TTS.cancel();
    } catch (e) {}
    if (state.audioEl) {
      try { state.audioEl.pause(); state.audioEl.removeAttribute('src'); } catch (e) {}
      state.audioEl = null;
    }
    try { if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel(); } catch (e) {}
    stopAvatar();
    if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = 0; }
    state.speechClock = null; state.speechPausedAt = 0; // M3: drop the frozen virtual clock
    stopTimeline();
    state.speaking = false;
    bridgeKeepAwake(false); // B5 round: a manual stop also releases the wake lock
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
    // Team 3 C3: Avatar.speak samples el.currentTime ONCE, then advances the
    // mouth on WALL-CLOCK (avatar.js frame) — at speed != 1 the cue times
    // must be scaled to the wall-clock base (the old "no scaling needed"
    // note was wrong and desynced the mouth linearly).
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(scaleCues(cues, state.speed || 1), el); } catch (e) {}
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
      var p = Math.pow(2, (state.pitch || 0) / 12); // semitones -> pitch ratio (0.5..2)
      u.pitch = Math.max(0.5, Math.min(2, p));
    } catch (e) {}
    var cues = [];
    if (hasModule('LipSync') && typeof window.LipSync.makeTalkingCues === 'function') {
      try { cues = window.LipSync.makeTalkingCues(dur) || []; } catch (e) { cues = []; }
    }
    // Virtual timing source: Avatar.speak only reads .currentTime (SPEC §3).
    // The virtual clock advances in real time while the utterance speaks at
    // u.rate = speed, so cue times must be scaled to the real-time base.
    var clock = { currentTime: 0 };
    var clockBox = { t0: performance.now() }; // mutable: Team 3 M3 pause shifts t0
    state.speechClock = { clock: clock, box: clockBox };
    state.clockTimer = setInterval(function () {
      clock.currentTime = (performance.now() - clockBox.t0) / 1000;
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
  // Round 2: mirror playable URLs into the visible <audio> player (video reference).
  function showAudioPlayer(url) {
    var ap = $('audioPlayer');
    if (!ap) return;
    if (url) {
      try { ap.src = url; } catch (e) {}
      ap.hidden = false;
    } else {
      try { ap.pause(); ap.removeAttribute('src'); } catch (e) {}
      ap.hidden = true;
    }
  }

  function startGooglePlayback(result) {
    stopAll();
    // Team 2 Fix (Medium 14): the VISIBLE player IS the playback element —
    // no second hidden Audio holding the same URL (no double-play).
    var ap = $('audioPlayer');
    if (ap) { try { ap.hidden = false; } catch (e) {} }
    var token = state.playToken;
    var urls = (result.urls && result.urls.length) ? result.urls.slice() : [result.url];
    var dur = result.duration || 5;
    var perChunk = dur / urls.length;
    var cues = [];
    if (hasModule('LipSync') && typeof window.LipSync.makeTalkingCues === 'function') {
      // Team 3 M8: dur may be an estimate — pad the synthetic cue stream
      // ×1.5 so it never ends mid-utterance (which freezes the mouth).
      try { cues = window.LipSync.makeTalkingCues(dur * 1.5) || []; } catch (e) { cues = []; }
    }
    state.lastCues = cues;
    var clock = { currentTime: 0 };
    var offset = 0, idx = 0, el = null;
    startMusic();

    state.clockTimer = setInterval(function () {
      clock.currentTime = offset + (el && typeof el.currentTime === 'number' ? el.currentTime : 0);
    }, 50);

    // Team 3 C3: scale cue times to the wall-clock base — the audio plays
    // at speed != 1 while the avatar mouth advances on wall-clock.
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function') {
      try { window.Avatar.speak(scaleCues(cues, state.speed || 1), clock); } catch (e) {}
    }

    function playNext() {
      if (token !== state.playToken) return; // superseded by stopAll()
      if (idx >= urls.length) { stopAll(); setMsg(t('done')); return; }
      el = ap || new Audio();
      state.audioEl = el;
      el.preload = 'auto';
      try { el.src = urls[idx]; } catch (e) { stopAll(); setMsg(t('playFailed'), true); return; }
      try { el.playbackRate = state.speed || 1; } catch (e) {}
      // Team 3 M9: pitch is NOT applied here — a plain <audio> element cannot
      // pitch-shift, and the Google URL is CORS-blocked from
      // fetch->WebAudio->detune routing (same documented limitation as the
      // voice preview). Speed works; the pitch slider is a no-op on this path.
      // The user-facing notice is shown via pitchNoop at playback start.
      var pitchNoop = (state.pitch || 0) !== 0;
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
      // Team 3 M9: honest user-facing notice when pitch can't apply on this path.
      if (pitchNoop) setMsg(t('pitch_noop_google')); else setMsg(t('playing'));
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

  /* Team 3 state/UI fixes — shared constants.
   * No new i18n keys (M39): these bilingual constants are defined ONCE here
   * and reused, so nothing new enters the i18n dictionaries. */
  var MAX_INPUT_CHARS = 5000; // M21/C6: soft cap — ~12 Edge chunks / ~25 Google URLs
  var TEXT_TOO_LONG_ASK = 'This text is {n} characters (~{m} voice requests, several minutes). Generate anyway? / یہ متن {n} حروف پر مشتمل ہے (~{m} وائس درخواستیں، کئی منٹ لگیں گے)۔ پھر بھی بنائیں؟';
  var TEXT_TOO_LONG_ERR = 'Text too long — please keep it under 5000 characters. / متن بہت لمبا ہے — براہ کرم 5000 حروف سے کم رکھیں۔';
  var ROMAN_APPLIED_NOTE = 'Roman Urdu detected — the voiceover uses Urdu script (your text is unchanged). / رومن اردو پہچانی گئی — آواز اردو اسکرپٹ میں بنے گی (آپ کا متن ویسا ہی ہے)۔';
  var PASTE_EMPTY_NOTE = 'Clipboard is empty — nothing pasted. / کلپ بورڈ خالی ہے — کچھ پیسٹ نہیں ہوا۔';
  var MIC_AUTO_STOP_NOTE = 'Recording auto-stopped at the 10-minute limit. / ریکارڈنگ 10 منٹ کی حد پر خود بخود رک گئی۔';

  // M12: 'cancelled' is a clean user stop, never an error.
  function isCancelled(v) {
    var s = String((v && v.message) || v || '').trim().toLowerCase();
    return s === 'cancelled';
  }

  // C7: fraction of the original's Latin words the Roman-Urdu map rewrote.
  // A word counts as "hit" when it no longer occurs verbatim in the converted
  // text — the map only replaces whole words on [^A-Za-z] boundaries, so an
  // untouched word always survives. Ordinary English scores low and passes
  // through; real Roman Urdu scores high.
  function romanUrduCoverage(orig, conv) {
    var oWords = String(orig || '').toLowerCase().match(/[a-z]+/g) || [];
    if (!oWords.length) return 0;
    var c = String(conv || '').toLowerCase();
    var hits = 0, i, w, re;
    for (i = 0; i < oWords.length; i++) {
      w = oWords[i];
      re = new RegExp('(^|[^a-z])' + w + '([^a-z]|$)');
      if (!re.test(c)) hits++;
    }
    return hits / oWords.length;
  }

  function setBusy(busy) {
    ['btnGenerate', 'btnPlay', 'btnGenBig', 'btnListenBig'].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = !!busy;
    });
    // M17: freeze the voice/language controls too, so the in-flight run keeps
    // the voice it started with. Handler guards (voiceSelect/pills/cards)
    // hold for the short message phase after setBusy(false); the auto-detect's
    // own re-derivation is programmatic and unaffected.
    ['voiceSelect', 'voiceSelect2', 'ttsLang'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !!busy;
    });
    // Team 3 M17 (residual): also freeze the browser-voice select and the
    // dialogue-mode checkbox during generation.
    ['browserVoiceSelect'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !!busy;
    });
    var dm = $('dialogueMode');
    if (dm) dm.disabled = !!busy;
    var pills = $('langPills');
    if (pills) {
      var btns = pills.querySelectorAll('button');
      for (var pi = 0; pi < btns.length; pi++) btns[pi].disabled = !!busy;
    }
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
    // M20: emoji/punctuation-only "text" would synthesize silence — require at
    // least one real letter or digit.
    if (!/[\p{L}\p{N}]/u.test(text)) { setMsg(t('enterText'), true); return; }
    // B4: fail fast when offline — the network engines would otherwise sit
    // through long fetch timeouts before failing. The Web Speech device
    // voice genuinely works offline, so it stays allowed.
    if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
      var eng0 = safeGet(function () { return parseVoiceId(state.voiceId).engine; }, '');
      if (eng0 !== 'webspeech' || state.dialogueMode) { setMsg(OFFLINE_MSG, true); return; }
    }
    // Feature 1: Roman Urdu pre-pass.
    // C7: NEVER mutate the textbox — the old code overwrote box.value, which
    // irreversibly destroyed ordinary English text. Transliterate a COPY for
    // synthesis only, and only when the coverage gate says this is really
    // Roman Urdu (ordinary English passes through untouched).
    var synthText = text;
    if (state.romanUrdu && window.TTS && typeof window.TTS._romanToUrdu === 'function') {
      var ruConv = window.TTS._romanToUrdu(text);
      if (romanUrduCoverage(text, ruConv) >= 0.3) {
        synthText = ruConv;
        setMsg(ROMAN_APPLIED_NOTE);
      }
    }
    // M21: soft input cap — 5000 chars is ~12 Edge chunks / ~25 Google URLs.
    // (Dialogue mode skips the confirm: it has its own hard reject below.)
    if (!state.dialogueMode && synthText.length > MAX_INPUT_CHARS) {
      var estChunks = Math.max(1, Math.ceil(synthText.length / 400));
      var go = false;
      try {
        go = window.confirm(
          TEXT_TOO_LONG_ASK.replace('{n}', String(synthText.length))
                           .replace('{m}', String(estChunks)));
      } catch (e) { go = false; }
      if (!go) return;
    }

    // C8: cancel ONLY a stale preview run — never a bare cancel-all that could
    // clobber an in-flight generation started from another path.
    if (state.previewRunId) {
      try {
        if (hasModule('TTS') && typeof window.TTS.cancel === 'function') {
          window.TTS.cancel(state.previewRunId);
        }
      } catch (e) {}
      state.previewRunId = null;
    }
    stopAll({ skipTtsCancel: true });
    state.generating = true; // M17/C8: from here the run owns the voice
    setBusy(true);
    bridgeKeepAwake(true); // wrapper: keep the screen on during generation
    ensureLipSync(); // B7: first Generate that needs lip-sync loads Rhubarb here
    // C4: a fire-and-forget loadVoices() may still be in flight — await it
    // before reading state.voiceId (a stale one resolves without writing).
    if (state.voicesPromise) { try { await state.voicesPromise; } catch (e) {} }
    // Auto-detect the text's script so pasted text always gets the right
    // voice: Urdu text with English selected (or vice versa) switches the
    // language dropdown automatically. Only switches across script families —
    // a manually chosen Latin-script language (French, German…) is untouched.
    try {
      if (window.TTS && typeof window.TTS._guessLang === 'function') {
        var detected = String(window.TTS._guessLang(synthText)).split('-')[0].toLowerCase();
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
          renderLangPills(); // Team 2 Fix: pills follow auto-detect
        }
      }
    } catch (e) {}
    // Chatterbox is human-like but slow (free shared GPU) — set expectations.
    setMsg(state.voiceId && state.voiceId.indexOf('chatterbox:') === 0 ? t('chatterboxWorking') : t('generating'));
    // Dialogue mode: synthesize each speaker's lines with their own voice,
    // merge into one buffer, then run the normal pipeline.
    if (state.dialogueMode) {
      var segs = parseDialogue(synthText);
      // M24: markers present but every speaker empty — honest message.
      if (!segs || !segs.length) { setBusy(false); state.generating = false; bridgeKeepAwake(false); setMsg(t('dialogueNeedMarkers'), true); return; }
      // C6: cap dialogue text — absurd input is rejected, never OOM'd.
      var dlgLen = 0, di;
      for (di = 0; di < segs.length; di++) dlgLen += segs[di].text ? segs[di].text.length : 0;
      if (dlgLen > MAX_INPUT_CHARS) { setBusy(false); state.generating = false; bridgeKeepAwake(false); setMsg(TEXT_TOO_LONG_ERR, true); return; }
      var dout = null;
      try {
        dout = await synthesizeDialogue(segs);
      } catch (e) {
        // C6: a throw here used to skip setBusy(false) and soft-lock the UI.
        dout = { error: String((e && e.message) || e) };
      } finally {
        setBusy(false); // C6: the busy flag is ALWAYS released
      }
      if (!dout || dout.error || !dout.result) {
        var derr = (dout && dout.error) || 'unknown';
        if (isCancelled(derr)) { state.generating = false; bridgeKeepAwake(false); setMsg(t('stopped')); return; } // M12: clean stop
        state.generating = false; bridgeKeepAwake(false);
        setMsg(t('ttsFailed') + ': ' + derr, true);
        return;
      }
      result = dout.result;
    } else {
      // C8: the promise carries its run identity.
      try {
        var genP = window.TTS.synthesize(synthText, state.voiceId);
        state.genRunId = genP && genP.runId;
        result = await genP;
        // Null the run id when THIS run finishes — a newer run's id survives.
        if (genP && state.genRunId === genP.runId) state.genRunId = null;
      } catch (e) {
        result = { error: String((e && e.message) || e) };
      }
      setBusy(false);
    }

    if (!result || result.error) {
      var rerr = (result && result.error) || 'unknown';
      if (isCancelled(rerr)) { state.generating = false; bridgeKeepAwake(false); setMsg(t('stopped')); return; } // M12: clean stop, not "failed: cancelled"
      state.generating = false; bridgeKeepAwake(false);
      setMsg(t('ttsFailed') + ': ' + rerr, true);
      return;
    }

    releaseLastAudio();
    state.lastResult = result;
    // MINOR (Team 2 R7): snapshot whether THIS result was generated in
    // dialogue mode — caption code must use this flag, never the live
    // state.dialogueMode (toggling it off post-generate leaked 1:/2: into SRT).
    try { result.dialogue = !!state.dialogueMode; } catch (e) {}
    // MINOR (Team 3): snapshot the GENERATED text on the result — SRT and
    // burnt-in captions must use this, never the live textbox (the user may
    // edit it after generating).
    try { result.text = synthText; } catch (e) {}
    if (result.url) state.lastUrl = result.url;
    if (result.url) showAudioPlayer(result.url);
    // Honesty: if the selected voice's engine failed and a fallback produced
    // the audio, say so — e.g. all Edge voices collapse to one Google voice.
    try {
      state.lastEngineNote = null;
      if (result.engine && state.voiceId) {
        var wantEngine = parseVoiceId(state.voiceId).engine;
        if (wantEngine && result.engine !== wantEngine && result.engine !== 'dialogue' && result.engine !== 'mic') {
          state.lastEngineNote = t('engineFallback')
            .replace('{want}', wantEngine).replace('{got}', result.engine);
        }
      }
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
    state.generating = false; bridgeKeepAwake(false); // M17/C8: run fully done — voice controls live again
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
    // Round 2 big buttons (Free Voice Over skin) — same handlers.
    var gb = $('btnGenBig'), lb = $('btnListenBig'), pb = $('btnPauseBig'),
        sb = $('btnStopBig'), db = $('btnDlMp3Big');
    if (gb) gb.addEventListener('click', onGenerate);
    if (lb) lb.addEventListener('click', replay);
    if (pb) pb.addEventListener('click', pausePlayback);
    if (sb) sb.addEventListener('click', function () { stopAll(); setMsg(t('stopped')); });
    if (db) db.addEventListener('click', exportMp3);
  }

  // Team 2 Fix Round: pause current playback (all paths) + toggle resume.
  // Pause is now a toggle: paused -> resume from the same position.
  function pausePlayback() {
    // If something is paused already, resume it.
    if (state.pausedKind) { resumePlayback(); return; }
    try {
      if (state.audioEl && !state.audioEl.paused) {
        state.audioEl.pause(); state.pausedKind = 'audioEl'; pauseMusicForPause(); setMsg(t('paused')); return;
      }
    } catch (e) {}
    try {
      if (state.previewEl && !state.previewEl.paused) {
        state.previewEl.pause(); state.pausedKind = 'previewEl'; pauseMusicForPause(); setMsg(t('paused')); return;
      }
    } catch (e) {}
    try {
      if (state.previewCtx && state.previewCtx.state === 'running') {
        state.previewCtx.suspend(); state.pausedKind = 'previewCtx'; pauseMusicForPause(); setMsg(t('paused')); return;
      }
    } catch (e) {}
    try {
      if (state.audioCtx && state.audioCtx.state === 'running') {
        state.audioCtx.suspend(); state.pausedKind = 'audioCtx';
        stopAvatar(); // Team 3 M2: mouth must not keep moving while paused
        pauseMusicForPause(); setMsg(t('paused')); return;
      }
    } catch (e) {}
    try {
      if (window.speechSynthesis && window.speechSynthesis.speaking &&
          !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        // Team 3 M3: freeze the virtual clock so lip-sync/timeline stay
        // aligned — the interval must not keep ticking while paused.
        if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = 0; }
        state.speechPausedAt = performance.now();
        stopAvatar(); // mouth must not keep moving on its wall-clock while paused
        state.pausedKind = 'speech'; pauseMusicForPause(); setMsg(t('paused')); return;
      }
    } catch (e) {}
    try {
      var ap = $('audioPlayer');
      if (ap && !ap.paused) { ap.pause(); stopAvatar(); state.pausedKind = 'audioPlayer'; pauseMusicForPause(); setMsg(t('paused')); return; }
    } catch (e) {}
    setMsg(t('nothing_to_pause'), true);
  }

  // Team 3 M5: pause background music together with the voice; remember
  // whether it was audible so resume can restart it (and only then).
  function pauseMusicForPause() {
    state.musicWasPlaying = false;
    try {
      if (state.musicEl && !state.musicEl.paused) {
        state.musicEl.pause();
        state.musicWasPlaying = true;
      }
    } catch (e) {}
  }
  function restartMusicAfterResume() {
    if (!state.musicWasPlaying) return;
    state.musicWasPlaying = false;
    try {
      if (state.musicEl) {
        var p = state.musicEl.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) {}
  }

  // Team 3 C10: never drop the play()/resume() promise. A rejected resume
  // RESTORES pausedKind (so the user can retry it) and shows playFailed;
  // pausedKind is cleared ONLY on success. Team 3 M2: re-arm the avatar mouth
  // on the <audio> paths — the 'pause' event stopped it and nothing restarts it.
  function resumePlayback() {
    var k = state.pausedKind;
    if (!k) { setMsg(t('nothing_to_pause'), true); return; }
    var done = function () {
      state.pausedKind = null;
      restartMusicAfterResume(); // M5: music back only if it was playing
      setMsg(t('playing'));
    };
    var fail = function () {
      state.pausedKind = k; // keep pause state — resume stays retryable
      setMsg(t('playFailed'), true);
    };
    try {
      if (k === 'audioEl' && state.audioEl) { resumeAudioEl(state.audioEl, done, fail, true); return; }
      if (k === 'previewEl' && state.previewEl) { resumeAudioEl(state.previewEl, done, fail, false); return; }
      if (k === 'previewCtx' && state.previewCtx) { settleResume(state.previewCtx.resume(), done, fail); return; }
      // Team 3 M2: re-arm the avatar mouth on pitched-path resume — the
      // 'pause' stopped it and ctx.resume() alone doesn't restart it.
      if (k === 'audioCtx' && state.audioCtx) {
        settleResume(state.audioCtx.resume(), function () {
          try {
            if (hasModule('Avatar') && typeof window.Avatar.speak === 'function' &&
                state.lastCues && state.lastCues.length && state.pitchedTimeSrc) {
              window.Avatar.speak(scaleCues(state.lastCues, state.speed || 1), state.pitchedTimeSrc);
            }
          } catch (e) {}
          done();
        }, fail);
        return;
      }
      if (k === 'speech' && window.speechSynthesis) {
        window.speechSynthesis.resume();
        restartSpeechClock(); // M3: realign the virtual clock + avatar mouth
        done();
        return;
      }
      if (k === 'audioPlayer') {
        var ap = $('audioPlayer');
        if (ap) { resumeAudioEl(ap, done, fail, true); return; }
      }
    } catch (e) { fail(); return; }
    state.pausedKind = null;
    setMsg(t('nothing_to_pause'), true);
  }

  // C10: settle a play()/resume() promise — pausedKind clears only on success.
  function settleResume(p, done, fail) {
    if (p && typeof p.then === 'function') p.then(done, fail);
    else done();
  }
  // M2: resume an <audio> element; on success re-arm the avatar mouth with
  // the playback path's scaled cues, sampled at the current wall-clock
  // position (media-time / speed — cues live in the wall-clock base).
  function resumeAudioEl(el, done, fail, rearm) {
    settleResume(el.play(), function () {
      if (rearm) rearmAvatarForResume(el);
      done();
    }, fail);
  }
  function rearmAvatarForResume(el) {
    if (!hasModule('Avatar') || typeof window.Avatar.speak !== 'function') return;
    if (!state.lastCues || !state.lastCues.length) return;
    var spd = state.speed || 1;
    var mediaTime = (el && typeof el.currentTime === 'number') ? el.currentTime : 0;
    try {
      window.Avatar.speak(scaleCues(state.lastCues, spd), { currentTime: mediaTime / spd });
    } catch (e) {}
  }
  // M3: the Web Speech virtual clock was frozen on pause — shift its t0
  // forward by the paused gap, restart the tick, and re-arm the avatar mouth
  // from the frozen wall-clock position so lip-sync stays aligned.
  // (Avatar.speak samples the timeSrc once, then advances on wall-clock, so
  // the virtual-clock t0 shift alone would NOT move the mouth back in line.)
  function restartSpeechClock() {
    var sc = state.speechClock;
    if (!sc || !sc.box || !sc.clock) return;
    sc.box.t0 += performance.now() - (state.speechPausedAt || performance.now());
    sc.clock.currentTime = (performance.now() - sc.box.t0) / 1000;
    if (!state.clockTimer) {
      state.clockTimer = setInterval(function () {
        sc.clock.currentTime = (performance.now() - sc.box.t0) / 1000;
      }, 50);
    }
    if (hasModule('Avatar') && typeof window.Avatar.speak === 'function' &&
        state.lastCues && state.lastCues.length) {
      try {
        window.Avatar.speak(scaleCues(state.lastCues, state.speed || 1),
          { currentTime: sc.clock.currentTime });
      } catch (e) {}
    }
  }

  // Round 2: selected-character info box under the Download button.
  // Team 2 Fix: uses state.selChar (the CHARACTER), not voiceId matching —
  // shared base voices (Ahmed/Dastaan Go) no longer show the wrong name.
  function updateSelCharBox() {
    var box = $('selCharBox');
    if (!box) return;
    var c = state.selChar;
    if (c) {
      box.innerHTML = '';
      var b = document.createElement('b'); b.textContent = c.name;
      box.appendChild(b);
      box.appendChild(document.createTextNode(
        // Team 3 M29: translated lang/gender/style in Urdu mode.
        ' selected \u2014 ' + charI18n('char_lang_ur', c.lang) + ' \u2022 ' +
        charI18n('char_gender_ur', c.gender) + ' \u2022 ' + charI18n('char_style_ur', c.style) +
        '. ' + t('selchar_hint')));
    } else {
      box.textContent = t('selchar_none');
    }
  }

  // Round 2: voice-cloning premium (locked UI).
  // B2 (Play Store round): Terms §6 — an explicit consent checkbox before
  // any clone/reference audio may be uploaded. The choice persists in
  // localStorage via TTS.getCloneConsent()/setCloneConsent(), and tts.js
  // refuses the HF Space upload while it is unchecked.
  function cloneConsentOn() {
    try {
      if (window.TTS && typeof window.TTS.getCloneConsent === 'function') {
        return window.TTS.getCloneConsent();
      }
    } catch (e) {}
    return false;
  }
  function initClone() {
    var sb = $('btnCloneSample'), cf = $('cloneFile'), cb = $('btnClonePremium');
    if (sb && cf) sb.addEventListener('click', function () { cf.click(); });
    if (cf) cf.addEventListener('change', function () {
      var n = $('cloneFileName');
      if (n) n.textContent = (cf.files && cf.files[0]) ? cf.files[0].name : t('clone_nofile');
    });
    if (cb) cb.addEventListener('click', function () {
      setMsg(t('clone_locked_msg'), true);
    });
    var cc = $('cloneConsent');
    if (cc) {
      try { cc.checked = cloneConsentOn(); } catch (e) {}
      cc.addEventListener('change', function () {
        try {
          if (window.TTS && typeof window.TTS.setCloneConsent === 'function') {
            window.TTS.setCloneConsent(!!cc.checked);
          }
        } catch (e) {}
      });
    }
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
    // B1: privacy disclosure first — only call getUserMedia after "Allow".
    showMicConsent('record', startRecordingNow);
  }

  function startRecordingNow() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg(t('micUnsupported'), true);
      return;
    }
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
      // M27: hard cap — a forgotten recording stops itself at 10 minutes
      // (recordT0 was tracked but never enforced: a self-DoS).
      if (state.recordTimer) { clearTimeout(state.recordTimer); state.recordTimer = 0; }
      state.recordAutoStopped = false;
      state.recordTimer = setTimeout(function () {
        state.recordTimer = 0;
        if (state.recording) {
          state.recordAutoStopped = true;
          stopRecording(); // -> rec.onstop -> finishRecording reports the cap
        }
      }, 10 * 60 * 1000);
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
    if (state.recordTimer) { clearTimeout(state.recordTimer); state.recordTimer = 0; } // M27
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
    var autoStopped = state.recordAutoStopped; // M27: capture before cleanup clears it
    state.recordAutoStopped = false;
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
    ensureLipSync(); // B7: lip-sync also runs for mic recordings — probe it here
    state.lastCues = audioBuffer ? await getCues(audioBuffer) : [];
    // MINOR (Team 2 R7): refresh the engine badge — a stale fallback warning
    // from a previous generation must not linger after a mic recording.
    state.lastEngineNote = null;
    try { updateEngineBadge(); } catch (e) {}
    // Hand the recording to the Chatterbox engine as a clone reference —
    // but ONLY with consent (Terms §6): without it the blob is cleared so
    // tts.js has nothing to upload, and the user is told how to opt in.
    if (window.TTS && typeof window.TTS.setReferenceAudio === 'function') {
      try {
        if (cloneConsentOn()) {
          window.TTS.setReferenceAudio(blob);
        } else {
          window.TTS.setReferenceAudio(null);
          setMsg(CLONE_CONSENT_NOTE);
        }
      } catch (e) {}
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
    setMsg((autoStopped ? MIC_AUTO_STOP_NOTE + ' ' : '') + t(saved ? 'recordSaved' : 'recordReady'));
    // No auto-play — the user taps Play (same pattern as the Web Speech path).
  }

  /* ---------------- export ---------------- */

  // C1/C2/C11 (Team 3): export honesty — never assume the container.
  // No new i18n keys (M39): local bilingual constants, each defined once.
  var TUNE_EXPORT_NOTE = 'Note: speed/pitch apply at playback only — the exported audio uses the base voice. / نوٹ: اسپیڈ/پچ صرف چلانے پر لگتی ہے — ایکسپورٹ شدہ آڈیو میں اصل آواز ہوگی۔';
  var PITCH_VIDEO_NOTE = 'Note: pitch shift applies at playback only — the exported video uses the base voice pitch (speed is baked into the video). / نوٹ: پچ صرف چلانے پر لگتی ہے — ایکسپورٹ شدہ ویڈیو میں اصل پچ ہوگی (اسپیڈ ویڈیو میں شامل ہے)۔';
  var AUDIO_SAVED_MSG = 'Audio downloaded. / آڈیو ڈاؤن لوڈ ہوگئی۔';

  // MINOR (Team 3): timestamped export filenames — without a timestamp,
  // repeated downloads collide and overwrite each other on mobile.
  function stampedName(base, ext) {
    var d = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    var ts = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
             p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return base + '-' + ts + '.' + ext;
  }

  // C1: the download extension (and the saved message) follows the blob's
  // REAL MIME type — Edge yields audio/mpeg, Chatterbox/dialogue yield
  // audio/wav. Never assume MP3.
  function audioExtForType(mime) {
    var m = String(mime || '').toLowerCase().split(';')[0].trim();
    if (m === 'audio/wav' || m === 'audio/x-wav' || m === 'audio/wave') return 'wav';
    if (m === 'audio/webm') return 'webm';
    if (m === 'audio/mp4' || m === 'audio/m4a' || m === 'audio/x-m4a') return 'm4a';
    return 'mp3'; // audio/mpeg and anything unknown: the historical default name
  }

  // C11: honest notice when the export cannot sound like the tuned playback.
  // Audio exports bake neither speed nor pitch; video exports bake speed
  // (playbackRate on the export element) but never pitch — so the video
  // notice fires on pitch only.
  function withTuneNote(baseMsg, forVideo) {
    var tuned = forVideo ? (state.pitch !== 0)
                         : (state.speed !== 1 || state.pitch !== 0);
    if (!tuned) return baseMsg;
    return baseMsg + ' ' + (forVideo ? PITCH_VIDEO_NOTE : TUNE_EXPORT_NOTE);
  }

  async function exportWav() {
    if (!hasModule('Exporter')) { setMsg(t('exporterMissing'), true); return; }
    var r = state.lastResult;
    if (!r || !r.audioBuffer) { setMsg(t('exportNeedsAudio'), true); return; }
    setMsg(t('working'));
    bridgeKeepAwake(true);
    try {
      var blob = await window.Exporter.encodeWAV(r.audioBuffer);
      window.Exporter.downloadAudio(blob, stampedName('voicesync-voice', 'wav'));
      setMsg(t('wavSaved'));
    } catch (e) {
      setMsg(t('exportFailed') + ': ' + (e && e.message ? e.message : e), true);
    } finally {
      bridgeKeepAwake(false);
    }
  }

  async function exportMp3() {
    if (!hasModule('Exporter')) { setMsg(t('exporterMissing'), true); return; }
    var r = state.lastResult;
    // Mic recordings: the blob is webm/opus, not MP3 — WAV is the honest export.
    if (r && r.engine === 'mic') { setMsg(t('useWavForMic'), true); return; }
    // SPEC §3: synthesize blob is the engine's native container (MP3 for Edge,
    // WAV for Chatterbox/dialogue). C1: the extension follows the blob's real
    // MIME type — never assume MP3 (the old code named WAV bytes ".mp3").
    if (r && r.blob) {
      setMsg(t('working'));
      bridgeKeepAwake(true);
      try {
        var ext = audioExtForType(r.blob.type);
        window.Exporter.downloadAudio(r.blob, stampedName('voicesync-voice', ext));
        setMsg(withTuneNote(ext === 'wav' ? t('wavSaved') : ext === 'mp3' ? t('mp3Saved') : AUDIO_SAVED_MSG));
      } catch (e) {
        setMsg(t('exportFailed') + ': ' + (e && e.message ? e.message : e), true);
      } finally {
        bridgeKeepAwake(false);
      }
      return;
    }
    // Google path: no bytes (CORS) — download straight from the TTS URL (API.md §3).
    if (r && r.engine === 'google' && r.url) {
      downloadUrl(r.url, stampedName('voicesync-voice', 'mp3'));
      setMsg(withTuneNote(t('mp3Saved')));
      return;
    }
    setMsg(t('exportNeedsAudio'), true);
  }

  // Best-effort direct-URL download (used for Google TTS audio, which has no
  // byte access). If the browser plays it instead of downloading, the user
  // can long-press / right-click > Save.
  function downloadUrl(url, filename) {
    filename = filename || stampedName('voicesync-download', 'mp3');
    var bridge = wrapperBridge();
    // B5: in the wrapper, try fetching the bytes so the file lands in the
    // real Downloads folder via the bridge; fall back to the anchor trick.
    if (bridge) {
      try {
        fetch(url).then(function (r) {
          if (!r.ok) throw new Error('fetch ' + r.status);
          return r.blob();
        }).then(function (blob) {
          var fr = new FileReader();
          fr.onload = function () {
            var s = String(fr.result || '');
            var b64 = s.indexOf(',') >= 0 ? s.split(',')[1] : s;
            try {
              bridge.saveFile(b64, filename, blob.type || 'audio/mpeg');
            } catch (e) { anchorUrlDownload(url, filename); }
          };
          fr.onerror = function () { anchorUrlDownload(url, filename); };
          fr.readAsDataURL(blob);
        }).catch(function () { anchorUrlDownload(url, filename); });
        return;
      } catch (e) { /* fall through to anchor */ }
    }
    anchorUrlDownload(url, filename);
  }

  function anchorUrlDownload(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
    bridgeKeepAwake(true); // wrapper: video export can run long
    var cues = state.lastCues || [];
    // Feature 2: 9:16 Shorts — composite canvas (avatar top + captions bottom).
    var fmtSel = $('videoFormat');
    var portrait = fmtSel && fmtSel.value === 'portrait';
    var outCanvas = canvas, captionTimer = null, audioRef = { el: null };
    if (portrait) {
      var box = $('textInput');
      // MINOR (Team 3): prefer the generated-text snapshot (state.lastResult.text)
      // over the live textbox for burnt-in captions too.
      var capText = (r && typeof r.text === 'string' && r.text.trim()) ? r.text.trim()
        : (box ? box.value.trim() : '');
      var capDur = (r.duration || 5) / (state.speed || 1);
      var caps = getCaptionBlocks(capText, capDur, !!(r && r.dialogue));
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
          // Captions: blocks are built on the WALL-CLOCK base (dur/speed),
          // but currentTime advances in media-time at playbackRate=speed —
          // divide by speed so the lookup reads wall-clock time.
          var now = audioRef.el && typeof audioRef.el.currentTime === 'number'
            ? audioRef.el.currentTime / (state.speed || 1) : 0;
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
          // Team 3 C3: scale cue times to the wall-clock base at speed != 1,
          // or the exported video bakes the lip-sync desync into the file.
          try { window.Avatar.speak(scaleCues(cues, state.speed || 1), audioEl); } catch (e) {}
        }
      });
      if (captionTimer) cancelAnimationFrame(captionTimer);
      stopAvatar();
      window.Exporter.downloadAudio(blob, stampedName(portrait ? 'voicesync-shorts-9x16' : 'voicesync-video', 'webm'));
      setMsg(withTuneNote(t('videoSaved'), true)); // C11: pitch is playback-only on video
    } catch (e) {
      if (captionTimer) cancelAnimationFrame(captionTimer);
      stopAvatar();
      setMsg((e && e.message) || t('videoUnsupported'), true);
    } finally {
      bridgeKeepAwake(false);
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

  // B5: bridge-side share — blob -> base64 -> VoiceSyncBridge.shareFile.
  // Resolves true only when the bridge accepted the file.
  function bridgeShareFile(bridge, blob, filename, text) {
    return new Promise(function (resolve) {
      var fr;
      try { fr = new FileReader(); } catch (e) { resolve(false); return; }
      fr.onload = function () {
        var s = String(fr.result || '');
        var b64 = s.indexOf(',') >= 0 ? s.split(',')[1] : s;
        if (!b64) { resolve(false); return; }
        try {
          bridge.shareFile(b64, filename, blob.type || 'application/octet-stream', text || '');
          resolve(true);
        } catch (e) { resolve(false); }
      };
      fr.onerror = function () { resolve(false); };
      try { fr.readAsDataURL(blob); } catch (e) { resolve(false); }
    });
  }

  // Feature 3: one-tap share (WhatsApp etc.) via Web Share API, download fallback.
  async function shareAudio() {
    var r = state.lastResult;
    if (!r || !r.audioBuffer) { setMsg(t('exportNeedsAudio'), true); return; }
    try {
      // C2: share HONEST files — the filename and MIME follow the blob's real
      // type. Mic blobs are webm/opus, which most share targets (WhatsApp)
      // cannot play, so re-encode those to real WAV when the decoded buffer
      // exists; otherwise share the honest .webm name/type.
      var blob = r.blob;
      var wantWav = !blob || r.engine === 'mic' ||
        /^audio\/webm/i.test(String((blob && blob.type) || ''));
      if (wantWav && r.audioBuffer && hasModule('Exporter') && typeof window.Exporter.encodeWAV === 'function') {
        try { blob = await window.Exporter.encodeWAV(r.audioBuffer); }
        catch (e2) { blob = r.blob; } // fall back to the original, honestly named
      }
      if (!blob) { setMsg(t('exportFailed'), true); return; }
      var shExt = audioExtForType(blob.type);
      var shName = stampedName('voicesync-voice', shExt);
      // B5: in the wrapper, hand the file to the native share sheet via the
      // bridge; every bridge failure degrades to the normal browser path.
      var bridge = wrapperBridge();
      if (bridge && typeof bridge.shareFile === 'function') {
        try {
          var shared = await bridgeShareFile(bridge, blob, shName, 'VoiceSync Studio voiceover');
          if (shared) { setMsg(t('shared')); return; }
        } catch (e) { /* fall through to Web Share API below */ }
      }
      var file = new File([blob], shName, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'VoiceSync Studio' });
        setMsg(t('shared'));
      } else {
        // Fallback: just download it.
        window.Exporter.downloadAudio(blob, shName);
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
  // stripMarkers: snapshot from the generating run (result.dialogue) — never
  // the live toggle, which the user may flip after generating.
  function getCaptionBlocks(text, dur, stripMarkers) {
    if (stripMarkers) text = text.replace(/^[ \t]*[12]:[ \t]*/gm, '');
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
    var r = state.lastResult;
    var box = $('textInput');
    var boxText = box ? box.value.trim() : '';
    // MINOR (Team 3): prefer the GENERATED-text snapshot over the live
    // textbox — the user may have edited the box after generating.
    var text = (r && typeof r.text === 'string' && r.text.trim()) ? r.text.trim() : boxText;
    if (!text) { setMsg(t('enterText'), true); return; }
    var dur = (r && r.duration) ? r.duration : Math.max(1, text.length / 14);
    // Match the user's playback speed: at 2x the voice finishes in half the time.
    dur = dur / (state.speed || 1);
    // Strip dialogue markers per the GENERATING run's flag (r.dialogue), not
    // the live toggle; no result yet -> fall back to the live toggle.
    var blocks = getCaptionBlocks(text, dur, r ? !!r.dialogue : state.dialogueMode);
    var out = blocks.map(function (b, i) {
      return (i + 1) + '\n' + fmtSrt(b.start) + ' --> ' + fmtSrt(b.end) + '\n' + wrapSrtLine(b.text) + '\n';
    });
    try {
      var blob = new Blob(['\ufeff' + out.join('\n')], { type: 'text/plain;charset=utf-8' });
      window.Exporter.downloadAudio(blob, stampedName('voicesync-subtitles', 'srt'));
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
      if (valid) { state.ttsLang = p.ttsLang; tl.value = p.ttsLang; renderLangPills(); }
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
    initTextButtons();
    initTtsControls();
    initLangPills();
    initCharVoices();
    initDialogue();
    initPresets();
    initEasyMode();
    initTransport();
    initClone();
    initExport();
    initProject();
    mountAvatar();
    applyI18n();
    initMicModal();
    applyWrapperVisibility();
    // B7: do NOT probe the lip-sync engine at boot — schedule it for idle
    // time instead (it also self-probes on the first Generate below).
    if (typeof window.requestIdleCallback === 'function') {
      try { window.requestIdleCallback(function () { ensureLipSync(); }, { timeout: 10000 }); }
      catch (e) { setTimeout(ensureLipSync, 5000); }
    } else {
      setTimeout(ensureLipSync, 5000);
    }
  }

  // MINOR (Team 3): audio must not survive back-navigation — stop
  // everything when the page is hidden/unloaded.
  window.addEventListener('pagehide', function () { try { stopAll(); } catch (e) {} });

  // B6: stop everything the moment the tab/app goes to background (the
  // wrapper relies on this for audio-focus handling), and expose stopAll
  // to the Android wrapper bridge.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { try { stopAll(); } catch (e) {} }
  });
  window.VoiceSyncApp = {
    stopAll: function (opts) { try { return stopAll(opts); } catch (e) { return undefined; } }
  };

  // B4: clear bilingual online/offline status so the user always knows
  // generation needs internet.
  window.addEventListener('offline', function () {
    try { setMsg(OFFLINE_MSG, true); } catch (e) {}
  });
  window.addEventListener('online', function () {
    try { setMsg(ONLINE_MSG); } catch (e) {}
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
