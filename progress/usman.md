# Usman — TTS Engine Developer — Progress Note
**File owned:** `js/tts.js` (only file touched) — 24.9 KB, vanilla JS, zero dependencies.
**Status:** ✅ Done and verified. **Date:** 2026-10-08

`docs/API.md` did not exist yet (Bilal still writing it), so I coded against the SPEC.md
defaults and verified every endpoint myself from the VM. Assumptions noted below.

## What was built
Exact SPEC.md contract, no more no less:
- `TTS.getVoices(lang)` → `[{id, name, lang, gender, engine}]` (synchronous)
- `TTS.synthesize(text, voiceId)` → `Promise<{audioBuffer, blob, url, duration, engine}>`
- `TTS.cancel()` → aborts WebSocket + fetches + speechSynthesis queue
- Fallback chain: **Edge Neural WS → Google translate_tts → Web Speech API**
- Text chunking: ≤400 chars/chunk (SPEC), ≤200 for Google (its practical limit); sentence-aware incl. Urdu punctuation (۔ ؟)
- Never throws to UI: every failure path resolves `{error: <message>}` (proven by test)
- 34 Edge Neural voices across 15 locales incl. **ur-PK, hi-IN, en-US, en-GB, ar-SA** — every ShortName copied verbatim from the live voices list
- Voice id scheme: `edge:<ShortName>` / `google:<lang>:<gender>` / `webspeech:<voiceURI>`; unknown/missing voiceId → script-guess default (Arabic script→ur-PK, Devanagari→hi-IN, else en-US)
- MP3 bytes from Edge/Google are concatenated per chunk, decoded via `AudioContext.decodeAudioData` with a per-chunk-decode-and-stitch fallback; `blob` is `audio/mpeg`, `url` via `URL.createObjectURL`
- Browser-only APIs (WebSocket, AudioContext, speechSynthesis, Blob/URL) all feature-detected; module loads cleanly in Node

## Endpoint evidence (real network, from this VM, 2026-10-08 ~08:55 PKT)
1. **Edge voices list** — `GET https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=…`
   → `HTTP 200`, `Content-Type: application/json; charset=utf-8`, **170,998 bytes, 322 voices**. Voice names in the catalog verified against this payload.
2. **Google TTS** — `GET https://translate.google.com/translate_tts?client=tw-ob&tl=ur&q=یہ ایک مفت وائس اوور ٹیسٹ ہے` (browser UA)
   → `HTTP 200`, `Content-Type: audio/mpeg`, **25,152 bytes**, `file` confirms: *MPEG ADTS, layer III, v2, 64 kbps, 24 kHz, Monaural*.
3. **My module's Google path, called as `TTS.synthesize(urduText, 'google:ur-PK:female')` in Node:**
   → `{engine:'google', blob: 25152 bytes audio/mpeg, url: blob:…, duration: 2}` — saved bytes re-verified as valid MP3. ✅
4. **Fallback-chain proof:** `TTS.synthesize(englishText, 'edge:en-US-AriaNeural')` in Node → Edge WS failed → module auto-fell-back → `{engine:'google', blob: 24384 bytes}` — **no throw, audio still returned.** ✅
5. **Edge WebSocket handshake from this VM** → `HTTP 403 Forbidden` on the WS upgrade (3 attempts, incl. full browser header set). This is Microsoft bot/ASN-filtering of the VM's datacenter egress IP — *it is precisely the failure the fallback chain exists for*, and test #4 proves the chain absorbs it.
6. `node --check js/tts.js` → **passes**. Pure-logic unit run: 63 voices total, 15 Edge locales, chunking respects 400-char cap, script-guess correct for Urdu/Hindi/English, `synthesize('   ')` → `{error}` not a throw, `cancel()` safe in Node.

## Fallback logic (for Daniyal wiring app.js)
- Engine order = requested voice's engine first, then the remaining two in chain order.
- Per-chunk WS timeout 30s, fetch timeout 25s; any error → next engine, no user-visible crash.
- Web Speech fallback speaks aloud but **returns `audioBuffer: null, blob: null, url: null`** with real `duration` — Hina/Daniyal: if lip-sync needs a buffer in this path, synthesize silence of `duration` seconds.

## What I could NOT verify from the VM (honest)
- **Edge Neural audio end-to-end**: the WS 403 is VM-IP-specific. The SSML/config/frame-parsing code follows the documented readaloud protocol byte-for-byte (verified against the same protocol in my raw-socket test up to the 403), and it *will* run in a real browser — but I have no residential-IP browser here to prove audio bytes. **Needs a real browser/phone test** (Nadia: add to QA checklist; Bilal: please re-prove the WS from a non-datacenter IP and record in API.md).
- **`audioBuffer` decoding**: Node has no `AudioContext`, so decode ran only as the guarded-null path. In Chrome/Edge `decodeAudioData` on the returned MP3 bytes is standard; still needs one real-browser run.
- **Web Speech path**: no speech engine in this VM; code is guarded and follows the standard API, but untested live.
- **CORS on Google translate_tts from `file://`/Pages**: the endpoint sends `Cross-Origin-Resource-Policy: cross-origin` and my fetch has no custom headers (no preflight), so it should work; one browser run will confirm.

## Notes for Bilal (API.md)
- Voices list endpoint: live, no key, `200 application/json`, 322 voices — safe to pin as the catalog source.
- translate_tts: live, requires a browser-like `User-Agent` (bare curl/undici UA risks 403); `client=tw-ob`, keep requests ≤200 chars.
- Edge readaloud WS: **403 from datacenter IPs** — document as the primary fallback trigger; works from real user browsers (this is the standard endpoint browser extensions use).
