# Faraz — Export & Storage Engineer — progress
**Date:** 2026-10-08 | **File:** `js/exporter.js` | **Status: DONE, verified**

## What I built
Implemented the exact SPEC.md contract, nothing more, nothing less:

- `Exporter.downloadAudio(blob, filename)` — triggers a real browser download via
  `URL.createObjectURL` + temp `<a download>`; object URL revoked after 4 s.
- `Exporter.encodeWAV(audioBuffer) -> Blob` — 16-bit PCM RIFF/WAV, keeps the
  buffer's sampleRate, preserves mono/stereo (downmixes >2 channels to first 2).
- `Exporter.recordVideo(canvas, audioURL, {width,height}) -> Promise<Blob>` —
  `canvas.captureStream(30)` + `MediaRecorder` → WebM. Starts recording, plays
  the voiceover `<audio>`, stops on audio `ended` (3-min safety cap). The
  voiceover is **muxed into the WebM** via a `MediaStreamDestination` track, so
  the exported video actually has sound (best-effort: falls back to video-only
  instead of failing). `{width,height}` drive the video bitrate (clamped
  0.5–8 Mbps); output resolution is the canvas's own. Rejects with a clean,
  user-friendly Error when `MediaRecorder`/`captureStream` is missing — never
  crashes. `{durationMs}` fallback records a silent clip when no `audioURL`.
- `Exporter.saveProject(obj)` — JSON file download **and** localStorage copy
  (`voicesync-studio.project.v1`); survives private-mode storage failure via the
  file path. `Exporter.loadProject()` — parses the localStorage copy, returns
  `null` when nothing saved (no crash).

The WAV encoder is factored as pure logic (`_encodeWAVBytes`, no browser
globals), exposed for node tests via `module.exports`; the browser surface is a
plain `window.Exporter` global for app.js.

## Verification (real commands, real output)
`node --check js/exporter.js` → `SYNTAX OK`

Node test (synthetic stereo AudioBuffer-like: 4410 frames @ 44100 Hz; mono
case; bad-input case; MediaRecorder-missing case — test at `/tmp/faraz-test-exporter.js`):

```
ALL ASSERTIONS PASSED
  - WAV: 17684 bytes (4410 stereo frames @ 44100 Hz), RIFF/WAVEfmt /data chunks valid
  - data chunk length = 17640 bytes (matches samples x channels x 2)
  - mono buffer encodes correctly
  - bad input -> clean Error (no crash)
  - recordVideo w/o MediaRecorder -> clean user-friendly Error
```

Assertions checked: starts with `RIFF`, contains `WAVEfmt `, `data` chunk
present, RIFF chunk size = 36 + dataLen, format = PCM(1), channels/samplerate
preserved, data chunk length = samples × channels × 2, PCM peak is real audio
(not silence).

Extra proof — decoded my encoder's output with `ffprobe`:
`codec_name=pcm_s16le, sample_rate=44100, channels=1, bits_per_sample=16`
→ the WAV is genuinely playable, not just header-shaped.

## Honest browser limits (for Daniyal / QA)
- **WebM export = Chrome/Edge (desktop) only.** Firefox has MediaRecorder but
  `canvas.captureStream` audio muxing is flaky; Safari has no MediaRecorder at
  all → those users get the clean error message and can still export WAV.
- **Audio-in-video needs a user gesture**: `audioEl.play()` from a non-gesture
  context may be blocked → recordVideo rejects with a clear message; the
  export button click IS a gesture, so normal use is fine.
- **`file://` note:** everything here works over `file://`; blob URLs are
  same-origin so the audio mux is not CORS-tainted. If the voiceover ever
  comes from a cross-origin URL instead of a blob, the mux silently degrades
  to video-only (by design, logged to console).
- **No MP3 export in Phase 1.** There is no key-free, dependency-free MP3
  encoder for a zero-build static page; WAV is lossless and plays everywhere.
  MP3 is a Daniyal call for Phase 2 (would need an encoder lib).
- `loadProject()` reads the **localStorage** copy only; the downloaded JSON
  file is a backup/portable copy — there is no file-picker import yet (not in
  the SPEC contract; Daniyal can request it).
- Video export was **not** exercised in a real browser from this VM (no live
  browser on this subagent); Nadia should click-test it in Chrome per the QA
  checklist.

## For app.js wiring (Daniyal)
`Exporter.recordVideo(Avatar.getCanvas(), ttsResult.url, { width: 720, height: 1280 })`
for portrait Shorts; `Exporter.encodeWAV(ttsResult.audioBuffer)` then
`Exporter.downloadAudio(blob, 'my-voiceover.wav')` for audio.
