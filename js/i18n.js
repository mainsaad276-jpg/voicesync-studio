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
      export_title: 'Export',
      btn_wav: 'Download WAV',
      btn_mp3: 'Download MP3',
      btn_export_audio: 'Download Audio',
      btn_export_video: 'Download Video',
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
      export_title: 'ایکسپورٹ',
      btn_wav: 'WAV ڈاؤن لوڈ کریں',
      btn_mp3: 'MP3 ڈاؤن لوڈ کریں',
      btn_export_audio: 'آڈیو ڈاؤن لوڈ کریں',
      btn_export_video: 'ویڈیو ڈاؤن لوڈ کریں',
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
      footer_tech: 'Edge Neural → Google → Web Speech فال بیک'
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
