/*
 * VoiceSync Studio: runtime settings (public, no secrets here).
 * ttsProxy: address of the Cloudflare Worker that calls Azure AI Speech
 * (worker/). Leave empty to use only the free fallback engines.
 */
window.VS_CONFIG = window.VS_CONFIG || {
  ttsProxy: '',

  /*
   * Pro / free tier (see js/pro.js).
   * enforce: false  -> EVERYTHING FREE (current). Pro features only show a chip.
   * enforce: true   -> free users get the limits below; Pro users get all.
   * Before setting true, Pro purchases must be verified on a server
   * (Google Play Billing for the Android app).
   */
  pro: {
    enforce: false,
    showBadges: true,
    freeMaxChars: 1500,         // max characters per voiceover on free plan
    freeDailyGenerations: 15,   // voiceovers per day on free plan
    watermarkFreeVideos: true,  // "Made with VoiceSync" on free-plan videos
    proFeatures: ['longText', 'unlimited', 'noWatermark', 'dialogue', 'music', 'shorts', 'clone'],
    upgradeUrl: ''              // payment / Play Store page, later
  }
};
