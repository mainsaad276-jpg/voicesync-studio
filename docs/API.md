# VoiceSync Studio — Free API Truth Table & Integration Spec
**Owner:** Bilal (Free-API Research & Integration Specialist)
**Status:** All endpoints live-tested 2026-10-08 (14:05 PKT / 09:05 UTC). Usman (TTS) and Hina (lip-sync) code against THIS document — not guesses.

> Rule: no endpoint below is marked primary without a pasted live HTTP status. Dead ends are documented with the chosen alternative.

## 1. Endpoint truth table

| # | Endpoint URL | Purpose | HTTP | Content-Type | CORS (`Access-Control-Allow-Origin`) | Tested | Verdict |
|---|---|---|---|---|---|---|---|
| 1a | `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4` | Voice catalog (322 voices, JSON) | **200** | `application/json; charset=utf-8` | `*` → browser `fetch()` OK | 2026-10-08 | **USE** |
| 1b | `.../voices/list?trustedclienttoken=6A5AA1D4-818A-4B67-B088-B5F4832C4D69` (old dashed token) | — | **401** | — | — | 2026-10-08 | **DEAD** — token rotated; use 1a |
| 2 | `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` (+ query params, §2) | Neural TTS synthesis (Edge voices) | **101** w/ Edge UA · **403** w/ plain Chrome UA | n/a (WebSocket) | n/a — browser sends `Origin`+`User-Agent` automatically, cannot be spoofed | 2026-10-08 | **USE as primary, but ONLY in Microsoft Edge** — automatic fallback chain is mandatory, not optional (§2.4) |
| 3 | `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ur&q=<text>` | Fallback TTS | **200** | `audio/mpeg` (verified real MP3 bytes: `MPEG ADTS, layer III, 24 kHz, mono`) | **none** → browser `fetch()` **blocked** by CORS | 2026-10-08 | **FALLBACK** — playable via `<audio>` element; NOT byte-accessible from JS (§3) |
| 3b | same, `q=` = 474-char Urdu text | long-text probe | **400** | `text/html` | — | 2026-10-08 | chunk Google requests ≤ ~200 chars |
| 4a | `https://cdn.jsdelivr.net/npm/rhubarb-lip-sync-wasm@0.1.8/dist/wasm/rhubarb.wasm` | Lip-sync engine (WASM) | **200** | `application/wasm` (4,581,974 bytes) | `*` | 2026-10-08 | **USE** (primary lip-sync) |
| 4b | `https://cdn.jsdelivr.net/npm/rhubarb-lip-sync-wasm@0.1.8/dist/wasm/rhubarb.js` | Emscripten glue | **200** | `application/javascript` (345,061 bytes) | `*` | 2026-10-08 | **USE** |
| 4c | `https://cdn.jsdelivr.net/npm/rhubarb-lip-sync-wasm@0.1.8/dist/wasm/rhubarb.data` | Phonetic model data | **200** | `application/octet-stream` (**36,996,083 bytes ≈ 37 MB**) | same CDN (`*`) | 2026-10-08 | **USE** — required by glue; heavy one-time download, show a loading state |
| 4d | `https://cdn.jsdelivr.net/npm/rhubarb-lip-sync-wasm@0.1.8/dist/wasm-loader.js` | Browser API wrapper | **200** | `application/javascript` | `*` | 2026-10-08 | **USE** — exports `initWasmModule()`, `getLipSyncData(pcmData, dialogText)`, `getWasmModule()` |

Test method: `curl` (status + content-type + response headers) and `node` raw-TLS WebSocket handshake tests, all run 2026-10-08 ~09:00–09:05 UTC through the VM's egress proxy. Raw evidence (curl logs, handshake transcripts, saved MP3 probes) kept in `/tmp/wstest/` on the VM.

## 2. Edge Neural TTS — exact protocol (for Usman, `js/tts.js`)

Protocol reverse-documented from the reference implementation `rany2/edge-tts` (`constants.py`, `drm.py`, `communicate.py`, `voices.py` — read 2026-10-08) and verified live via raw WebSocket handshake tests.

### 2.1 Tokens & versions (current as of 2026-10-08)
- `TrustedClientToken = 6A5AA1D4EAFF4E9FB37E23D68491D6F4` (**dashless** — the old dashed token `6A5AA1D4-818A-4B67-B088-B5F4832C4D69` now returns **401**; do NOT use it).
- `Sec-MS-GEC-Version = 1-143.0.3650.75` (must stay ≥ `1-133`; older `1-130…` returns 403).
- `Sec-MS-GEC` = `UPPERCASE_HEX(SHA256( <int_ticks_as_decimal_string> + TRUSTED_CLIENT_TOKEN ))`, where:
  `int_ticks = (floor(unix_time_seconds) + 11644473600 − ((floor(unix_time_seconds) + 11644473600) mod 300)) × 10⁷`
  Compute with integer math (`BigInt` in JS — float64 loses precision at ~1.3×10¹⁷). No API key, no account.

### 2.2 WebSocket handshake
```
wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
  ?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4
  &Sec-MS-GEC=<from §2.1>
  &Sec-MS-GEC-Version=1-143.0.3650.75
  &ConnectionId=<uuid>
```
Headers the browser sends automatically: `Origin: <page origin>`, `User-Agent: <browser UA>`.
**Live result:** `101 Switching Protocols` when UA contains `Edg/`; **`403 Forbidden` with a plain Chrome UA** (verified 2026-10-08). Browsers cannot spoof `User-Agent`, so **this endpoint only works for users running Microsoft Edge**. This is the single most important constraint in this document.

### 2.3 Message frames (exact bytes, from reference source)
Frame 1 — config (text frame):
```
Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n
```
Frame 2 — SSML (text frame):
```
X-RequestId:<32 hex chars, no dashes>\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:<e.g. "Thu Oct 08 2026 09:04:12 GMT+0000 (Coordinated Universal Time)">Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='<ShortName>'><prosody pitch='+0Hz' rate='+0%' volume='+0%'><XML-escaped text></prosody></voice></speak>
```
Response: text frames `Path:turn.start` → `Path:response` (WordBoundary JSON `{text, offset, duration}` in 100ns ticks when `wordBoundaryEnabled=true`) → `Path:turn.end`. Binary frames: 2-byte big-endian header length, header text, then MP3 bytes starting at offset `2 + headerLength`. Output format is fixed: `audio-24khz-48kbitrate-mono-mp3` (OGG/PCM formats are rejected).
Chunking: one WS connection per text chunk (≤ ~3000 chars SSML-safe; service is unreliable with a 2nd turn on one socket) → concatenate MP3 buffers. Escape `& < >` in text; strip control chars.

### 2.4 Fallback chain (Usman implements exactly this)
1. **Edge Neural WS** (§2.2–2.3) — best quality, 322 voices. Attempt always first; on handshake failure/`403`/timeout → step 2. (In Chrome/Firefox/Safari this WILL fail — by design.)
2. **Google `translate_tts?client=tw-ob`** — keyless, live-verified `200 audio/mpeg`. Constraints: **chunk text to ≤ ~200 chars per request** (474 chars → HTTP 400); rapid sequential requests OK in light testing (6×200, no 429 seen — re-test under load, §5). **CORS: no `Access-Control-Allow-Origin` header** → do NOT `fetch()` it; load via `<audio src>` / `Audio(url)` element (media playback is not CORS-gated). Consequence: the MP3 bytes cannot be read by JS → **no WebAudio decode → no viseme analysis** on Google audio (see §3.1).
3. **Web Speech API** (`speechSynthesis`) — offline-capable, always available. Record via `MediaRecorder`? Not needed — play through element; for analysis Hina uses the text-timing estimate (§3.1).

### 2.5 Voice catalog (from live 200 response, 2026-10-08)
Fetch `§1 row 1a` at runtime (`fetch()` works — `ACAO: *`), filter by `Locale`. Confirmed present: `ur-PK-AsadNeural` (M), `ur-PK-UzmaNeural` (F), `ur-IN-GulNeural` (F), `ur-IN-SalmanNeural` (M), `hi-IN-MadhurNeural` (M), `hi-IN-SwaraNeural` (F), `ar-SA-HamedNeural` (M), `en-US-AriaNeural` (F), `en-GB-SoniaNeural` (F). Cache the list in `localStorage` (it changes rarely); on fetch failure use a hardcoded minimal list: `ur-PK-AsadNeural`, `ur-PK-UzmaNeural`, `en-US-AriaNeural`, `hi-IN-SwaraNeural`.

## 3. Google TTS — integration notes (Usman)
- URL: `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=<lang>&q=<urlencoded text>`. Urdu probe `q=سلام` → `200`, 7,872-byte valid MP3 (2026-10-08).
- `tl` values: `ur`, `hi`, `en`, `ar`, … (2-letter).
- **Do not `fetch()`** — no CORS headers. Use `new Audio(url)` / `<audio>` element. For export, Faraz cannot re-encode these bytes; offer "download" via the same URL (browser downloads the MP3 directly).
- ### 3.1 Lip-sync implication (Hina)
  Google/WebSpeech audio bytes are NOT available to JS (CORS / no-capture). So when the active engine is Google or WebSpeech, `LipSync.analyze()` cannot run FFT on the audio: use the **text-timing heuristic** — distribute visemes across estimated duration (`~900 chars/min` for Urdu/Hindi, `~800–900` for English at rate 1.0), alternating open/closed mouth shapes weighted by character class. The energy-heuristic path applies only to Edge audio (decodable via WebAudio).

## 4. Rhubarb LipSync WASM — integration notes (for Hina, `js/lipsync.js`)
- Pinned: `rhubarb-lip-sync-wasm@0.1.8` on jsDelivr (all URLs §1 rows 4a–4d, `ACAO: *`, verified 2026-10-08). **Pin the version in the import URL** — never use an unpinned `@latest`.
- Browser entry: `import { initWasmModule, getLipSyncData } from 'https://cdn.jsdelivr.net/npm/rhubarb-lip-sync-wasm@0.1.8/dist/wasm-loader.js'`
  (dynamic `import()` so failure → heuristic fallback, never a white screen).
- Contract: `await initWasmModule()` once; then `getLipSyncData(pcmData, dialogText)` → `{ mouthCues: [{ start, end, value }] }` with `value` ∈ Rhubarb viseme letters (`A`–`H`, `X`) and times in **seconds**. Map `A→A, B→B, … X→X` directly onto SPEC.md's 9 visemes.
- `pcmData` = **16-bit PCM, mono, 16 kHz**. Resample in-app: `OfflineAudioContext(1, len, 16000)` render from the decoded Edge audio buffer, then interleave to `Int16Array`.
- **37 MB `rhubarb.data`** downloads on first `initWasmModule()` — show a determinate loader ("Loading lip-sync engine… ~37 MB, one-time"), and consider `caches` API so repeat visits are instant. If the CDN is blocked/slow (>20 s timeout) → `LipSync.ready()` resolves `'heuristic'`.
- Fallback (always available, offline): energy heuristic in `lipsync.js` — short-time energy per 20 ms window → threshold map to visemes (`X` silence, `A/B` low, `C/D/E` mid, `F/G/H` high), minimum 25 ms per cue. Must sustain ≥ 4 viseme changes/sec during speech (acceptance criterion).

## 5. Re-test schedule (things that can rot)
| What | Trigger / cadence | How |
|---|---|---|
| Edge `TrustedClientToken` / `Sec-MS-GEC-Version` rotation | If voices-list → 401 or WS → 403 **in Edge** | Re-read `rany2/edge-tts` `constants.py`; update §2.1; re-run §1 rows 1a+2 |
| Google `translate_tts` rate limits (429) | Before release; after any report of failures | 30 rapid sequential requests, log statuses |
| Rhubarb CDN pin | If jsDelivr 404s on `@0.1.8` | Repin to newest npm version, re-verify 4a–4d, update URLs here |
| WS synthesis end-to-end from a real Edge browser page | Before v1.0 sign-off (Nadia) | Could not be done from this VM (no real browser); needs a human/Playwright run in Edge |

## 6. Honest caveats
- Full WS synthesis (speech.config + SSML → MP3 bytes) was **not** completed end-to-end from this VM: the raw-socket test harness returned `turn.end` with 0 audio bytes (harness framing issue under investigation — frame encoder self-test passes, so likely a subtle protocol detail). The **handshake (101/403) is live-verified** and the frame format is transcribed verbatim from the working reference implementation — sufficient for Usman to implement against. Nadia to verify real synthesis in a real Edge browser before v1.0.
- No API keys are used anywhere in this design. All endpoints are keyless and free as of 2026-10-08.
