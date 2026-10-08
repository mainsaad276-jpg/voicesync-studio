# Daniyal — Round 2 INTEGRATION — Progress Note
**Date:** 2026-10-08 · **Status:** ✅ DONE

## Bilal's 4 critical findings — reconciled
1. **Edge token rotated** — checked: `js/tts.js` already uses the dashless token `6A5AA1D4EAFF4E9FB37E23D68491D6F4`. The dashed token appears only in `docs/API.md` as the documented-dead token. **No fix needed** (verified by repo-wide grep).
2. **Edge WS is Edge-browser-only (403 in Chrome)** — confirmed in code: `_runEngine('edge')` rejects on any WS failure and `synthesize()` silently advances the chain (Usman's design). **No redesign**; behavior verified by the wiring test (edge attempt fails fast in Node → Google path runs).
3. **Google translate_tts: no CORS → `fetch()` blocked in browsers** — **FIXED**: `js/tts.js` Google path split. Browser (`typeof Audio !== 'undefined'`): `<audio>`-element playback returning `{audioBuffer:null, blob:null, url, urls, duration, engine:'google'}` (webspeech-shaped result). Node: keeps the fetch/byte path so the module stays verifiable off-browser. `js/app.js` gained `startGooglePlayback()` (chunk playlist + accumulating virtual clock + `LipSync.makeTalkingCues` mouth — never a dead mouth), Google branch in `onGenerate()`/`replay()`, and MP3-via-URL export per API.md §3. WAV/video export stay gated with a clear message (no bytes exist).
4. **Rhubarb 37 MB model download** — **FIXED**: `app.js` `probeLipSync()` + `getCues()` show "Loading lip-sync engine (one-time download)…" on the status line when init exceeds 2 s (Hina's 25 s timeout does the honest fallback).

## Integration bugs found & fixed (all with evidence)
- **INT-01 (CRITICAL):** `index.html` ids didn't match SPEC §3.6 — kebab-case ids, no Generate button, transport dead, `moduleStatus`/`fileLoad`/`timeLabel`/`btnWav`/`btnMp3` missing, `ttsLang` had 5 locales vs contract `ur|en`. Fixed: all 20 SPEC ids exact (script-verified, 0 stale ids).
- **INT-02 (CRITICAL):** `LipSync.makeTalkingCues()` in SPEC contract + used by `app.js` but never implemented → dead mouth on Google/WebSpeech. Implemented (pure, deterministic, ≈8 visemes/sec).
- **INT-03 (MAJOR):** `TTS.getVoices('ur')` returned zero Edge voices (exact match vs SPEC prefix match). Fixed to prefix match.
- **INT-05/06 (MINOR):** Rhubarb loader message; `#progress` bar never animated (fixed in `startTimeline`).
- `js/i18n.js`: +3 keys (`btn_generate`, `btn_wav`, `btn_mp3`) en+ur — all 22 `data-i18n` keys verified en+ur.
- `SPEC.md`: TTS Google result shape documented.

## Verification evidence
- `node --check` on all 6 js files → PASS (app, tts, lipsync, avatar, exporter, i18n).
- SPEC §3.6 id check: 20/20 present, 0 stale kebab ids.
- **Full wiring test** `/tmp/daniyal2-wiring.js` — **31/31 PASSED** with REAL modules, stub DOM only. Trace: `TTS.synthesize → LipSync.makeTalkingCues → Avatar.speak → Audio.play:https://translate.google.com/…` — correct order, mouth moves, status flows generating→playing→done, replay works, WAV RIFF-valid, recordVideo rejects cleanly without MediaRecorder, project save/load roundtrips, ur toggle → `dir=rtl`.

## Not mine to touch (left alone)
`docs/API.md`, `docs/QA-CHECKLIST.md`, `README.md`, user guides — other members' files.

## Still open (not fixable from this VM — honestly flagged)
- Real-browser runs: Edge neural audio end-to-end, Google `<audio>` playback on Pages, on-screen viseme rate, 360px layout, desktop-Chrome WebM export, Rhubarb 37 MB first-load timing → Nadia's Group B, needs human/phone.
- GitHub push → blocked on user's OAuth (Imran ready).
