# Progress board — Muse aggregates from progress/<member>.md

Updated: 2026-10-08 (Daniyal round-2 INTEGRATION — all modules wired)

| # | Member | Task (owns) | Status |
|---|--------|-------------|--------|
| 1 | Daniyal | SPEC.md contracts, `js/app.js` orchestrator, release sign-off | **Done** — SPEC v1.1, `app.js` written, round-2 integration complete: 6 integration bugs found & fixed, full wiring test (31 checks) passed with real modules |
| 2 | Usman | `js/tts.js` — free TTS engine (Edge → Google → Web Speech) | **Done** — verified (live endpoint proofs; Edge WS 403-from-VM absorbed by fallback chain) |
| 3 | Hina | `js/lipsync.js` — Rhubarb WASM → energy heuristic | **Done** — verified (13 heuristic tests passed; WASM path browser-only) |
| 4 | Kamran | `js/avatar.js` — SVG character + canvas renderer | **Done** — verified (9 distinct visemes asserted) |
| 5 | Sana | `index.html`, `css/style.css`, `js/i18n.js` | **Done** — ids realigned to SPEC §3.6 in round 2 (was the INT-01 wiring break) |
| 6 | Bilal | `docs/API.md` — live proof for every free endpoint | **Done** — truth table published; 4 critical findings reconciled in round 2 |
| 7 | Faraz | `js/exporter.js` — WAV/MP3/WebM/project save-load | **Done** — verified (RIFF-valid WAV proven via ffprobe) |
| 8 | Nadia | `docs/QA-CHECKLIST.md`, `docs/BUGLOG.md` | **Pass 1 done** — final QA sign-off pending real-browser run (Group B) |
| 9 | Imran | git init, `.github/workflows/pages.yml`, GitHub push | **Done, push blocked** — awaiting user's GitHub OAuth |
| 10 | Rabia | `README.md`, `docs/USER-GUIDE.md`, `docs/USER-GUIDE-UR.md` | **Done** — 36/36 controls verified against real UI |

## Integration (round 2) — what changed
- `index.html`: all 20 SPEC §3.6 ids now exact (was kebab-case + missing Generate/moduleStatus/fileLoad/timeLabel/btnWav/btnMp3); `ttsLang` options fixed to `ur|en` per SPEC.
- `js/tts.js`: `getVoices()` now prefix-matches (`'ur'` → `ur-PK`/`ur-IN`); Google path split — browser uses `<audio>`-element playback (CORS blocks `fetch()`), Node keeps the fetch/byte path for testing.
- `js/lipsync.js`: added missing `LipSync.makeTalkingCues()` (SPEC contract) — Google/WebSpeech paths now move the mouth.
- `js/app.js`: Google playback path (chunk playlist + virtual clock), MP3-via-URL export, Rhubarb 37 MB loader status line, `#progress` bar now animates, `playToken` guards chunk chains.
- `js/i18n.js`: +3 keys (`btn_generate`, `btn_wav`, `btn_mp3`) in en+ur; all 22 `data-i18n` keys verified en+ur.
- `SPEC.md`: TTS Google result shape documented.
- Wiring test: `/tmp/daniyal2-wiring.js` — 31/31 passed with real modules (trace: `TTS.synthesize → LipSync.makeTalkingCues → Avatar.speak → Audio.play`).

## Blockers / notes
- **GitHub push**: blocked on user's GitHub OAuth (Imran ready: `git push -u origin main` once connected).
- **Real-browser verification**: Nadia's Group B (actual Edge/Chrome audio, viseme rate on screen, 360px layout, WebM export) needs a human/phone run — nothing faked.
- Website linking is Phase 2 — out of scope for this build (TEAM.md).
