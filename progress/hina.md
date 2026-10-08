# Hina — Lip-Sync Engine Developer — Progress
**File owned:** `js/lipsync.js` (only file touched) · **Status:** DONE, verified 2026-10-08

## What was built
`LipSync` module implementing exactly the SPEC.md contract:
- `LipSync.ready()` → `Promise<'rhubarb'|'heuristic'>`
- `LipSync.analyze(audioBuffer)` → `Promise<{cues:[{viseme,start,end}], duration, engine}>`
- Visemes: A,B,C,D,E,F,G,H,X (Rhubarb cue format `{viseme,start,end}`).
- Primary = Rhubarb LipSync WASM (open-source, free) from a pinned CDN; fallback = built-in
  energy/amplitude heuristic (deterministic, zero network). `ready()` honestly reports which
  engine will be used; `analyze()` never throws — any Rhubarb failure degrades to the heuristic.
- Accepts a real `AudioBuffer` or duck-typed buffer; downmixes to mono and resamples to 16 kHz
  (linear) before analysis. `node --check js/lipsync.js` → PASS.

## Engine choice evidence (CDN verification, 2026-10-08)
`docs/API.md` not published yet, so I verified candidates myself with curl (all live at 08:55 UTC):

| URL | Status | Content-Type | CORS |
|---|---|---|---|
| `https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/index.mjs` | **200 OK** | `application/javascript` | `access-control-allow-origin: *` |
| `https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/wasm/lip-sync-engine.wasm` | **200 OK** | `application/wasm` | `access-control-allow-origin: *` |
| `https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/wasm/lip-sync-engine.js` | **200 OK** | `application/javascript` | `access-control-allow-origin: *` |

**Pinned in code:** `https://cdn.jsdelivr.net/npm/lip-sync-engine@1.0.3/dist/index.mjs`
- Why this one: WASM port of Rhubarb Lip Sync (open-source, free), clean ESM entry, smaller
  WASM (1.9 MB vs 4.6 MB), exports verified by downloading the bundle: `LipSyncEngine`
  (with `getInstance`/`init`/`destroy`), standalone `analyze(pcm16, {sampleRate})`, and result
  shape `{mouthCues:[{start,end,value}], metadata:{duration}}` per its README.
- Rejected alternative: `rhubarb-lip-sync-wasm@0.1.8` (also 200 + CORS `*` on its
  `dist/wasm/rhubarb.wasm` and `dist/index.js`) — larger binary, no ESM entry verified.
- `ready()` loads the ESM via lazy dynamic import, calls `init()`, verifies an `analyze`
  export exists; a 25 s timeout means a dead/slow network resolves `'heuristic'`, never hangs.

## Test output (node, full contract test — pasted verbatim)
Test: synthesized a real 176,444-byte WAV in node (2.0 s @ 44100 Hz: 0–0.5 s vowel burst,
0.5–0.8 s silence, 0.8–1.5 s fricative-like burst, 1.5–2.0 s silence), decoded it back to
samples, and ran `LipSync.ready()` → `LipSync.analyze()`.

```
WAV: 176444 bytes, decoded 88200 samples @ 44100 Hz
  PASS: synthesized WAV has valid RIFF/WAVE header

[1] LipSync.ready()
  ready() -> "heuristic"
  PASS: ready() resolves to a valid engine id

[2] LipSync.analyze(decoded WAV)
  engine=heuristic duration=2.000 cues=33
  first 8 cues: A[0.00-0.04] D[0.04-0.08] E[0.08-0.12] A[0.12-0.16] D[0.16-0.20] E[0.20-0.24] A[0.24-0.28] D[0.28-0.32]
  PASS: analyze() engine matches ready() report
  PASS: duration ≈ 2s (got 2.000)
  PASS: cue list non-empty (33 cues)
  PASS: all visemes in {A..H,X}; times ascending, non-overlapping
  PASS: first cue starts at t=0
  PASS: last cue ends at duration
  PASS: silence region 0.5–0.8s -> all X (1 cues)
  PASS: >= 4 viseme changes/sec during speech burst (got 13 active cues in 0.5s)
  PASS: noisy burst produces fricative visemes F/C (got 18)

[3] resample 44100 -> 16000 Hz (audioBufferToPCM16)
  pcm length=32000 expected~32000
  PASS: resampled length correct

[4] heuristic unit on short buffer (0.2 s @ 16 kHz sine)
  cues=5 seq=ADEAD
  PASS: short-buffer heuristic returns sane cues

[5] empty buffer edge case
  PASS: empty audio -> single X cue, no throw

RESULT: ALL TESTS PASSED
```

## Limits / honest caveats (for Daniyal + Nadia)
1. **WASM path not runnable from this VM** — node can't fetch `https://` ESM, so the node test
   exercised the heuristic path (which is exactly the offline/no-network path the spec demands).
   In a real browser with network, `ready()` will attempt the Rhubarb load first. The code is
   defensive: missing `analyze` export, init timeout, or any mid-run Rhubarb error → heuristic.
2. The `lip-sync-engine` package ships a ~37 MB PocketSphinx model `.data` file that the
   Emscripten glue fetches at `init()` — primary-path analysis costs that one-time CDN download.
   If that proves too heavy/slow, ready()'s 25 s timeout covers it and Daniyal can flip the
   preference to heuristic-first.
3. File was kept parseable as a classic script (dynamic import hidden behind `new Function`);
   works from `file://` and `https://`. Pure helpers (`audioBufferToPCM16`, `heuristicCues`,
   `validViseme`) are exported under `module.exports._internal` for node tests only — invisible
   to the browser contract.
4. Test script kept at `/tmp/lipsync-test.js` (ephemeral); rerun with
   `node --check js/lipsync.js && node /tmp/lipsync-test.js` from the repo root.
