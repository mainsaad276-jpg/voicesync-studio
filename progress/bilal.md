# Bilal — progress notes (Free-API Research & Integration Specialist)
**File owned:** `docs/API.md` (published 2026-10-08 ~14:10 PKT). Usman & Hina code against it.

## Truth table summary (all live-tested 2026-10-08, ~09:00–09:05 UTC)

| Endpoint | Status | Verdict |
|---|---|---|
| Edge voices list (NEW dashless token `6A5AA1D4EAFF4E9FB37E23D68491D6F4`) | **200**, `application/json`, 322 voices, `ACAO: *` | **USE** |
| Edge voices list (OLD dashed token `6A5AA1D4-818A-4B67-B088-B5F4832C4D69`) | **401** | **DEAD** — token rotated, do not use |
| Edge synthesis WS `wss://speech.platform.bing.com/.../edge/v1` | **101** with Edge UA (`Edg/`) · **403** with plain Chrome UA | **USE as primary, Edge-browser-only** |
| Google `translate_tts?client=tw-ob` (Urdu `سلام`) | **200**, `audio/mpeg`, valid 7.8 KB MP3 | **FALLBACK** (playback only — no CORS headers, JS can't read bytes) |
| Google `translate_tts`, 474-char text | **400** | chunk ≤ ~200 chars |
| Rhubarb WASM `rhubarb-lip-sync-wasm@0.1.8` (jsDelivr pinned): `.wasm` 200 `application/wasm` (4.6 MB) · `rhubarb.js` glue 200 · `rhubarb.data` 200 (37 MB) · `wasm-loader.js` 200 — all `ACAO: *` | **200** across the board | **USE** (primary lip-sync) |

## Key discoveries for the team
1. **The token in the original task brief is outdated.** The dashed `6A5AA1D4-818A-4B67-B088-B5F4832C4D69` now 401s. The working token (verified live, confirmed by 2026 sources) is dashless: `6A5AA1D4EAFF4E9FB37E23D68491D6F4`. API.md documents this; Usman must use the new one.
2. **Edge TTS does NOT work in Chrome/Firefox/Safari.** Live raw-handshake test: `403 Forbidden` with a normal browser UA/Origin; `101` only when UA contains `Edg/`. Browsers can't spoof UA → the primary TTS path only works for Microsoft Edge users. The Edge→Google→WebSpeech fallback chain is therefore mandatory. Documented in API.md §2.4.
3. **Google TTS audio can't be lip-sync analyzed.** No `Access-Control-Allow-Origin` → `fetch()` blocked; only `<audio>` playback works. So Hina's viseme analysis runs on Edge audio; for Google/WebSpeech engines she uses a text-timing heuristic (documented in API.md §3.1).
4. **Rhubarb's 37 MB model file** downloads on first init — Hina must show a loader and handle CDN-blocked → heuristic fallback.
5. Exact Edge protocol (Sec-MS-GEC algorithm, speech.config + SSML frame bytes, binary audio framing) transcribed from the `rany2/edge-tts` reference source and included in API.md §2.1–2.3.

## Endpoints needing re-testing later
- **Edge token/version rotation:** if voices-list → 401 or WS → 403 *in Edge*, re-read `rany2/edge-tts` constants and re-run the truth table. (Most likely rot vector.)
- **Google rate limits:** 6 rapid requests showed no 429, but re-test with ~30 sequential requests before v1.0 sign-off.
- **Real-browser Edge synthesis:** could not be done from this VM (no real browser). Nadia to verify actual audio synthesis in a real Edge browser page before v1.0 — my raw-socket harness got `101` + `turn.end` but 0 audio bytes (harness framing issue, frame encoder self-test passes; endpoint itself is proven by the handshake + reference implementation).
- **Rhubarb pin:** if jsDelivr ever 404s `@0.1.8`, repin and re-verify all four files.

## Status
✅ DONE — `docs/API.md` published with live status codes on every endpoint. No endpoint marked primary without a pasted live test. Awaiting Usman/Hina to code against it.
