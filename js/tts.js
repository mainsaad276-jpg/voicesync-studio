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
    ['bn-BD-NabanitaNeural','Nabanita', 'bn-BD', 'female'],
    ['af-ZA-AdriNeural','Adri','af-ZA','female'],
    ['am-ET-MekdesNeural','Mekdes','am-ET','female'],
    ['ar-DZ-AminaNeural','Amina','ar-DZ','female'],
    ['ar-BH-AliNeural','Ali','ar-BH','male'],
    ['ar-EG-SalmaNeural','Salma','ar-EG','female'],
    ['ar-IQ-RanaNeural','Rana','ar-IQ','female'],
    ['ar-JO-SanaNeural','Sana','ar-JO','female'],
    ['ar-KW-NouraNeural','Noura','ar-KW','female'],
    ['ar-LB-LaylaNeural','Layla','ar-LB','female'],
    ['ar-LY-ImanNeural','Iman','ar-LY','male'],
    ['ar-MA-JamalNeural','Jamal','ar-MA','male'],
    ['ar-OM-AyshaNeural','Aysha','ar-OM','female'],
    ['ar-QA-AmalNeural','Amal','ar-QA','female'],
    ['ar-SY-AmanyNeural','Amany','ar-SY','female'],
    ['ar-TN-ReemNeural','Reem','ar-TN','female'],
    ['ar-AE-FatimaNeural','Fatima','ar-AE','female'],
    ['ar-YE-MaryamNeural','Maryam','ar-YE','female'],
    ['az-AZ-BabekNeural','Babek','az-AZ','male'],
    ['bg-BG-BorislavNeural','Borislav','bg-BG','male'],
    ['bn-IN-TanishaaNeural','Tanishaa','bn-IN','female'],
    ['bs-BA-GoranNeural','Goran','bs-BA','male'],
    ['ca-ES-JoanaNeural','Joana','ca-ES','female'],
    ['cs-CZ-AntoninNeural','Antonin','cs-CZ','male'],
    ['cy-GB-AledNeural','Aled','cy-GB','male'],
    ['da-DK-ChristelNeural','Christel','da-DK','female'],
    ['de-AT-JonasNeural','Jonas','de-AT','male'],
    ['de-CH-JanNeural','Jan','de-CH','male'],
    ['el-GR-NestorasNeural','Nestoras','el-GR','male'],
    ['en-AU-NatashaNeural','Natasha','en-AU','female'],
    ['en-CA-ClaraNeural','Clara','en-CA','female'],
    ['en-HK-YanNeural','Yan','en-HK','female'],
    ['en-IE-ConnorNeural','Connor','en-IE','male'],
    ['en-IN-NeerjaNeural','Neerja','en-IN','female'],
    ['en-KE-AsiliaNeural','Asilia','en-KE','female'],
    ['en-NG-AbeoNeural','Abeo','en-NG','male'],
    ['en-NZ-MollyNeural','Molly','en-NZ','female'],
    ['en-PH-RosaNeural','Rosa','en-PH','female'],
    ['en-SG-LunaNeural','Luna','en-SG','female'],
    ['en-TZ-ImaniNeural','Imani','en-TZ','female'],
    ['en-ZA-LeahNeural','Leah','en-ZA','female'],
    ['es-AR-ElenaNeural','Elena','es-AR','female'],
    ['es-BO-SofiaNeural','Sofia','es-BO','female'],
    ['es-CL-CatalinaNeural','Catalina','es-CL','female'],
    ['es-CO-SalomeNeural','Salome','es-CO','female'],
    ['es-CR-JuanNeural','Juan','es-CR','male'],
    ['es-CU-BelkysNeural','Belkys','es-CU','female'],
    ['es-DO-RamonaNeural','Ramona','es-DO','female'],
    ['es-EC-AndreaNeural','Andrea','es-EC','female'],
    ['es-GQ-JavierNeural','Javier','es-GQ','male'],
    ['es-GT-AndresNeural','Andres','es-GT','male'],
    ['es-HN-CarlosNeural','Carlos','es-HN','male'],
    ['es-MX-DaliaNeural','Dalia','es-MX','female'],
    ['es-NI-FedericoNeural','Federico','es-NI','male'],
    ['es-PA-MargaritaNeural','Margarita','es-PA','female'],
    ['es-PE-CamilaNeural','Camila','es-PE','female'],
    ['es-PR-KarinaNeural','Karina','es-PR','female'],
    ['es-PY-TaniaNeural','Tania','es-PY','female'],
    ['es-SV-LorenaNeural','Lorena','es-SV','female'],
    ['es-US-PalomaNeural','Paloma','es-US','female'],
    ['es-UY-MateoNeural','Mateo','es-UY','male'],
    ['es-VE-PaolaNeural','Paola','es-VE','female'],
    ['et-EE-AnuNeural','Anu','et-EE','female'],
    ['eu-ES-AinhoaNeural','Ainhoa','eu-ES','female'],
    ['fi-FI-NooraNeural','Noora','fi-FI','female'],
    ['fil-PH-AngeloNeural','Angelo','fil-PH','male'],
    ['fr-BE-CharlineNeural','Charline','fr-BE','female'],
    ['fr-CA-SylvieNeural','Sylvie','fr-CA','female'],
    ['fr-CH-ArianeNeural','Ariane','fr-CH','female'],
    ['ga-IE-ColmNeural','Colm','ga-IE','male'],
    ['gl-ES-RoiNeural','Roi','gl-ES','male'],
    ['gu-IN-DhwaniNeural','Dhwani','gu-IN','female'],
    ['he-IL-AvriNeural','Avri','he-IL','female'],
    ['hr-HR-GabrijelaNeural','Gabrijela','hr-HR','female'],
    ['hu-HU-NoemiNeural','Noemi','hu-HU','female'],
    ['hy-AM-AnahitNeural','Anahit','hy-AM','female'],
    ['is-IS-GudrunNeural','Gudrun','is-IS','female'],
    ['it-IT-ElsaNeural','Elsa','it-IT','female'],
    ['ja-JP-NanamiNeural','Nanami','ja-JP','female'],
    ['jv-ID-SitiNeural','Siti','jv-ID','female'],
    ['ka-GE-EkaNeural','Eka','ka-GE','female'],
    ['kk-KZ-AigulNeural','Aigul','kk-KZ','female'],
    ['km-KH-PisethNeural','Piseth','km-KH','male'],
    ['kn-IN-SapnaNeural','Sapna','kn-IN','female'],
    ['ko-KR-SunHiNeural','Sun-Hi','ko-KR','female'],
    ['lo-LA-ChanthavongNeural','Chanthavong','lo-LA','male'],
    ['lt-LT-OnaNeural','Ona','lt-LT','female'],
    ['lv-LV-EveritaNeural','Everita','lv-LV','female'],
    ['mk-MK-AleksandarNeural','Aleksandar','mk-MK','male'],
    ['ml-IN-SobhanaNeural','Sobhana','ml-IN','female'],
    ['mn-MN-YesuiNeural','Yesui','mn-MN','female'],
    ['mr-IN-AarohiNeural','Aarohi','mr-IN','female'],
    ['mt-MT-GraceNeural','Grace','mt-MT','female'],
    ['my-MM-NilarNeural','Nilar','my-MM','female'],
    ['nb-NO-PernilleNeural','Pernille','nb-NO','female'],
    ['ne-NP-HemkalaNeural','Hemkala','ne-NP','female'],
    ['nl-BE-DenaNeural','Dena','nl-BE','female'],
    ['nl-NL-FennaNeural','Fenna','nl-NL','female'],
    ['pa-IN-VaaniNeural','Vaani','pa-IN','female'],
    ['pl-PL-AgnieszkaNeural','Agnieszka','pl-PL','female'],
    ['ps-AF-LatifaNeural','Latifa','ps-AF','female'],
    ['pt-BR-FranciscaNeural','Francisca','pt-BR','female'],
    ['pt-PT-RaquelNeural','Raquel','pt-PT','female'],
    ['ro-RO-AlinaNeural','Alina','ro-RO','female'],
    ['si-LK-ThiliniNeural','Thilini','si-LK','female'],
    ['sk-SK-ViktoriaNeural','Viktoria','sk-SK','female'],
    ['sl-SI-PetraNeural','Petra','sl-SI','female'],
    ['so-SO-MuuseNeural','Muuse','so-SO','male'],
    ['sq-AL-AnilaNeural','Anila','sq-AL','female'],
    ['sr-RS-SophieNeural','Sophie','sr-RS','female'],
    ['su-ID-JajangNeural','Jajang','su-ID','male'],
    ['sv-SE-SofieNeural','Sofie','sv-SE','female'],
    ['sw-KE-RafikiNeural','Rafiki','sw-KE','male'],
    ['sw-TZ-RehemaNeural','Rehema','sw-TZ','female'],
    ['ta-IN-PallaviNeural','Pallavi','ta-IN','female'],
    ['ta-LK-KumarNeural','Kumar','ta-LK','male'],
    ['ta-MY-KaniNeural','Kani','ta-MY','female'],
    ['ta-SG-AnbuNeural','Anbu','ta-SG','male'],
    ['te-IN-ShrutiNeural','Shruti','te-IN','female'],
    ['th-TH-PremwadeeNeural','Premwadee','th-TH','female'],
    ['uk-UA-PolinaNeural','Polina','uk-UA','female'],
    ['uz-UZ-MadinaNeural','Madina','uz-UZ','female'],
    ['vi-VN-HoaiMyNeural','Hoai My','vi-VN','female'],
    ['zh-CN-XiaoxiaoNeural','Xiaoxiao','zh-CN','female'],
    ['zh-HK-HiuGaaiNeural','HiuGaai','zh-HK','female'],
    ['zh-TW-HsiaoChenNeural','HsiaoChen','zh-TW','female'],
    ['zu-ZA-ThandoNeural','Thando','zu-ZA','female']
  ];

  var LANG_LABEL = {
    'ur-PK': 'Urdu (Pakistan)', 'ur-IN': 'Urdu (India)',
    'hi-IN': 'Hindi (India)',
    'en-US': 'English (US)', 'en-GB': 'English (UK)',
    'ar-SA': 'Arabic (Saudi)', 'es-ES': 'Spanish (Spain)',
    'fr-FR': 'French (France)', 'de-DE': 'German (Germany)',
    'ru-RU': 'Russian (Russia)', 'tr-TR': 'Turkish (Turkey)',
    'id-ID': 'Indonesian', 'ms-MY': 'Malay (Malaysia)',
    'fa-IR': 'Persian (Iran)', 'bn-BD': 'Bengali (Bangladesh)',
    'af-ZA': 'Afrikaans (South Africa)', 'am-ET': 'Amharic (Ethiopia)',
    'ar-DZ': 'Arabic (Algeria)', 'ar-BH': 'Arabic (Bahrain)', 'ar-EG': 'Arabic (Egypt)',
    'ar-IQ': 'Arabic (Iraq)', 'ar-JO': 'Arabic (Jordan)', 'ar-KW': 'Arabic (Kuwait)',
    'ar-LB': 'Arabic (Lebanon)', 'ar-LY': 'Arabic (Libya)', 'ar-MA': 'Arabic (Morocco)',
    'ar-OM': 'Arabic (Oman)', 'ar-QA': 'Arabic (Qatar)', 'ar-SY': 'Arabic (Syria)',
    'ar-TN': 'Arabic (Tunisia)', 'ar-AE': 'Arabic (UAE)', 'ar-YE': 'Arabic (Yemen)',
    'az-AZ': 'Azerbaijani', 'bg-BG': 'Bulgarian', 'bn-IN': 'Bengali (India)',
    'bs-BA': 'Bosnian', 'ca-ES': 'Catalan', 'cs-CZ': 'Czech', 'cy-GB': 'Welsh',
    'da-DK': 'Danish', 'de-AT': 'German (Austria)', 'de-CH': 'German (Switzerland)',
    'el-GR': 'Greek', 'en-AU': 'English (Australia)', 'en-CA': 'English (Canada)',
    'en-HK': 'English (Hong Kong)', 'en-IE': 'English (Ireland)', 'en-IN': 'English (India)',
    'en-KE': 'English (Kenya)', 'en-NG': 'English (Nigeria)', 'en-NZ': 'English (New Zealand)',
    'en-PH': 'English (Philippines)', 'en-SG': 'English (Singapore)', 'en-TZ': 'English (Tanzania)',
    'en-ZA': 'English (South Africa)',
    'es-AR': 'Spanish (Argentina)', 'es-BO': 'Spanish (Bolivia)', 'es-CL': 'Spanish (Chile)',
    'es-CO': 'Spanish (Colombia)', 'es-CR': 'Spanish (Costa Rica)', 'es-CU': 'Spanish (Cuba)',
    'es-DO': 'Spanish (Dominican Rep.)', 'es-EC': 'Spanish (Ecuador)', 'es-GQ': 'Spanish (Eq. Guinea)',
    'es-GT': 'Spanish (Guatemala)', 'es-HN': 'Spanish (Honduras)', 'es-MX': 'Spanish (Mexico)',
    'es-NI': 'Spanish (Nicaragua)', 'es-PA': 'Spanish (Panama)', 'es-PE': 'Spanish (Peru)',
    'es-PR': 'Spanish (Puerto Rico)', 'es-PY': 'Spanish (Paraguay)', 'es-SV': 'Spanish (El Salvador)',
    'es-US': 'Spanish (US)', 'es-UY': 'Spanish (Uruguay)', 'es-VE': 'Spanish (Venezuela)',
    'et-EE': 'Estonian', 'eu-ES': 'Basque', 'fi-FI': 'Finnish', 'fil-PH': 'Filipino',
    'fr-BE': 'French (Belgium)', 'fr-CA': 'French (Canada)', 'fr-CH': 'French (Switzerland)',
    'ga-IE': 'Irish', 'gl-ES': 'Galician', 'gu-IN': 'Gujarati', 'he-IL': 'Hebrew',
    'hr-HR': 'Croatian', 'hu-HU': 'Hungarian', 'hy-AM': 'Armenian', 'is-IS': 'Icelandic',
    'it-IT': 'Italian', 'ja-JP': 'Japanese', 'jv-ID': 'Javanese', 'ka-GE': 'Georgian',
    'kk-KZ': 'Kazakh', 'km-KH': 'Khmer', 'kn-IN': 'Kannada', 'ko-KR': 'Korean',
    'lo-LA': 'Lao', 'lt-LT': 'Lithuanian', 'lv-LV': 'Latvian', 'mk-MK': 'Macedonian',
    'ml-IN': 'Malayalam', 'mn-MN': 'Mongolian', 'mr-IN': 'Marathi', 'mt-MT': 'Maltese',
    'my-MM': 'Burmese', 'nb-NO': 'Norwegian', 'ne-NP': 'Nepali', 'nl-BE': 'Dutch (Belgium)',
    'nl-NL': 'Dutch', 'pa-IN': 'Punjabi', 'pl-PL': 'Polish', 'ps-AF': 'Pashto',
    'pt-BR': 'Portuguese (Brazil)', 'pt-PT': 'Portuguese (Portugal)', 'ro-RO': 'Romanian',
    'si-LK': 'Sinhala', 'sk-SK': 'Slovak', 'sl-SI': 'Slovenian', 'so-SO': 'Somali',
    'sq-AL': 'Albanian', 'sr-RS': 'Serbian', 'su-ID': 'Sundanese', 'sv-SE': 'Swedish',
    'sw-KE': 'Swahili (Kenya)', 'sw-TZ': 'Swahili (Tanzania)', 'ta-IN': 'Tamil (India)',
    'ta-LK': 'Tamil (Sri Lanka)', 'ta-MY': 'Tamil (Malaysia)', 'ta-SG': 'Tamil (Singapore)',
    'te-IN': 'Telugu', 'th-TH': 'Thai', 'uk-UA': 'Ukrainian', 'uz-UZ': 'Uzbek',
    'vi-VN': 'Vietnamese', 'zh-CN': 'Chinese (Mandarin)', 'zh-HK': 'Chinese (Hong Kong)',
    'zh-TW': 'Chinese (Taiwan)', 'zu-ZA': 'Zulu'
  };

  // Languages the Google fallback can speak (tl= code). Proven live 2026-10-08.
  var GOOGLE_LANGS = ['ur', 'hi', 'en', 'ar', 'es', 'fr', 'de', 'ru', 'tr', 'id', 'ms', 'fa', 'bn',
    'af', 'sq', 'am', 'az', 'eu', 'bg', 'bs', 'ca', 'cs', 'cy', 'da', 'el', 'et', 'fi', 'fil',
    'ga', 'gl', 'gu', 'he', 'hr', 'hu', 'hy', 'is', 'it', 'ja', 'jv', 'ka', 'kk', 'km', 'kn',
    'ko', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'mt', 'my', 'nb', 'ne', 'nl', 'pa', 'pl',
    'ps', 'pt', 'ro', 'si', 'sk', 'sl', 'so', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'th', 'uk',
    'uz', 'vi', 'zu', 'tl', 'ceb', 'ht', 'hmn', 'ig', 'ku', 'ky', 'la', 'lb', 'mg', 'mi',
    'sm', 'st', 'sn', 'sd', 'tg', 'xh', 'yi', 'yo', 'eo', 'haw', 'jw']; // jw = Javanese alt code

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
    var t = String(text || '');
    // Urdu-specific letters (ٹ ڈ ڑ ے ھ ں) never appear in Arabic: strong Urdu signal.
    if (/[ٹڈڑےھں]/.test(t)) return 'ur-PK';
    // Arabic signals (Team 2 M12): teh marbuta (ة), hamza carriers (أ إ ؤ ئ),
    // and Arabic diacritics — Urdu rarely uses these.
    if (/[ةأإؤئً-ٟ]/.test(t)) return 'ar-SA';
    // Otherwise go by script dominance: a Hindi sentence with one Urdu
    // punctuation mark (؟) must still read as Hindi, and English with a
    // stray ؟ must still read as English.
    var arabic = (t.match(/[\u0600-\u06FF]/g) || []).length;
    var deva = (t.match(/[\u0900-\u097F]/g) || []).length;
    var latin = (t.match(/[A-Za-z]/g) || []).length;
    if (deva > arabic && deva >= latin && deva > 0) return 'hi-IN'; // Devanagari: Hindi
    if (arabic > deva && arabic >= latin && arabic > 0) return 'ur-PK'; // user's default
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
      out.push({ id: 'google:' + l + ':female', name: 'Google ' + _langLabel(l) + ' — Female (fallback)', lang: l, gender: 'female', engine: 'google' });
      out.push({ id: 'google:' + l + ':male',   name: 'Google ' + _langLabel(l) + ' — Male (fallback)', lang: l, gender: 'male',   engine: 'google' });
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
    // Chatterbox human-like voice (beta) — keyless, free, via public HF Space.
    // Team 2 M5: be honest — Chatterbox has no Urdu model (maps ur->hi).
    (function () {
      var bl = lang ? _baseLang(lang) : null;
      if (!bl || CHATTERBOX_LANGS.indexOf(bl) !== -1 || bl === 'ur') {
        out.push({
          id: 'chatterbox:default',
          name: bl === 'ur' ? 'Chatterbox Human-Like (beta) — اردو نہیں، ہندی آواز' : 'Chatterbox Human-Like (beta)',
          lang: bl || 'en',
          gender: '',
          engine: 'chatterbox'
        });
      }
    })();
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
  // chunk and stitch the PCM into one AudioBuffer. Has its own timeout so a
  // hung decodeAudioData can never freeze the whole chain (UI stuck on
  // "Generating voice…" forever — the exact bug users reported).
  var DECODE_TIMEOUT_MS = 15000;
  function _decodeMp3(u8, chunkU8List) {
    var ctx = _getAudioContext();
    if (!ctx) return Promise.resolve(null);
    function withTimeout(p) {
      return new Promise(function (resolve) {
        var done = false;
        var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, DECODE_TIMEOUT_MS);
        p.then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
               function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      });
    }
    return withTimeout(_decodeOne(ctx, u8)).then(function (buf) {
      if (buf) return buf;
      var jobs = (chunkU8List || [u8]).map(function (c) {
        return withTimeout(_decodeOne(ctx, c));
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

  // Safety net: synthesize() must NEVER hang forever. If the whole chain
  // (all engines + fallbacks) takes longer than this, give up with a clear
  // error so the UI can re-enable the buttons and tell the user.
  var SYNTHESIZE_TIMEOUT_MS = 90000;
  var _synthesizeInner = synthesize;
  synthesize = function (text, voiceId) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          try { cancel(); } catch (e) {} // abort in-flight WebSocket/fetch
          resolve({ error: 'Timed out after 90s — check your internet connection and try again.' });
        }
      }, SYNTHESIZE_TIMEOUT_MS);
      _synthesizeInner(text, voiceId).then(function (r) {
        if (!done) { done = true; clearTimeout(timer); resolve(r); }
      }, function (err) {
        if (!done) { done = true; clearTimeout(timer); resolve({ error: String((err && err.message) || err) }); }
      });
    });
  };

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

    if (engine === 'chatterbox') {
      var cblang = voice && voice.lang ? voice.lang : _guessLang(text);
      return _chatterboxSynthesize(text, cblang);
    }

    return Promise.reject(new Error('unknown engine: ' + engine));
  }

  /* ------------------------------------------------------------------ */
  /* Engine 4: Chatterbox (ResembleAI) — human-like + zero-shot cloning  */
  /* Free public Hugging Face Space, keyless, via @gradio/client (beta). */
  /* ------------------------------------------------------------------ */
  var CHATTERBOX_SPACE = 'ResembleAI/Chatterbox-Multilingual-TTS';
  var CHATTERBOX_ORIGIN = 'https://resembleai-chatterbox-multilingual-tts.hf.space';
  var CHATTERBOX_LANGS = ['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
    'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh'];
  var CHATTERBOX_CHUNK = 250;
  var CHATTERBOX_TIMEOUT_MS = 120000;
  var _chatterboxClient = null;
  var _chatterboxRefBlob = null; // optional clone reference (app.js sets it after mic recording)

  function setReferenceAudio(blob) { _chatterboxRefBlob = blob || null; }

  function _chatterboxLang(lang) {
    var base = _baseLang(lang || 'en');
    if (CHATTERBOX_LANGS.indexOf(base) !== -1) return base;
    if (base === 'ur') return 'hi'; // closest supported language
    return 'en';
  }

  function _gradioClientCtor() {
    if (typeof window === 'undefined') return null;
    var g = window.gradioClient || null;
    return (g && g.Client) ? g.Client : null;
  }

  function _chatterboxConnect() {
    var Client = _gradioClientCtor();
    if (!Client) return Promise.reject(new Error('Chatterbox library not loaded'));
    if (_chatterboxClient) return Promise.resolve(_chatterboxClient);
    return Client.connect(CHATTERBOX_SPACE).then(function (c) {
      _chatterboxClient = c;
      return c;
    });
  }

  function _withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(label + ' timed out')); }, ms);
      })
    ]);
  }

  function _chatterboxChunk(client, clang, chunk, refPath) {
    var payload = {
      text_input: chunk,
      language_id: clang,
      audio_prompt_path_input: refPath || null,
      exaggeration_input: 0.5,
      temperature_input: 0.8,
      seed_num_input: 0,
      cfgw_input: 0.5
    };
    return _withTimeout(client.predict('/generate_tts_audio', payload), CHATTERBOX_TIMEOUT_MS, 'Chatterbox')
      .then(function (res) {
        var f = res && res.data && res.data[0];
        var url = f && (f.url || f.path);
        if (!url) throw new Error('Chatterbox returned no audio');
        if (url.charAt(0) === '/') url = CHATTERBOX_ORIGIN + url;
        return _withTimeout(fetch(url).then(function (r) {
          if (!r.ok) throw new Error('Chatterbox audio fetch failed: ' + r.status);
          return r.arrayBuffer();
        }), 60000, 'Chatterbox audio download');
      });
  }

  function _resampleLinear(data, fromRate, toRate) {
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

  function _encodeWavBytes(float32, sampleRate) {
    var n = float32.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    for (var i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, float32[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    function wstr(off, s) { for (var j = 0; j < s.length; j++) v.setUint8(off + j, s.charCodeAt(j)); }
    wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    wstr(36, 'data'); v.setUint32(40, n * 2, true);
    return new Uint8Array(buf);
  }

  function _chatterboxSynthesize(text, lang) {
    var clang = _chatterboxLang(lang);
    var chunks = _chunkText(text, CHATTERBOX_CHUNK);
    if (!chunks.length) return Promise.reject(new Error('Empty text'));
    return _chatterboxConnect().then(function (client) {
      var seq = Promise.resolve();
      var refPath = null;
      if (_chatterboxRefBlob) {
        seq = seq.then(function () {
          return _withTimeout(client.upload([_chatterboxRefBlob]), 60000, 'Reference upload')
            .then(function (paths) { refPath = paths && paths[0]; })
            .catch(function () { refPath = null; }); // cloning optional; default voice otherwise
        });
      }
      var bufs = [];
      chunks.forEach(function (ch) {
        seq = seq.then(function () {
          if (_cancelled) throw new Error('cancelled');
          return _chatterboxChunk(client, clang, ch, refPath).then(function (ab) { bufs.push(ab); });
        });
      });
      return seq.then(function () {
        var ctx = _getAudioContext();
        if (!ctx) throw new Error('AudioContext unavailable');
        return Promise.all(bufs.map(function (ab) {
          return _decodeOne(ctx, new Uint8Array(ab)).catch(function () { return null; });
        })).then(function (decoded) {
          var good = decoded.filter(function (b) { return b; });
          if (!good.length) throw new Error('Chatterbox audio undecodable');
          var rate = good[0].sampleRate, total = 0, i, parts = [];
          for (i = 0; i < good.length; i++) {
            var d = good[i].getChannelData(0);
            if (good[i].sampleRate !== rate) d = _resampleLinear(d, good[i].sampleRate, rate);
            parts.push(d); total += d.length;
          }
          var out = new Float32Array(total), off = 0;
          for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
          return _finishMp3Result(_encodeWavBytes(out, rate), [], text, 'chatterbox');
        });
      });
    });
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
  /* Roman Urdu -> Urdu script pre-pass (Team 2 wish #1)                  */
  /* Pakistanis type Urdu in Roman letters; without this, auto-detect    */
  /* sees Latin and an English voice mangles it. Word-boundary rules,    */
  /* longest-match first. Best-effort: unknown words pass through.       */
  /* ------------------------------------------------------------------ */
  var ROMAN_URDU_MAP = [
    ['assalam o alaikum', 'السلام علیکم'], ['assalamoalaikum', 'السلام علیکم'],
    ['wa alaikum assalam', 'وعلیکم السلام'], ['walaikum assalam', 'وعلیکم السلام'],
    ['khuda hafiz', 'خدا حافظ'], ['allah hafiz', 'اللہ حافظ'],
    ['shukriya', 'شکریہ'], ['meherbani', 'مہربانی'], ['bohat', 'بہت'], ['bahut', 'بہت'],
    ['kya', 'کیا'], ['kyun', 'کیوں'], ['kyon', 'کیوں'], ['kaise', 'کیسے'], ['kese', 'کیسے'],
    ['kahan', 'کہاں'], ['kidhar', 'کدھر'], ['kab', 'کب'], ['kaun', 'کون'], ['kon', 'کون'],
    ['main', 'میں'], ['mein', 'میں'], ['tum', 'تم'], ['tu', 'تو'], ['aap', 'آپ'],
    ['hum', 'ہم'], ['ham', 'ہم'], ['yeh', 'یہ'], ['ye', 'یہ'], ['woh', 'وہ'], ['wo', 'وہ'],
    ['hai', 'ہے'], ['hain', 'ہیں'], ['hun', 'ہوں'], ['hoon', 'ہوں'], ['tha', 'تھا'],
    ['thi', 'تھی'], ['the', 'تھے'], ['hoga', 'ہوگا'], ['hogi', 'ہوگی'], ['honge', 'ہوں گے'],
    ['nahi', 'نہیں'], ['nahin', 'نہیں'], ['na', 'نہ'], ['mat', 'مت'],
    ['aur', 'اور'], ['ya', 'یا'], ['lekin', 'لیکن'], ['magar', 'مگر'], ['kyunki', 'کیونکہ'],
    ['ke', 'کے'], ['ki', 'کی'], ['ka', 'کا'], ['ko', 'کو'], ['se', 'سے'], ['me', 'میں'],
    ['par', 'پر'], ['per', 'پر'], ['tak', 'تک'], ['sath', 'ساتھ'], ['saath', 'ساتھ'],
    ['ghar', 'گھر'], ['bahar', 'باہر'], ['andar', 'اندر'], ['upar', 'اوپر'], ['neeche', 'نیچے'],
    ['aaj', 'آج'], ['kal', 'کل'], ['ab', 'اب'], ['abhi', 'ابھی'], ['phir', 'پھر'],
    ['pehle', 'پہلے'], ['baad', 'بعد'], ['roz', 'روز'], ['din', 'دن'], ['raat', 'رات'],
    ['subah', 'صبح'], ['shaam', 'شام'], ['dopahar', 'دوپہر'],
    ['acha', 'اچھا'], ['achha', 'اچھا'], ['achi', 'اچھی'], ['bura', 'برا'], ['buri', 'بری'],
    ['bara', 'بڑا'], ['bari', 'بڑی'], ['chota', 'چھوٹا'], ['choti', 'چھوٹی'],
    ['naya', 'نیا'], ['nayi', 'نئی'], ['purana', 'پرانا'], ['purani', 'پرانی'],
    ['khushi', 'خوشی'], ['gham', 'غم'], ['pyar', 'پیار'], ['mohabbat', 'محبت'],
    ['dost', 'دوست'], ['dosti', 'دوستی'], ['dushman', 'دشمن'],
    ['maa', 'ماں'], ['baap', 'باپ'], ['abba', 'ابا'], ['ammi', 'امی'],
    ['bhai', 'بھائی'], ['behen', 'بہن'], ['beta', 'بیٹا'], ['beti', 'بیٹی'],
    ['bacha', 'بچہ'], ['bachay', 'بچے'], ['bache', 'بچے'],
    ['pani', 'پانی'], ['khana', 'کھانا'], ['roti', 'روٹی'], ['chai', 'چائے'],
    ['kitab', 'کتاب'], ['kitaab', 'کتاب'], ['qalam', 'قلم'], ['kalam', 'قلم'],
    ['school', 'اسکول'], ['madrasa', 'مدرسہ'], ['ustad', 'استاد'],
    ['kaam', 'کام'], ['kam', 'کام'], ['naukri', 'نوکری'], ['paisa', 'پیسہ'], ['paisay', 'پیسے'],
    ['waqt', 'وقت'], ['zindagi', 'زندگی'], ['duniya', 'دنیا'], ['aakhirat', 'آخرت'],
    ['sach', 'سچ'], ['jhoot', 'جھوٹ'], ['sahi', 'صحیح'], ['ghalat', 'غلط'],
    ['haal', 'حال'], ['haalat', 'حالت'], ['khair', 'خیر'], ['aman', 'امن'],
    ['ja', 'جا'], ['jaa', 'جا'],
    ['madad', 'مدد'], ['sawal', 'سوال'], ['jawab', 'جواب'], ['baat', 'بات'], ['batain', 'باتیں'],
    ['sun', 'سن'], ['suno', 'سنو'], ['dekho', 'دیکھو'], ['dekha', 'دیکھا'],
    ['jana', 'جانا'], ['jao', 'جاؤ'], ['aana', 'آنا'], ['aao', 'آؤ'], ['chal', 'چل'], ['chalo', 'چلو'],
    ['kar', 'کر'], ['karo', 'کرو'], ['kiya', 'کیا'], ['kiye', 'کیے'], ['hota', 'ہوتا'],
    ['milna', 'ملنا'], ['mila', 'ملا'], ['dena', 'دینا'], ['diya', 'دیا'], ['lena', 'لینا'], ['liya', 'لیا'],
    ['rehna', 'رہنا'], ['raha', 'رہا'], ['rahi', 'رہی'], ['rahe', 'رہے'],
    ['sab', 'سب'], ['sabko', 'سب کو'], ['kuch', 'کچھ'], ['koi', 'کوئی'], ['har', 'ہر'],
    ['meri', 'میری'], ['mera', 'میرا'], ['mere', 'میرے'], ['teri', 'تیری'], ['tera', 'تیرا'],
    ['apki', 'آپ کی'], ['apka', 'آپ کا'], ['unki', 'ان کی'], ['unka', 'ان کا'],
    ['theek', 'ٹھیک'], ['bilkul', 'بالکل'], ['zaroor', 'ضرور'], ['shayad', 'شاید'],
    ['mashallah', 'ماشاءاللہ'], ['inshallah', 'انشاءاللہ'], ['alhamdulillah', 'الحمدللہ'],
    ['subhanallah', 'سبحان اللہ'], ['jazakallah', 'جزاک اللہ']
  ];

  function _romanToUrdu(text) {
    var out = ' ' + String(text || '') + ' ';
    // longest phrases first so multi-word greetings win over single words
    var sorted = ROMAN_URDU_MAP.slice().sort(function (a, b) { return b[0].length - a[0].length; });
    for (var i = 0; i < sorted.length; i++) {
      var re = new RegExp('([^A-Za-z])' + sorted[i][0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z])', 'gi');
      out = out.replace(re, '$1' + sorted[i][1] + '$2');
    }
    return out.trim();
  }

  /* ------------------------------------------------------------------ */
  /* Public API (exact SPEC.md contract)                                 */
  /* ------------------------------------------------------------------ */
  return {
    getVoices: getVoices,
    synthesize: synthesize,
    cancel: cancel,
    setReferenceAudio: setReferenceAudio, // mic recording blob for Chatterbox cloning
    // underscore helpers for QA/unit tests (not part of the UI contract)
    _chunkText: _chunkText,
    _guessLang: _guessLang,
    _romanToUrdu: _romanToUrdu
  };
});
