/* ============================================================
   VoiceSync Studio — i18n (Sana)
   Contract (SPEC §3):
     I18N.strings = { en: {...}, ur: {...} }
     I18N.apply(lang)   // sets every [data-i18n] / [data-i18n-ph] element
   Every visible label in index.html carries data-i18n="key" (text) or
   data-i18n-ph="key" (placeholder). Keys are stable — app.js re-applies
   I18N.apply() after it mutates status text.
   ============================================================ */
(function (global) {
  'use strict';

  var strings = {
    en: {
      app_title: 'VoiceSync Studio',
      app_tagline: 'Free Voiceover + Lip-Sync',
      lang_toggle: 'اردو',
      editor_title: 'Script Editor',
      text_label: 'Your text',
      text_placeholder: 'Type or paste your script here...',
      chars: 'chars',
      language_label: 'Language',
      voice_label: 'Voice',
      voice_loading: 'Loading voices…',
      voice_empty: 'No voices for this language',
      preview_title: 'Preview',
      btn_generate: 'Generate Voice',
      btn_play: 'Play',
      btn_stop: 'Stop',
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
      roman_urdu: 'Roman Urdu',
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
      dialogue_mode: 'Dialogue mode (two voices)',
      dialogue_hint: 'Start lines with 1: for Voice 1 and 2: for Voice 2.',
      dialogueNeedMarkers: 'Dialogue mode: start lines with 1: and 2: to assign voices.',
      dialogueNeedAudio: 'Dialogue mode needs voices with downloadable audio (not the device voice).',
      export_title: 'Export',
      btn_wav: 'Download WAV',
      btn_mp3: 'Download MP3',
      btn_export_audio: 'Download Audio',
      btn_export_video: 'Download Video',
      btn_share: 'Share',
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
      pill_free: 'FREE VOICES',
      pill_noapi: 'NO API KEY',
      pill_mp3: 'MP3 DOWNLOAD',
      pill_langs: '60+ LANGUAGES',
      pill_clone: '★VOICE CLONING — PREMIUM',
      char_title: 'CHARACTER VOICES — کریکٹر آوازیں',
      char_search_ph: 'Search character... Ahmed, Priya, Ivan, Natasha',
      char_preview: 'Preview',
      char_no_match: 'No character matches your search.',
      char_selected: '{name} selected — tap Generate to use this voice.',
      fmt_square: 'Square 1:1',
      fmt_portrait: 'Shorts 9:16 + captions',
      project_title: 'Project',
      btn_save_project: 'Save Project',
      btn_load_project: 'Load Project',
      status_ready: 'Ready — type your text and press Play.',
      status_generating: 'Generating voice…',
      status_analyzing: 'Analyzing lip-sync…',
      status_playing: 'Playing…',
      status_stopped: 'Stopped.',
      status_done: 'Done.',
      status_exporting_audio: 'Exporting audio…',
      status_exporting_video: 'Exporting video…',
      status_error: 'Something went wrong. Please try again.',
      status_no_text: 'Please type some text first.',
      audioLoadFailed: 'Audio failed to load in this browser — the built-in voice will be used instead. Tap Play.',
      readyTapPlay: 'Voice ready — tap Play to hear it.',
      status_no_voice: 'Please pick a voice first.',
      footer_text: '100% free — no API keys, no sign-up.',
      footer_tech: 'Edge Neural → Google → Web Speech fallbacks'
    },
    ur: {
      app_title: 'وائس سنک اسٹوڈیو',
      app_tagline: 'مفت وائس اوور + لپ سنک',
      lang_toggle: 'English',
      editor_title: 'اسکرپٹ ایڈیٹر',
      text_label: 'آپ کا متن',
      text_placeholder: 'اپنا اسکرپٹ یہاں لکھیں یا پیسٹ کریں...',
      chars: 'حروف',
      language_label: 'زبان',
      voice_label: 'آواز',
      voice_loading: 'آوازیں لوڈ ہو رہی ہیں…',
      voice_empty: 'اس زبان کے لیے کوئی آواز نہیں',
      preview_title: 'پریویو',
      btn_generate: 'آواز بنائیں',
      btn_play: 'چلائیں',
      btn_stop: 'روکیں',
      btn_record: 'میری آواز ریکارڈ کریں',
      btn_stop_record: 'ریکارڈنگ بند کریں',
      requestingMic: 'مائیکروفون کی اجازت مانگی جا رہی ہے…',
      recording: 'ریکارڈنگ ہو رہی ہے… روکنے کے لیے دوبارہ دبائیں۔',
      recordReady: 'ریکارڈنگ تیار ہے — سننے کے لیے Play دبائیں۔',
      recordEmpty: 'کوئی آواز ریکارڈ نہیں ہوئی۔',
      micDenied: 'مائیکروفون کی اجازت نہیں ملی۔',
      micUnsupported: 'اس براؤزر میں ریکارڈنگ ممکن نہیں۔',
      useWavForMic: 'اپنی ریکارڈنگ کے لیے WAV ڈاؤن لوڈ استعمال کریں۔',
      chatterboxWorking: 'انسانی آواز بن رہی ہے… (مفت مشترکہ سرور، ایک منٹ لگ سکتا ہے)',
      chatterboxBusy: 'انسانی آواز والا سرور ابھی مصروف ہے — ڈیوائس والی آواز کے لیے Play دبائیں، یا بعد میں دوبارہ کوشش کریں۔',
      recordSaved: 'ریکارڈنگ ڈاؤن لوڈز میں محفوظ ہو گئی — سننے کے لیے Play دبائیں۔',
      btn_dictate: 'آواز سے متن',
      roman_urdu: 'رومن اردو',
      btn_stop_dictate: 'سننا بند کریں',
      listening: 'سن رہا ہے… بولیں۔ روکنے کے لیے دوبارہ دبائیں۔',
      sttUnsupported: 'اس براؤزر میں آواز سے لکھنا ممکن نہیں۔',
      sttError: 'آواز سے لکھنے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔',
      tune_speed: 'رفتار',
      tune_pitch: 'سر',
      btn_music: 'موسیقی',
      musicLoaded: 'موسیقی لگ گئی — آواز کے نیچے ہلکی چلے گی۔',
      btn_srt: 'سب ٹائٹل (SRT)',
      srtSaved: 'سب ٹائٹل ڈاؤن لوڈ ہو گئے۔',
      shared: 'شیئر ہو گیا۔',
      shareFallback: 'یہاں شیئر ممکن نہیں — ڈاؤن لوڈ کر دیا۔',
      dialogue_mode: 'مکالمہ موڈ (دو آوازیں)',
      dialogue_hint: 'پہلی آواز کے لیے 1: اور دوسری کے لیے 2: سے لائن شروع کریں۔',
      dialogueNeedMarkers: 'مکالمہ موڈ: آوازیں بانٹنے کے لیے لائنیں 1: اور 2: سے شروع کریں۔',
      dialogueNeedAudio: 'مکالمہ موڈ کو ڈاؤن لوڈ والی آوازیں چاہئیں (ڈیوائس والی آواز نہیں)۔',
      export_title: 'ایکسپورٹ',
      btn_wav: 'WAV ڈاؤن لوڈ کریں',
      btn_mp3: 'MP3 ڈاؤن لوڈ کریں',
      btn_export_audio: 'آڈیو ڈاؤن لوڈ کریں',
      btn_export_video: 'ویڈیو ڈاؤن لوڈ کریں',
      btn_share: 'شیئر کریں',
      preset_label: 'پری سیٹ',
      preset_none: '— کوئی پری سیٹ نہیں —',
      preset_save: 'محفوظ کریں',
      presetLoaded: 'پری سیٹ لوڈ ہو گیا۔',
      presetSaved: 'پری سیٹ محفوظ ہو گیا۔',
      presetDeleted: 'پری سیٹ حذف ہو گیا۔',
      presetNamePrompt: 'اس پری سیٹ کا نام:',
      easy_mode: 'آسان موڈ',
      easyOn: 'آسان موڈ آن — صرف لکھیں، بنائیں، چلائیں، محفوظ کریں۔',
      easyOff: 'آسان موڈ آف — تمام آپشن نظر آ رہے ہیں۔',
      voice_preview: 'سن کر دیکھیں',
      previewing: 'آواز سنائی جا رہی ہے…',
      engineFallback: 'نوٹ: {want} آواز دستیاب نہیں تھی — {got} سے چلائی گئی (سب آوازیں ایک جیسی لگ سکتی ہیں)۔',
      engineFallbackShort: 'متبادل — آوازیں ایک جیسی لگ سکتی ہیں',
      pill_free: 'مفت آوازیں',
      pill_noapi: 'کوئی API کی نہیں',
      pill_mp3: 'MP3 ڈاؤن لوڈ',
      pill_langs: '60+ زبانیں',
      pill_clone: '★وائس کلوننگ — پریمیم',
      char_title: 'CHARACTER VOICES — کریکٹر آوازیں',
      char_search_ph: 'کریکٹر تلاش کریں... احمد، پریا، ایوان، نتاشا',
      char_preview: 'سن کر دیکھیں',
      char_no_match: 'آپ کی تلاش سے کوئی کریکٹر نہیں ملا۔',
      char_selected: '{name} منتخب — اس آواز کے لیے Generate دبائیں۔',
      fmt_square: 'مربع 1:1',
      fmt_portrait: 'شارٹس 9:16 + کیپشن',
      project_title: 'پروجیکٹ',
      btn_save_project: 'پروجیکٹ محفوظ کریں',
      btn_load_project: 'پروجیکٹ لوڈ کریں',
      status_ready: 'تیار — اپنا متن لکھیں اور Play دبائیں۔',
      status_generating: 'آواز بن رہی ہے…',
      status_analyzing: 'لپ سنک کا تجزیہ ہو رہا ہے…',
      status_playing: 'چل رہا ہے…',
      status_stopped: 'روک دیا گیا۔',
      status_done: 'مکمل ہو گیا۔',
      status_exporting_audio: 'آڈیو ایکسپورٹ ہو رہی ہے…',
      status_exporting_video: 'ویڈیو ایکسپورٹ ہو رہی ہے…',
      status_error: 'کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔',
      status_no_text: 'پہلے کچھ متن لکھیں۔',
      audioLoadFailed: 'اس براؤزر میں آڈیو لوڈ نہیں ہوئی — بلٹ ان آواز استعمال ہوگی۔ Play دبائیں۔',
      readyTapPlay: 'آواز تیار ہے — سننے کے لیے Play دبائیں۔',
      status_no_voice: 'پہلے آواز منتخب کریں۔',
      footer_text: '100٪ مفت — کوئی API کیز نہیں، کوئی سائن اپ نہیں۔',
      footer_tech: 'Edge Neural → Google → Web Speech فال بیک',
      // Team 2 M4: status/runtime keys now fully translated (were English-only via FALLBACK)
      enterText: 'پہلے کچھ متن لکھیں یا پیسٹ کریں۔',
      ttsMissing: 'آواز والا ماڈیول ابھی لوڈ نہیں ہوا۔',
      avatarMissing: 'اوتار ماڈیول لوڈ نہیں ہوا۔',
      exporterMissing: 'ایکسپورٹ ماڈیول ابھی لوڈ نہیں ہوا۔',
      generating: 'آواز بن رہی ہے…',
      working: 'کام ہو رہا ہے…',
      analyzing: 'لپ سنک کا تجزیہ ہو رہا ہے…',
      playing: 'چل رہا ہے…',
      done: 'مکمل ہو گیا۔',
      stopped: 'روک دیا گیا۔',
      ttsFailed: 'آواز بنانے میں ناکامی',
      noAudio: 'آواز کا کوئی آڈیو نہیں ملا۔',
      playFailed: 'براؤزر نے چلانے سے روک دیا۔ دوبارہ Play دبائیں۔',
      nothingToPlay: 'پہلے آواز بنائیں، پھر Play دبائیں۔',
      exportNeedsAudio: 'ابھی ایکسپورٹ کے لیے کچھ نہیں — پہلے آواز بنائیں۔',
      lipsyncLoading: 'لپ سنک انجن لوڈ ہو رہا ہے…',
      wavSaved: 'WAV ڈاؤن لوڈ ہو گئی۔',
      mp3Saved: 'MP3 ڈاؤن لوڈ ہو گئی۔',
      videoSaved: 'ویڈیو ڈاؤن لوڈ ہو گئی۔',
      videoUnsupported: 'اس براؤزر میں ویڈیو ایکسپورٹ ممکن نہیں۔',
      exportFailed: 'ایکسپورٹ ناکام ہوئی',
      voicesLoading: 'آوازیں لوڈ ہو رہی ہیں…',
      noVoices: 'اس زبان کے لیے کوئی آواز نہیں ملی۔',
      projectSaved: 'پروجیکٹ محفوظ ہو گیا۔',
      projectLoaded: 'پروجیکٹ لوڈ ہو گیا۔',
      projectLoadFailed: 'پروجیکٹ فائل پڑھی نہیں جا سکی۔',
      modulesLabel: 'ماڈیولز'
    }
  };

  var current = 'en';

  function apply(lang) {
    if (!strings[lang]) lang = 'en';
    current = lang;

    if (typeof document === 'undefined') return; // node --check / non-DOM envs

    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      if (strings[lang][key] !== undefined) {
        els[i].textContent = strings[lang][key];
      }
    }

    var phs = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) {
      var pkey = phs[j].getAttribute('data-i18n-ph');
      if (strings[lang][pkey] !== undefined) {
        phs[j].setAttribute('placeholder', strings[lang][pkey]);
      }
    }

    var html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
  }

  function t(key) {
    return (strings[current] && strings[current][key] !== undefined)
      ? strings[current][key]
      : (strings.en[key] !== undefined ? strings.en[key] : key);
  }

  global.I18N = {
    strings: strings,
    apply: apply,
    t: t,
    get lang() { return current; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
