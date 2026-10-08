/*
 * VoiceSync Studio: runtime settings (public, no secrets here).
 * ttsProxy: address of the Cloudflare Worker that calls Azure AI Speech
 * (worker/). Leave empty to use only the free fallback engines.
 */
window.VS_CONFIG = window.VS_CONFIG || {
  ttsProxy: ''
};
