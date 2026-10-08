// VoiceSync Studio — 1000-test automated QA suite
// Run: node qa-1000.js   (also wired into git pre-push hook)
var fs = require('fs');
var P = '/home/hatch/workspace/voicesync-studio/';
var appjs = fs.readFileSync(P + 'js/app.js', 'utf8');
var ttsjs = fs.readFileSync(P + 'js/tts.js', 'utf8');
var i18njs = fs.readFileSync(P + 'js/i18n.js', 'utf8');
var html = fs.readFileSync(P + 'index.html', 'utf8');
var css = fs.readFileSync(P + 'css/style.css', 'utf8');
var expsrc = fs.readFileSync(P + 'js/exporter.js', 'utf8');

var n = 0, pass = 0, fails = [];
function t(name, cond) {
  n++;
  if (cond) pass++;
  else if (fails.length < 25) fails.push(n + '. ' + name);
  else if (fails.length === 25) fails.push('... (more failures truncated)');
}
function grab(src, name) {
  var m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}'));
  return m ? eval('(' + m[0] + ')') : null;
}

async function main() {
  var TTS = require(P + 'js/tts.js');
  var M = require(P + 'js/exporter.js');
  var parseDialogue = grab(appjs, 'parseDialogue');
  var fmtSrt = grab(appjs, 'fmtSrt');
  var wrapSrtLine = grab(appjs, 'wrapSrtLine');
  var resampleLinear = grab(appjs, 'resampleLinear');
  var scaleCues = grab(appjs, 'scaleCues');

  /* i18n key extraction (M39): real key sets for en / ur / FALLBACK.
     Delimiter-based (not brace-matching) — verified unique in js/i18n.js. */
  function blockBetween(src, startDelim, endDelim) {
    var s = src.indexOf(startDelim);
    if (s === -1) return null;
    var e = src.indexOf(endDelim, s + startDelim.length);
    if (e === -1) return null;
    return src.slice(s + startDelim.length, e);
  }
  function dictKeys(block) {
    var out = {}, dm, dre = /^\s*([A-Za-z0-9_]+)\s*:/gm;
    while ((dm = dre.exec(block))) out[dm[1]] = 1;
    return out;
  }
  var enBlock = blockBetween(i18njs, '    en: {', '\n    },\n    ur: {');
  var urBlockFull = blockBetween(i18njs, '    ur: {', '\n    }\n  };');
  var enKeys = enBlock ? dictKeys(enBlock) : {};
  var urKeys = urBlockFull ? dictKeys(urBlockFull) : {};
  var fbBlockM = appjs.match(/var FALLBACK = \{([\s\S]*?)\n  \};/);
  var fbKeysFull = fbBlockM ? dictKeys(fbBlockM[1]) : {};
  t('i18n_extract_en', Object.keys(enKeys).length > 100);
  t('i18n_extract_ur', Object.keys(urKeys).length > 100);
  t('i18n_extract_fb', Object.keys(fbKeysFull).length > 10);

  /* 1. _chunkText — 200 cases */
  var seeds = ['hello world ', 'یہ اردو متن ہے۔ ', 'यह हिंदी पाठ है। ', 'a ', 'word ', 'Supercalifragilisticexpialidocious '];
  for (var i = 0; i < 200; i++) {
    var seed = seeds[i % seeds.length];
    var len = (i * 37) % 3000;
    var txt = seed.repeat(Math.ceil(len / seed.length) + 1).slice(0, len);
    var lim = [50, 100, 200, 250][i % 4];
    var chunks = TTS._chunkText(txt, lim);
    var okc = chunks.every(function (c) { return c.length <= lim && c.trim().length > 0; });
    t('chunk_case_' + i, txt.trim() ? okc : chunks.length === 0);
  }

  /* 2. _guessLang — 160 cases */
  var urduSamples = ['یہ اردو ہے', 'ٹھیک ہے بھائی', 'میں گھر جا رہا ہوں', 'ڈاکٹر صاحب', 'ھمیشہ خوش رہو', 'ں لگا دو'];
  var arabicSamples = ['المدرسة جميلة', 'السلام عليكم ورحمة الله', 'اللغة العربية سهلة'];
  var ambiguousSamples = ['كتاب جديد', 'مرحبا بالعالم']; // no ة, no Urdu letters -> user default ur-PK
  var hindiSamples = ['यह हिंदी है', 'मैं घर जा रहा हूँ', 'नमस्ते दुनिया'];
  var engSamples = ['hello world', 'The quick brown fox', 'Testing 123'];
  var all = [];
  urduSamples.forEach(function (s) { all.push([s, 'ur-PK']); });
  arabicSamples.forEach(function (s) { all.push([s, 'ar-SA']); });
  ambiguousSamples.forEach(function (s) { all.push([s, 'ur-PK']); });
  hindiSamples.forEach(function (s) { all.push([s, 'hi-IN']); });
  engSamples.forEach(function (s) { all.push([s, 'en-US']); });
  // mixed + repeated with punctuation/numbers (variants built from ORIGINAL bases only)
  var bases = all.slice();
  for (var j = 0; j < 140; j++) {
    var base = bases[j % bases.length];
    var variant = base[0] + ' 123!؟.' ;
    all.push([variant, base[1]]);
  }
  all.slice(0, 160).forEach(function (c, k) {
    t('guess_' + k, TTS._guessLang(c[0]) === c[1]);
  });

  /* 3. fmtSrt — 120 cases */
  for (var s = 0; s < 120; s++) {
    var sec = s * 37.5 + (s % 7) * 0.123;
    var out = fmtSrt(sec);
    t('srt_fmt_' + s, /^\d{2}:\d{2}:\d{2},\d{3}$/.test(out));
  }
  t('srt_fmt_neg', fmtSrt(-5) === '00:00:00,000');
  t('srt_fmt_zero', fmtSrt(0) === '00:00:00,000');

  /* 4. wrapSrtLine — 50 cases */
  var words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'اردو', 'متن', 'hello', 'world'];
  for (var w = 0; w < 50; w++) {
    var line = [];
    for (var k2 = 0; k2 < (w % 25) + 1; k2++) line.push(words[(w + k2) % words.length]);
    var lj = line.join(' ');
    var wrapped = wrapSrtLine(lj);
    t('wrap_' + w, wrapped.replace(/\n/g, ' ') === lj);
  }

  /* 5. resampleLinear — 40 cases */
  for (var r = 0; r < 40; r++) {
    var from = [8000, 16000, 22050, 44100, 48000][r % 5];
    var to = [8000, 16000, 22050, 44100, 48000][(r + 2) % 5];
    var lenIn = 100 + r * 10;
    var din = new Float32Array(lenIn);
    for (var q = 0; q < lenIn; q++) din[q] = Math.sin(q * 0.1);
    var dout = resampleLinear(din, from, to);
    var expLen = Math.max(1, Math.round(lenIn * to / from));
    t('resample_' + r, Math.abs(dout.length - expLen) <= 1);
  }

  /* 6. scaleCues — 60 cases */
  for (var sc = 0; sc < 60; sc++) {
    var spd = [0.5, 0.75, 1, 1.25, 1.5, 2][sc % 6];
    var cues = [];
    for (var c3 = 0; c3 < 10; c3++) cues.push({ start: c3, end: c3 + 0.9, value: 'A' });
    var so = scaleCues(cues, spd);
    var okS = so.length === 10 && Math.abs(so[5].start - 5 / spd) < 1e-9 && so[5].value === 'A';
    t('scalecues_' + sc, okS);
  }

  /* 7. parseDialogue — 100 cases */
  for (var pd = 0; pd < 100; pd++) {
    var nSeg = (pd % 5) + 1;
    var lines = [];
    for (var s2 = 0; s2 < nSeg; s2++) lines.push(((s2 % 2) + 1) + ': line ' + s2 + ' speaker ' + ((s2 % 2) + 1));
    var parsed = parseDialogue(lines.join('\n'));
    var okP = parsed && parsed.length === nSeg && parsed.every(function (sg, ix) { return sg.speaker === (ix % 2) + 1; });
    t('dialogue_' + pd, !!okP);
  }

  /* 8. WAV encoding — 50 cases */
  for (var wv = 0; wv < 50; wv++) {
    var rate = [8000, 16000, 44100, 48000][wv % 4];
    var ch = (wv % 2) + 1;
    var ln = 100 + wv * 20;
    var buf = { sampleRate: rate, numberOfChannels: ch, length: ln, getChannelData: function () { return new Float32Array(ln); } };
    try {
      var bytes = M._encodeWAVBytes(buf);
      var hdrOk = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70;
      var sr = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24);
      t('wav_' + wv, hdrOk && sr === rate && bytes.length === 44 + ln * ch * 2);
    } catch (e) { t('wav_' + wv, false); }
  }

  /* 9. getVoices prefixes — 60 cases */
  var prefixes = ['en', 'ur', 'hi', 'ar', 'es', 'fr', 'de', 'xx', 'en-US', 'ur-PK'];
  for (var vp = 0; vp < 60; vp++) {
    var px = prefixes[vp % prefixes.length];
    var vs = TTS.getVoices(px);
    t('voices_' + vp, Array.isArray(vs) && vs.every(function (v) { return v.id && v.engine; }));
  }

  /* 10. _escapeXml — the REAL function via TTS._escapeXml (C9, adversarial).
     The old suite tested a hand-copied replica; these call the real export. */
  t('escape_xml_gate — TTS._escapeXml not exported', typeof TTS._escapeXml === 'function');
  if (typeof TTS._escapeXml === 'function') {
    var escReal = TTS._escapeXml;
    var advCases = [
      ['<script>alert("x")</script>', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'script_tag'],
      ['a & b', 'a &amp; b', 'ampersand'],
      ['"double" & \'single\' quotes', '&quot;double&quot; &amp; &#39;single&#39; quotes', 'quotes_escaped'],
      ['<<nested>>', '&lt;&lt;nested&gt;&gt;', 'nested_angles'],
      ['&&&&', '&amp;&amp;&amp;&amp;', 'amp_run'],
      ['<b>bold</b> & <i>italic</i>', '&lt;b&gt;bold&lt;/b&gt; &amp; &lt;i&gt;italic&lt;/i&gt;', 'nested_tags'],
      ['نص & <عربي>', 'نص &amp; &lt;عربي&gt;', 'arabic_unicode'],
      ['اردو "اقتباس" & <ٹیگ>', 'اردو &quot;اقتباس&quot; &amp; &lt;ٹیگ&gt;', 'urdu_unicode'],
      ['🔊 <loud> & clear', '🔊 &lt;loud&gt; &amp; clear', 'emoji'],
      ['', '', 'empty'],
      ['plain text, no specials', 'plain text, no specials', 'plain_passthrough'],
      ['&amp; already escaped', '&amp;amp; already escaped', 'double_escape'],
      ['&lt;', '&amp;lt;', 'pre_escaped_lt'],
      ['a>b<c', 'a&gt;b&lt;c', 'mixed'],
      ['line1\nline2 <x>', 'line1\nline2 &lt;x&gt;', 'newline_kept']
    ];
    advCases.forEach(function (c) {
      t('escape_real_' + c[2], escReal(c[0]) === c[1]);
    });
    // structural: after removing the 5 entities, no raw XML metachar may remain
    ['<img src=x>', 'a&b<c>d"e\'f', '<<<&&&>>>'].forEach(function (raw, ix) {
      var out = escReal(raw);
      var stripped = out.split('&amp;').join('').split('&lt;').join('').split('&gt;').join('')
        .split('&quot;').join('').split('&#39;').join('');
      t('escape_real_nometa_' + ix,
        stripped.indexOf('&') === -1 && stripped.indexOf('<') === -1 && stripped.indexOf('>') === -1
        && stripped.indexOf('"') === -1 && stripped.indexOf("'") === -1);
    });
    // escaping must be exactly invertible through the 5 entities
    ['<a href="x&y">نص</a>', '<<<', '&&'].forEach(function (raw, ix) {
      var out = escReal(raw);
      var back = out.split('&lt;').join('<').split('&gt;').join('>').split('&quot;').join('"')
        .split('&#39;').join("'").split('&amp;').join('&');
      t('escape_real_roundtrip_' + ix, back === raw);
    });
    // non-string input is stringified, never throws
    t('escape_real_num', escReal(123) === '123');
    t('escape_real_null', escReal(null) === 'null');
  }

  /* 11. i18n keys ×2 — ~100 */
  var keys = {}, m, re3 = /\bt\('([A-Za-z0-9_]+)'\)/g;
  while ((m = re3.exec(appjs))) keys[m[1]] = 1;
  var fb = appjs.match(/var FALLBACK = \{([\s\S]*?)\n  \};/);
  var fbKeys = (fb ? fb[1].match(/^\s*([A-Za-z0-9_]+):/gm) : []).map(function (s) { return s.trim().replace(':', ''); });
  Object.keys(keys).forEach(function (k, ix) {
    t('i18n_fb_' + ix, fbKeys.indexOf(k) !== -1 || i18njs.indexOf(k + ':') !== -1);
  });

  /* 12. HTML ids + wiring + css — ~60 */
  var ids = {}, re = /\$\('([A-Za-z0-9_-]+)'\)/g;
  while ((m = re.exec(appjs))) ids[m[1]] = 1;
  Object.keys(ids).forEach(function (id, ix) {
    t('html_id_' + ix, html.indexOf('id="' + id + '"') !== -1);
  });
  var hk = {}, re4 = /data-i18n="([A-Za-z0-9_]+)"/g;
  while ((m = re4.exec(html))) hk[m[1]] = 1;
  Object.keys(hk).forEach(function (k, ix) {
    t('html_i18n_' + ix, i18njs.indexOf(k + ':') !== -1);
  });

  /* M39. i18n subset assertions: FALLBACK ⊆ en ⊆ ur, and every
     data-i18n / data-i18n-ph key in index.html exists in both dicts. */
  Object.keys(fbKeysFull).forEach(function (k) {
    t('m39_fb_in_en_' + k, !!enKeys[k]);
  });
  Object.keys(enKeys).forEach(function (k) {
    t('m39_en_in_ur_' + k, !!urKeys[k]);
  });
  var hk2 = {}, re5 = /data-i18n(?:-ph)?="([A-Za-z0-9_]+)"/g;
  while ((m = re5.exec(html))) hk2[m[1]] = 1;
  Object.keys(hk2).forEach(function (k) {
    t('m39_html_en_' + k, !!enKeys[k]);
    t('m39_html_ur_' + k, !!urKeys[k]);
  });

  /* 13. synthesize error contracts — 10 */
  t('syn_empty', !!(await TTS.synthesize('', 'x')).error);
  t('syn_spaces', !!(await TTS.synthesize('   ', 'x')).error);
  t('syn_null', !!(await TTS.synthesize(null, 'x')).error);
  // non-string input: the contract is resolve-with-result-or-{error}, never hang/throw/undefined
  var rn = await TTS.synthesize(12345, 'x');
  t('syn_number', !!(rn && (rn.engine || rn.error)));
  var r5 = await TTS.synthesize('hello world test', 'edge:en-US-AriaNeural');
  t('syn_resolves', !!(r5 && (r5.engine || r5.error)));

  /* 14. structural invariants — 30 */
  t('inv_scaleCues_in_pitched', appjs.indexOf('scaleCues(cues, state.speed || 1), timeSrc') !== -1);
  t('inv_scaleCues_in_webspeech', appjs.indexOf('scaleCues(cues, state.speed || 1), clock') !== -1);
  t('inv_srt_strips_dialogue', appjs.indexOf("/^[ \\t]*[12]:[ \\t]*/gm") !== -1);
  t('inv_srt_speed', appjs.indexOf('dur / (state.speed || 1)') !== -1);
  t('inv_busy_guard', appjs.indexOf('setBusy(true)') !== -1);
  t('inv_stopall_music', appjs.indexOf('stopMusic()') !== -1);
  t('inv_escape_xml', ttsjs.indexOf('_escapeXml(chunk)') !== -1);
  t('inv_ur_detect', ttsjs.indexOf('ur-PK') !== -1);
  t('inv_ar_detect', ttsjs.indexOf("return 'ar-SA'") !== -1);
  t('inv_dialogue_merge', appjs.indexOf('synthesizeDialogue') !== -1);
  t('inv_chatterbox', ttsjs.indexOf('chatterbox') !== -1);
  t('inv_music_export', appjs.indexOf('musicURL: state.musicUrl') !== -1 || appjs.indexOf('musicURL') !== -1);
  t('inv_no_console_log', (appjs.match(/console\.log/g) || []).length === 0);
  t('inv_pitch_detune', appjs.indexOf('detune.value') !== -1);
  t('inv_speed_audio', appjs.indexOf('playbackRate') !== -1);
  t('inv_wav_header', expsrc.indexOf("writeAscii(view, 0, 'RIFF')") !== -1 &&
    expsrc.indexOf("writeAscii(view, 8, 'WAVE')") !== -1);
  t('inv_i18n_ur', /ur\s*:/.test(i18njs));
  t('inv_html_lang_toggle', html.indexOf('langToggle') !== -1 || html.indexOf('data-i18n') !== -1);
  t('inv_record_btn', html.indexOf('btnRecord') !== -1);
  t('inv_dictate_btn', html.indexOf('btnDictate') !== -1);
  t('inv_srt_btn', html.indexOf('btnSrt') !== -1);
  t('inv_dialogue_cb', html.indexOf('dialogueMode') !== -1);
  t('inv_speed_slider', html.indexOf('speedRange') !== -1);
  t('inv_pitch_slider', html.indexOf('pitchRange') !== -1);
  t('inv_music_picker', html.indexOf('musicFile') !== -1);
  t('inv_timeline', html.indexOf('timeline') !== -1);
  t('inv_avatar_mount', html.indexOf('avatarMount') !== -1);
  t('inv_css_mobile', css.indexOf('360px') !== -1 || css.indexOf('max-width') !== -1);
  t('inv_charset', html.indexOf('charset') !== -1);
  t('inv_viewport', html.indexOf('viewport') !== -1);

  /* 12. Character Voices (Free Voice Over skin) — new assertions */
  // Extract CHARACTERS array from app.js
  var charM = appjs.match(/var CHARACTERS = \[([\s\S]*?)\];/);
  t('char_array_exists', !!charM);
  var chars = [];
  if (charM) {
    var re = /\{\s*name:\s*'([^']+)',\s*voiceId:\s*'([^']+)',\s*lang:\s*'([^']+)',\s*gender:\s*'([^']+)',\s*style:\s*'([^']+)'(?:,\s*pitch:\s*(-?\d+))?\s*\}/g;
    var cm;
    while ((cm = re.exec(charM[1])) !== null) {
      chars.push({ name: cm[1], voiceId: cm[2], lang: cm[3], gender: cm[4], style: cm[5], pitch: cm[6] ? parseInt(cm[6], 10) : 0 });
    }
  }
  t('char_count_27', chars.length === 27);
  // Each mapped ID must exist in EDGE_VOICES (real voices only)
  var edgeIds = {};
  var evm = ttsjs.match(/var EDGE_VOICES = \[([\s\S]*?)\];/);
  if (evm) {
    var er = /\['([^']+)',/g, em2;
    while ((em2 = er.exec(evm[1])) !== null) edgeIds['edge:' + em2[1]] = true;
  }
  chars.forEach(function (c, i) {
    t('char_voice_real_' + i + '_' + c.name, !!edgeIds[c.voiceId]);
    t('char_engine_edge_' + c.name, c.voiceId.indexOf('edge:') === 0);
  });
  // Required characters from the boss's screenshot
  ['Ahmed', 'Fatima', 'Bilal', 'Aisha', 'Dastaan Go', 'Guddu', 'Priya Sharma', 'Arjun Kumar', 'Ananya', 'Ivan Petrov', 'Natasha Volkova', 'Dmitri', 'Alex Carter', 'Sophia Miller', 'Emma Rose', 'The Narrator', 'Oliver Reed', 'Amelia Hart', 'Omar Farooq', 'Layla Noor', 'Yusuf Ali', 'Hans Weber', 'Pierre Dubois', 'Kenji Sato', 'Yuki Tanaka', 'Seo-yeon', 'Chotu'].forEach(function (nm) {
    t('char_required_' + nm, chars.some(function (c) { return c.name === nm; }));
  });
  // Characters sharing one base voice must differ by pitch (boss: no "voice 1" clones)
  var byVoice = {};
  chars.forEach(function (c) {
    (byVoice[c.voiceId] = byVoice[c.voiceId] || []).push(c);
  });
  Object.keys(byVoice).forEach(function (vid) {
    var group = byVoice[vid];
    if (group.length > 1) {
      var pitches = group.map(function (c) { return c.pitch; });
      var distinct = pitches.every(function (p, i) { return pitches.indexOf(p) === i; });
      t('char_pitch_distinct_' + vid, distinct);
    }
  });
  t('charInitials_fn', appjs.indexOf('function charInitials') !== -1);
  t('pitchDisplay_fn', appjs.indexOf('function pitchDisplay') !== -1);

  /* 13. Round 2: Free Voice Over sections (language pills, text, generate,
        engines, clone premium, guide, footer) */
  // Language pills
  t('r2_langpills_html', html.indexOf('id="langPills"') !== -1);
  t('r2_langsearch_html', html.indexOf('id="langSearch"') !== -1);
  t('r2_browservoice_html', html.indexOf('id="browserVoiceSelect"') !== -1);
  t('r2_langpills_js', appjs.indexOf('var LANG_PILLS') !== -1);
  t('r2_setlangpill_fn', appjs.indexOf('function setLangPill') !== -1);
  t('r2_renderlangpills_fn', appjs.indexOf('function renderLangPills') !== -1);
  t('r2_refreshbrowser_fn', appjs.indexOf('function refreshBrowserVoices') !== -1);
  t('r2_initlangpills_boot', appjs.indexOf('initLangPills()') !== -1);
  // Language pill codes are real ttsLang values (en-GB allowed via base match)
  var pillCodes = ['ur', 'hi', 'ru', 'en', 'en-GB', 'ar', 'es', 'fr'];
  pillCodes.forEach(function (pc) {
    t('r2_pillcode_' + pc, appjs.indexOf("code: '" + pc + "'") !== -1);
  });
  // Text section
  t('r2_textcounter_html', html.indexOf('id="textCounter"') !== -1);
  ['btnSample', 'btnPaste', 'btnCopy', 'btnClear'].forEach(function (id) {
    t('r2_' + id.toLowerCase() + '_html', html.indexOf('id="' + id + '"') !== -1);
  });
  t('r2_inittextbuttons_fn', appjs.indexOf('function initTextButtons') !== -1);
  t('r2_counter_words', appjs.indexOf('counter_words') !== -1);
  // Generate section
  t('r2_gen_title', html.indexOf('gen_title') !== -1);
  ['btnGenBig', 'btnListenBig', 'btnPauseBig', 'btnStopBig', 'btnDlMp3Big'].forEach(function (id) {
    t('r2_' + id.toLowerCase() + '_html', html.indexOf('id="' + id + '"') !== -1);
  });
  t('r2_pause_fn', appjs.indexOf('function pausePlayback') !== -1);
  t('r2_selcharbox_html', html.indexOf('id="selCharBox"') !== -1);
  t('r2_updateselcharbox_fn', appjs.indexOf('function updateSelCharBox') !== -1);
  t('r2_audioplayer_html', html.indexOf('id="audioPlayer"') !== -1);
  t('r2_showaudioplayer_fn', appjs.indexOf('function showAudioPlayer') !== -1);
  // Engines section
  t('r2_engines_html', html.indexOf('engines_title') !== -1);
  ['eng_google_h', 'eng_studio_h', 'eng_browser_h'].forEach(function (k) {
    t('r2_' + k, html.indexOf(k) !== -1);
  });
  // Clone premium (locked)
  t('r2_clone_html', html.indexOf('id="cloneName"') !== -1);
  t('r2_clonebtn_html', html.indexOf('id="btnClonePremium"') !== -1);
  t('r2_clonesample_html', html.indexOf('id="btnCloneSample"') !== -1);
  t('r2_initclone_fn', appjs.indexOf('function initClone') !== -1);
  t('r2_initclone_boot', appjs.indexOf('initClone()') !== -1);
  t('r2_clone_locked_msg', appjs.indexOf('clone_locked_msg') !== -1);
  // Guide + footer
  t('r2_guide_html', html.indexOf('guide_title') !== -1);
  t('r2_footer_ur', html.indexOf('footer_ur') !== -1);
  t('r2_footer_brand', html.indexOf('footer_brand') !== -1);
  // i18n keys present in both languages
  ['langpills_title', 'browser_voice_label', 'yourtext_title', 'counter_words',
   'btn_sample', 'btn_paste', 'btn_copy', 'btn_clear', 'gen_title', 'speed_sub',
   'pitch_sub', 'btn_pause', 'dl_help', 'selchar_hint', 'char_howto',
   'engines_title', 'eng_google_h', 'clone_title', 'clone_create', 'clone_locked',
   'guide_title', 'footer_ur', 'footer_brand', 'paused', 'sample_text'
  ].forEach(function (k) {
    t('r2_i18n_en_' + k, new RegExp(k + ":\\s*'").test(i18njs));
  });
  var urBlock2 = i18njs.match(/ur:\s*\{([\s\S]*?)\n    \}/);
  ['langpills_title', 'browser_voice_label', 'yourtext_title', 'btn_sample',
   'gen_title', 'btn_pause', 'clone_create', 'guide_title', 'footer_ur'
  ].forEach(function (k) {
    t('r2_i18n_ur_' + k, !!urBlock2 && urBlock2[1].indexOf(k + ':') !== -1);
  });
  // charMatches filter logic
  var charMatchesFn = grab(appjs, 'charMatches');
  t('char_filter_fn', typeof charMatchesFn === 'function');
  if (charMatchesFn) {
    var tc = { name: 'Ahmed', lang: 'Urdu', gender: 'Male', style: 'News Narrator' };
    t('char_filter_name', charMatchesFn(tc, 'ahm') === true);
    t('char_filter_lang', charMatchesFn(tc, 'urdu') === true);
    t('char_filter_style', charMatchesFn(tc, 'news') === true);
    t('char_filter_nomatch', charMatchesFn(tc, 'xyz') === false);
    t('char_filter_empty', charMatchesFn(tc, '') === true);
  }
  // HTML wiring
  t('char_html_grid', html.indexOf('id="charGrid"') !== -1);
  t('char_html_search', html.indexOf('id="charSearch"') !== -1);
  t('char_html_pills', html.indexOf('pill-badges') !== -1);
  t('char_html_section', html.indexOf('char-card-section') !== -1);
  // CSS skin
  t('char_css_card', css.indexOf('.char-card') !== -1);
  t('char_css_avatar', css.indexOf('.char-avatar') !== -1);
  t('char_css_play', css.indexOf('.char-play') !== -1);
  t('char_css_cream', css.indexOf('#f7f3ea') !== -1);
  t('char_css_green', css.indexOf('#1d5c4d') !== -1);
  // previewVoice accepts voiceId param (character play buttons)
  t('char_preview_param', /async function previewVoice\(voiceId, pitchOverride\)/.test(appjs));
  t('char_preview_call', appjs.indexOf('previewVoice(c.voiceId, c.pitch || 0)') !== -1);
  t('char_select_fn', appjs.indexOf('function selectCharacter') !== -1);
  t('char_init_boot', appjs.indexOf('initCharVoices()') !== -1);
  // i18n keys in both languages
  ['pill_free', 'pill_noapi', 'pill_mp3', 'pill_langs', 'pill_clone',
   'char_title', 'char_search_ph', 'char_preview', 'char_no_match', 'char_selected'
  ].forEach(function (k) {
    t('char_i18n_en_' + k, new RegExp(k + ":\\s*'").test(i18njs));
    t('char_i18n_ur_' + k, !!urKeys[k]);
  });

  // ---- Team 2 Fix Round: 15 issues ----
  // 1+2+15: pause covers audioEl + previewCtx, resumePlayback toggle exists
  t('fix_pause_audioEl', /state\.audioEl\.pause\(\); state\.pausedKind = 'audioEl'/.test(appjs));
  t('fix_pause_previewCtx', /state\.previewCtx\.suspend\(\); state\.pausedKind = 'previewCtx'/.test(appjs));
  t('fix_resume_fn', appjs.indexOf('function resumePlayback') !== -1);
  t('fix_pause_toggle', /if \(state\.pausedKind\) \{ resumePlayback\(\); return; \}/.test(appjs));
  t('fix_pausedKind_reset', appjs.indexOf('state.pausedKind = null; // any pause/resume state dies') !== -1);
  t('fix_pausedKind_state', appjs.indexOf('pausedKind: null,') !== -1);
  // 3: btn-accent readable text
  t('fix_accent_color', /\.btn-accent \{[^}]*color: #fff/.test(css));
  // 4: Clear nulls lastResult + revokes the blob URL (MINOR: stopAll() does
  // not touch lastUrl, so Clear now calls releaseLastAudio() instead of
  // bare-nulling it — the URL is revoked AND nulled in one place).
  t('fix_clear_nulls', appjs.indexOf('state.lastResult = null; state.lastCues = [];') !== -1);
  t('fix_clear_revokes_blob', /stopAll\(\);\s*\n\s*state\.lastResult = null; state\.lastCues = \[\];\s*\n[\s\S]{0,200}?releaseLastAudio\(\);/.test(appjs));
  t('fix_clear_lastUrl_nulled', appjs.indexOf('state.lastUrl = null;') !== -1);
  t('fix_clear_disables', /'\btnPlay', 'btnListenBig'/.test(appjs) || appjs.indexOf("'btnPlay', 'btnListenBig'") !== -1);
  t('fix_clear_i18n', i18njs.indexOf('cleared:') !== -1);
  // 5: parts divisor 400
  t('fix_parts_400', appjs.indexOf('Math.ceil(txt.length / 400)') !== -1);
  t('fix_parts_no2000', appjs.indexOf('/ 2000)') === -1 || appjs.indexOf('txt.length / 2000') === -1);
  // 6: renderLangPills in 3 paths
  t('fix_pills_dropdown', /tl\.addEventListener\('change', function \(\) \{(?:\s*\/\/[^\n]*|\s*if \(state\.generating\)[^\n]*)*\s*state\.ttsLang = tl\.value \|\| 'en';\s*\n?\s*loadVoices\(\);\s*\n?\s*renderLangPills\(\);/.test(appjs));
  t('fix_pills_autodetect', /await loadVoices\(\);\s*\n?\s*renderLangPills\(\); \/\/ Team 2 Fix: pills follow auto-detect/.test(appjs));
  t('fix_pills_preset', appjs.indexOf("tl.value = p.ttsLang; renderLangPills();") !== -1);
  // 7: filtered-out voice warning
  t('fix_filtered_warn', appjs.indexOf("setMsg(t('voice_filtered_out'), true)") !== -1);
  t('fix_filtered_i18n', i18njs.indexOf('voice_filtered_out:') !== -1);
  // 8: Kenji Sato Female
  t('fix_kenji_female', /Kenji Sato',\s*voiceId: 'edge:ja-JP-NanamiNeural', lang: 'Japanese', gender: 'Female'/.test(appjs));
  // 9+12: selChar tracking
  t('fix_selchar_state', appjs.indexOf('selChar: null,') !== -1);
  t('fix_selchar_set', appjs.indexOf('state.selChar = c; // Team 2 Fix: track the CHARACTER') !== -1);
  t('fix_selchar_box', appjs.indexOf('var c = state.selChar;') !== -1);
  t('fix_selchar_highlight', appjs.indexOf('var isSel = (state.selChar === c);') !== -1);
  // 10: character select syncs language UI
  t('fix_char_langcode', appjs.indexOf('function charLangCode') !== -1);
  t('fix_char_synclang', appjs.indexOf('function syncLangUiToCode') !== -1);
  t('fix_char_synclang_call', appjs.indexOf('syncLangUiToCode(charLangCode(c))') !== -1);
  // 11: preview URL pitch limitation noted
  t('fix_preview_pitch_note', appjs.indexOf('Team 2 note (Medium 11): pitch is NOT applied here') !== -1);
  // 13: easy-mode hides slider cards
  t('fix_easy_slider', css.indexOf('body.easy-mode .slider-card,') !== -1);
  // 14: visible player IS the playback element
  t('fix_google_visible', appjs.indexOf('if (ap) { try { ap.hidden = false; } catch (e) {} }') !== -1);
  t('fix_google_no_double', appjs.indexOf('el = ap || new Audio();') !== -1);

  /* Team 3 QA addition: preset + project localStorage round-trips.
     No DOM in this harness, so tests run at schema level: the real
     key names, the real JSON shape, and the real save/load functions
     (extracted from app.js / exporter.js) against an in-memory stub. */
  var memStore = {};
  var lsStub = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null; },
    setItem: function (k, v) { memStore[k] = String(v); },
    removeItem: function (k) { delete memStore[k]; },
    clear: function () { for (var kk in memStore) delete memStore[kk]; }
  };
  function grabSrc(src, name) {
    var mm = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}'));
    return mm ? mm[0] : null;
  }

  // ---- presets (app.js: PRESET_KEY = 'voicesync-presets') ----
  var presetKeyM = appjs.match(/var PRESET_KEY = '([^']+)'/);
  t('preset_key_name', !!presetKeyM && presetKeyM[1] === 'voicesync-presets');
  var getP = null, setP = null;
  try {
    var gSrc = grabSrc(appjs, 'getPresets'), sSrc = grabSrc(appjs, 'setPresets');
    if (gSrc && sSrc && presetKeyM) {
      getP = new Function('PRESET_KEY', 'localStorage', 'return (' + gSrc + ');')(presetKeyM[1], lsStub);
      setP = new Function('PRESET_KEY', 'localStorage', 'return (' + sSrc + ');')(presetKeyM[1], lsStub);
    }
  } catch (e) { getP = setP = null; }
  t('preset_fns_grabbed', typeof getP === 'function' && typeof setP === 'function');
  if (typeof getP === 'function' && typeof setP === 'function') {
    lsStub.clear();
    t('preset_empty', JSON.stringify(getP()) === '{}');
    var samplePreset = {
      'My Preset': { ttsLang: 'ur', voiceId: 'edge:ur-PK-AsadNeural', speed: 1.25,
                     pitch: -3, dialogueMode: true, voiceId2: 'edge:ur-PK-GulNeural' }
    };
    setP(samplePreset);
    var rawStored = lsStub.getItem('voicesync-presets');
    var back = null; try { back = JSON.parse(rawStored); } catch (e) { back = null; }
    t('preset_stored_json', !!back && typeof back === 'object');
    t('preset_roundtrip', JSON.stringify(getP()) === JSON.stringify(samplePreset));
    t('preset_shape_fields', !!back && !!back['My Preset'] &&
      back['My Preset'].ttsLang === 'ur' &&
      back['My Preset'].voiceId === 'edge:ur-PK-AsadNeural' &&
      back['My Preset'].speed === 1.25 &&
      back['My Preset'].pitch === -3 &&
      back['My Preset'].dialogueMode === true &&
      back['My Preset'].voiceId2 === 'edge:ur-PK-GulNeural');
    lsStub.setItem('voicesync-presets', '###corrupt###');
    t('preset_corrupt', JSON.stringify(getP()) === '{}');
    lsStub.setItem('voicesync-presets', '42');
    t('preset_nonobject', JSON.stringify(getP()) === '{}');
    lsStub.clear();
  } else {
    t('preset_roundtrip_unavailable', false);
  }
  // applyPreset reads each field with a type guard (schema contract)
  t('preset_apply_ttsLang', appjs.indexOf('if (p.ttsLang)') !== -1);
  t('preset_apply_voiceId', appjs.indexOf('if (p.voiceId)') !== -1);
  t('preset_apply_speed_num', appjs.indexOf("typeof p.speed === 'number'") !== -1);
  t('preset_apply_pitch_num', appjs.indexOf("typeof p.pitch === 'number'") !== -1);
  t('preset_apply_dialogue_bool', appjs.indexOf("typeof p.dialogueMode === 'boolean'") !== -1);
  t('preset_apply_voiceId2', appjs.indexOf('p.voiceId2') !== -1);

  // ---- projects (exporter.js: STORAGE_KEY = 'voicesync-studio.project.v1') ----
  t('project_key_name', M._storageKey === 'voicesync-studio.project.v1');
  // minimal browser stubs so Exporter.saveProject's download path runs in Node
  globalThis.localStorage = lsStub;
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: function () { return { click: function () {} }; },
      body: { appendChild: function () {} }
    };
  }
  if (typeof globalThis.window === 'undefined') { globalThis.window = { setTimeout: setTimeout }; }
  var proj = { app: 'voicesync-studio', v: 1, text: 'hello world', ttsLang: 'ur',
               voiceId: 'edge:ur-PK-AsadNeural', uiLang: 'en', savedAt: '2026-10-08T12:00:00.000Z' };
  var savedJson = null, saveThrew = null;
  try { savedJson = M.Exporter.saveProject(proj); } catch (e) { saveThrew = e; }
  t('project_save_no_throw', saveThrew === null);
  var savedOk = false;
  try { savedOk = !!savedJson && JSON.stringify(JSON.parse(savedJson)) === JSON.stringify(proj); } catch (e) {}
  t('project_save_returns_json', savedOk);
  var loadedProj = null;
  try { loadedProj = M.Exporter.loadProject(); } catch (e) { loadedProj = 'THREW'; }
  t('project_roundtrip', JSON.stringify(loadedProj) === JSON.stringify(proj));
  t('project_stored_key', lsStub.getItem('voicesync-studio.project.v1') === savedJson);
  lsStub.setItem('voicesync-studio.project.v1', '###corrupt###');
  t('project_corrupt_null', M.Exporter.loadProject() === null);
  lsStub.removeItem('voicesync-studio.project.v1');
  t('project_empty_null', M.Exporter.loadProject() === null);
  // collectProject schema (real function, stubbed $/state)
  var collectProject = null;
  try {
    var cSrc = grabSrc(appjs, 'collectProject');
    if (cSrc) collectProject = new Function('$', 'state', 'return (' + cSrc + ');')(
      function () { return null; }, { ttsLang: 'ur', voiceId: 'edge:ur-PK-AsadNeural', lang: 'en' });
  } catch (e) { collectProject = null; }
  t('project_collect_grabbed', typeof collectProject === 'function');
  if (typeof collectProject === 'function') {
    var cp = collectProject();
    t('project_collect_app', cp.app === 'voicesync-studio');
    t('project_collect_v', cp.v === 1);
    t('project_collect_fields', cp.ttsLang === 'ur' && cp.voiceId === 'edge:ur-PK-AsadNeural' &&
      cp.uiLang === 'en' && typeof cp.text === 'string');
    t('project_collect_savedAt', !isNaN(Date.parse(cp.savedAt)));
  }
  // applyProject validates untrusted fields before touching state (schema contract)
  t('project_apply_validates_ttsLang', appjs.indexOf("typeof p.ttsLang === 'string'") !== -1);
  t('project_apply_validates_voiceId', appjs.indexOf("typeof p.voiceId === 'string'") !== -1);
  t('project_apply_validates_uiLang', appjs.indexOf("p.uiLang === 'en' || p.uiLang === 'ur'") !== -1);

  /* Team 3 QA: pause/resume state-machine — pure-logic unit tests plus
     source-level transition assertions (harness style). */
  var pauseSrc = grabSrc(appjs, 'pausePlayback');
  var resumeSrc = grabSrc(appjs, 'resumePlayback');
  var stopAllSrc = grabSrc(appjs, 'stopAll');
  t('pause_fns_grabbed', typeof pauseSrc === 'string' && typeof resumeSrc === 'string' && typeof stopAllSrc === 'string');
  // Pause sets pausedKind per playback path (pause is a toggle to resume).
  ['audioEl', 'previewEl', 'previewCtx', 'audioCtx', 'speech', 'audioPlayer'].forEach(function (k) {
    t('pause_sets_' + k, !!pauseSrc && pauseSrc.indexOf("state.pausedKind = '" + k + "'") !== -1);
  });
  t('pause_toggle_resume', !!pauseSrc && pauseSrc.indexOf('if (state.pausedKind) { resumePlayback(); return; }') !== -1);
  // stopAll resets the whole state machine.
  t('stopAll_resets_pausedKind', !!stopAllSrc && stopAllSrc.indexOf('state.pausedKind = null') !== -1);
  // Resume clears pausedKind ONLY on success; failure restores it (retryable).
  t('resume_done_clears', !!resumeSrc && /var done = function \(\) \{\s*\n\s*state\.pausedKind = null;/.test(resumeSrc));
  t('resume_fail_restores', !!resumeSrc && resumeSrc.indexOf('state.pausedKind = k;') !== -1);
  // settleResume is pure — unit-test it for real.
  var settleSrc = grabSrc(appjs, 'settleResume');
  var settleResumeFn = null;
  try { if (settleSrc) settleResumeFn = new Function('return (' + settleSrc + ');')(); } catch (e) {}
  t('settleResume_grabbed', typeof settleResumeFn === 'function');
  if (typeof settleResumeFn === 'function') {
    var settleLog = [];
    var tick = function () { return new Promise(function (r) { setTimeout(r, 10); }); };
    settleResumeFn(Promise.resolve(), function () { settleLog.push('done'); }, function () { settleLog.push('fail'); });
    await tick();
    settleResumeFn(Promise.reject(), function () { settleLog.push('done'); }, function () { settleLog.push('fail'); });
    await tick();
    settleResumeFn(null, function () { settleLog.push('done'); }, function () { settleLog.push('fail'); });
    t('settleResume_resolve_clears', settleLog[0] === 'done');
    t('settleResume_reject_restores', settleLog[1] === 'fail');
    t('settleResume_nonpromise_clears', settleLog[2] === 'done');
  }

  /* Team 3 QA: engine-fallback parity — previewVoice vs onGenerate must use
     the same fallback computation (same helper, same i18n note, same badge). */
  var prevSrc = grabSrc(appjs, 'previewVoice');
  var genSrc = grabSrc(appjs, 'onGenerate');
  t('fallback_fns_grabbed', typeof prevSrc === 'string' && typeof genSrc === 'string');
  // Both derive the wanted engine through parseVoiceId (M40-light).
  t('fallback_preview_parseVoiceId', !!prevSrc && prevSrc.indexOf('parseVoiceId(vid).engine') !== -1);
  t('fallback_onGenerate_parseVoiceId', !!genSrc && genSrc.indexOf('parseVoiceId(state.voiceId).engine') !== -1);
  // Both build the note from the same i18n key.
  t('fallback_preview_same_key', !!prevSrc && prevSrc.indexOf("t('engineFallback')") !== -1);
  t('fallback_onGenerate_same_key', !!genSrc && genSrc.indexOf("t('engineFallback')") !== -1);
  t('fallback_key_used_twice', (appjs.match(/t\('engineFallback'\)/g) || []).length >= 2);
  // Both surface it through the shared engine badge.
  t('fallback_preview_badge', !!prevSrc && prevSrc.indexOf('updateEngineBadge(state.previewEngine, previewEngineNote)') !== -1);
  t('fallback_onGenerate_badge', !!genSrc && genSrc.indexOf('updateEngineBadge()') !== -1);
  // Both compare against the ACTUAL engine that spoke (no silent substitution).
  t('fallback_preview_compares_engine', !!prevSrc && prevSrc.indexOf('r.engine !== wantEngine') !== -1);
  t('fallback_onGenerate_compares_engine', !!genSrc && genSrc.indexOf('result.engine !== wantEngine') !== -1);

  console.log('\n==== 1000-TEST QA RESULT ====');
  console.log('PASSED: ' + pass + ' / ' + n);
  if (fails.length) { console.log('FAILED (' + fails.length + '):'); fails.forEach(function (f) { console.log('  ' + f); }); }
  process.exit(fails.length ? 1 : 0);
}
main().catch(function (e) { console.error('HARNESS ERROR:', e && e.message); process.exit(2); });
