// VoiceSync Studio — Pro tier tests (js/pro.js). Run: node qa/qa-pro.js
var path = require('path');
var n = 0, fails = [];
function t(name, cond) { n++; if (!cond) fails.push(n + '. ' + name); }

globalThis.VS_CONFIG = { pro: { enforce: false } };
var Pro = require(path.join(__dirname, '..', 'js', 'pro.js'));

// 1) Everything free while enforce is false.
['longText', 'unlimited', 'noWatermark', 'dialogue', 'music', 'shorts', 'clone'].forEach(function (f) {
  t('free_now_can_' + f, Pro.can(f) === true);
});
t('free_now_long_text_ok', Pro.checkGenerate({ chars: 999999, dialogue: true }).ok === true);
t('free_now_no_watermark', Pro.shouldWatermark() === false);
for (var i = 0; i < 50; i++) Pro.recordGeneration();
t('free_now_no_daily_limit', Pro.checkGenerate({ chars: 10 }).ok === true);

// 2) Enforced: free users get limits.
VS_CONFIG.pro = { enforce: true, freeMaxChars: 100, freeDailyGenerations: 60 };
t('enforced_flag', Pro.enforced() === true);
t('enforced_dialogue_locked', Pro.can('dialogue') === false);
t('enforced_unknown_feature_free', Pro.can('somethingElse') === true);
t('enforced_long_text_blocked', Pro.checkGenerate({ chars: 101 }).reason === 'longText');
t('enforced_short_text_ok', Pro.checkGenerate({ chars: 100 }).ok === true);
t('enforced_dialogue_blocked', Pro.checkGenerate({ chars: 10, dialogue: true }).reason === 'dialogue');
for (var j = 0; j < 10; j++) Pro.recordGeneration();
t('enforced_daily_blocked', Pro.checkGenerate({ chars: 10 }).reason === 'unlimited');
t('enforced_watermark_on', Pro.shouldWatermark() === true);

// 3) Pro users: everything unlocked.
Pro.setPro(true);
t('pro_user_is_pro', Pro.isPro() === true);
t('pro_user_long_text', Pro.checkGenerate({ chars: 99999, dialogue: true }).ok === true);
t('pro_user_no_watermark', Pro.shouldWatermark() === false);
Pro.setPro(false);
t('pro_off_again', Pro.isPro() === false);

// 4) Feature can be moved back to free via config.
VS_CONFIG.pro = { enforce: true, proFeatures: ['clone'] };
t('custom_list_music_free', Pro.can('music') === true);
t('custom_list_clone_locked', Pro.can('clone') === false);

// 5) Watermark draws without throwing on a fake 2D context.
var calls = 0, ctx = { save: function () {}, restore: function () {}, measureText: function () { return { width: 100 }; },
  fillRect: function () { calls++; }, fillText: function () { calls++; } };
VS_CONFIG.pro = { enforce: true };
Pro.drawWatermark(ctx, 720, 1280);
t('watermark_drawn', calls === 2);

console.log('PRO QA: ' + (n - fails.length) + ' / ' + n);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
