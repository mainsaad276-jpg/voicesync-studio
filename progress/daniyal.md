# Daniyal — Team Lead / Architect — progress notes

## This pass (2026-10-08): SPEC fixes + js/app.js orchestrator

### What I built
`js/app.js` (21 KB, vanilla JS, IIFE, no build step) — the defensive orchestrator.
It feature-detects all five teammate modules (`window.TTS`, `window.LipSync`,
`window.Avatar`, `window.Exporter`, `window.I18N`) at boot and guards every call,
so a missing module shows a status line instead of crashing. Full flow wired
per SPEC contracts:

- text → `TTS.synthesize(text, voiceId)` → `{error}` shown, never throws to UI
- audio path: `LipSync.analyze(audioBuffer)` → `Avatar.speak(cues, audioEl)` → `Audio.play()`; timeline driven by rAF
- offline path: `result.utterance` (engine `webspeech`) → synthetic cues via `LipSync.makeTalkingCues(duration)` + virtual `{currentTime}` clock → `speechSynthesis.speak()`; export buttons show "no audio to export" message
- exports: `Exporter.encodeWAV` → `downloadAudio` (WAV); `synthesize` blob → `downloadAudio` (MP3); `Avatar.getCanvas()` + `Exporter.recordVideo(canvas, url, {width,height,onAudio})` → WebM (onAudio hook re-attaches `Avatar.speak` so exported video has moving lips)
- project: `Exporter.saveProject` / `loadProject(fileText)` with a manual JSON-download fallback when exporter.js is absent
- language: `#langToggle` → `I18N.apply(lang)`, persisted to localStorage; all app messages go through `t(key)` which prefers `I18N.strings` and falls back to English so the app works before i18n.js exists
- module status line in `#moduleStatus`: `Modules: TTS ✓ · LipSync ✓ (heuristic) · Avatar ✗ · …`; `LipSync.ready()` probed at boot

### SPEC.md contract fixes (my authority — fixes only, no scope change)
1. **TTS**: `getVoices` is now `Promise<[...]>` (was sync — impossible over network). Defined the two result shapes: audio path (`audioBuffer/blob/url/duration`) vs offline `webspeech` path (`{audioBuffer:null, blob:null, url:null, duration, utterance}`). `synthesize` never rejects — failures resolve `{error: string}`. Noted `blob` is the engine's native MP3 container → MP3 export needs no encoder.
2. **LipSync**: `analyze` never rejects (`{error}` → app uses static mouth). **Added** `LipSync.makeTalkingCues(durationSec)` — synthetic cue stream for the Web Speech path where no audio buffer exists (Hina to implement; trivial).
3. **Avatar**: `speak(cues, timeSrc)` — `timeSrc` may be `HTMLAudioElement` or any object with numeric `currentTime` (only property read). Manual `setViseme()` ignored while `speak()` active. Empty cues → static mouth, no crash. `getCanvas()` = live-rendered canvas.
4. **Exporter**: `recordVideo` opts gains optional `onAudio(audioEl)` hook (fires before playback so app.js attaches lip-sync). `loadProject(jsonText?)` — parses given text, else localStorage. `downloadAudio` documented as generic (WAV/MP3/WebM).
5. **i18n**: default `'en'`; `apply()` also handles `[data-i18n-placeholder]`; safe no-op when strings missing; app persists choice in `voicesync-lang`.
6. **New §3.6 DOM contract**: exact id table `app.js` expects — Sana must implement these ids in `index.html` (textInput, charCount, ttsLang, voiceSelect, btnGenerate, btnPlay, btnStop, avatarMount, moduleStatus, statusMsg, timeline, timeLabel, btnWav, btnMp3, btnVideo, btnSave, btnLoad, fileLoad, langToggle).
7. **New §3.7 module loading**: plain `<script>` tags attaching to `window`; load order irrelevant.

### Verification evidence (never claimed without proof)
- `node --check js/app.js` → **PASS** (exit 0).
- Smoke test (`/tmp/appjs-smoke.js`): stubbed DOM, **zero teammate modules** → boot completed with no throw; `#moduleStatus` = `Modules: TTS ✗ · LipSync ✗ · Avatar ✗ · Exporter ✗ · I18N ✗`; Generate with missing TTS → clean error message, no crash. **PASS**.
- Wiring test (`/tmp/appjs-wiring.js`): stubbed all five modules per SPEC contracts → full trace verified: `TTS.getVoices` → `Avatar.mount` → `I18N.apply` → `LipSync.ready` → Generate → `TTS.synthesize` → `LipSync.analyze` → `Avatar.speak(cues=2)` → `audio.play` → `encodeWAV`/`downloadAudio` (WAV+MP3) → `recordVideo` with `onAudio` re-attaching `Avatar.speak` → `I18N.apply:ur` on toggle. **PASS**.
- Runtime in a real browser is **NOT** verified (no modules, no index.html exist yet) — that waits for integration.

### Wiring map (DOM id → module call)
| DOM id | Wires to |
|---|---|
| `#textInput` | `TTS.synthesize(text, voiceId)` |
| `#ttsLang` | `TTS.getVoices(lang)` |
| `#voiceSelect` | selected value → `voiceId` |
| `#btnGenerate` | synthesize → `LipSync.analyze` → `Avatar.speak` → play |
| `#btnPlay` / `#btnStop` | replay last result / `TTS.cancel` + pause + `Avatar.stop` + `speechSynthesis.cancel` |
| `#avatarMount` | `Avatar.mount(el)` |
| `#moduleStatus` | `hasModule()` checks + `LipSync.ready()` |
| `#statusMsg` | user messages / errors |
| `#timeline` / `#timeLabel` | rAF progress loop |
| `#btnWav` | `Exporter.encodeWAV` → `downloadAudio(blob, 'voicesync-voice.wav')` |
| `#btnMp3` | `Exporter.downloadAudio(result.blob, 'voicesync-voice.mp3')` |
| `#btnVideo` | `Avatar.getCanvas()` → `Exporter.recordVideo(..., {onAudio: el => Avatar.speak(cues, el)})` |
| `#btnSave` / `#btnLoad` / `#fileLoad` | `Exporter.saveProject(obj)` / `Exporter.loadProject(text)` |
| `#langToggle` | `I18N.apply(lang)` |

### Blocked on teammates (stated plainly — nothing invented)
- **All five modules missing**: `js/` has only `app.js`. I did NOT invent their APIs — every call in `app.js` is guarded by `hasModule()`/`typeof` checks and matches only what SPEC §3 now defines.
- **Sana**: `index.html` must implement the §3.6 ids exactly; until then the wiring map above is unverified in a real page.
- **Bilal**: `docs/API.md` must come first per protocol — Usman/Hina primary paths (Edge endpoint, Rhubarb CDN) are unproven until then.
- **Integration test** (text→voice→lips→export end-to-end in a real browser) is impossible until modules land; it is my sign-off gate for v1.0.
