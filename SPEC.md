# VoiceSync Studio — Technical Spec (v1)
Free voiceover + lip-sync web software. Static site, zero build step, zero API keys, zero cost. Deployable to GitHub Pages as-is.

## 1. What it does
1. User types/pastes text (Urdu, Hindi, English, Arabic, …).
2. User picks language + neural voice → app generates voiceover audio (free TTS).
3. App analyzes the audio → viseme (mouth-shape) timeline.
4. Built-in animated character speaks the audio with synced lip movement; user can play/preview.
5. User exports: audio file (WAV/MP3) and/or video (WebM) of the talking character.

## 2. File layout (frozen — changes via Daniyal only)
```
voicesync-studio/
├── index.html                 (Sana)
├── css/style.css              (Sana)
├── js/
│   ├── app.js                 (Daniyal — orchestration, UI wiring)
│   ├── tts.js                 (Usman)
│   ├── lipsync.js             (Hina)
│   ├── avatar.js              (Kamran)
│   ├── exporter.js            (Faraz)
│   └── i18n.js                (Sana — {en:{...}, ur:{...}})
├── .github/workflows/pages.yml (Imran)
├── docs/
│   ├── API.md                 (Bilal — endpoint truth table)
│   ├── QA-CHECKLIST.md        (Nadia)
│   ├── BUGLOG.md              (Nadia)
│   ├── USER-GUIDE.md          (Rabia)
│   └── USER-GUIDE-UR.md       (Rabia)
├── README.md                  (Rabia)
├── SPEC.md  TEAM.md  PROGRESS.md
└── progress/<member>.md       (each member's status notes)
```

## 3. Module contracts (exact — app.js wires these)

### TTS (js/tts.js — Usman)
```js
TTS.getVoices(lang) -> Promise<[{id, name, lang, gender, engine}]>  // engine: 'edge'|'google'|'webspeech'; param lang: 'ur'|'en' (match voice.lang prefix, e.g. 'ur-PK')
TTS.synthesize(text, voiceId) -> Promise<Result | {error: string}>
TTS.cancel()   // abort in-flight request AND speechSynthesis
```
- `Result` (audio path, engine `edge`): `{audioBuffer: AudioBuffer, blob: Blob, url: string, duration: number, engine}`. `url` is a playable object URL; `blob` is the engine's native MP3 — app.js uses `blob` directly for MP3 export and `audioBuffer` for WAV export.
- `Result` (element path, engine `google`): `{audioBuffer: null, blob: null, url: string, urls: string[], duration: number, engine: 'google'}`. translate_tts sends no CORS headers (API.md §3), so JS cannot read the MP3 bytes — playback goes through `<audio>` elements (one per ≤200-char chunk URL in `urls`); app.js drives the mouth from `LipSync.makeTalkingCues(duration)` so there is never a dead mouth. MP3 export downloads straight from `url`; WAV/video export are gated with a message (no bytes available).
- `Result` (offline path, engine `webspeech`): `{audioBuffer: null, blob: null, url: null, duration: number /* estimate */, engine: 'webspeech', utterance: SpeechSynthesisUtterance}`. No audio data exists on this path — app.js plays via `speechSynthesis`, animates the mouth from synthetic cues, and disables audio/video export with a message.
- Never rejects: every failure resolves to `{error}` with a human-readable message; app.js shows it.
- Chunk long text (>400 chars) per request; concatenate buffers. `duration` = total seconds.

### LipSync (js/lipsync.js — Hina)
```js
LipSync.ready() -> Promise<'rhubarb'|'heuristic'>           // which engine will be used
LipSync.analyze(audioBuffer) -> Promise<{cues:[{viseme:'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'X', start, end}], duration, engine} | {error: string}>
LipSync.makeTalkingCues(durationSec) -> [{viseme, start, end}]   // pure function, no WASM
```
- Primary: Rhubarb LipSync WASM from Bilal-verified pinned CDN URL.
- Fallback: energy-heuristic visemes (always available offline).
- `analyze` never rejects: on failure it resolves `{error}` (app.js treats this as "no cues" → static mouth, no crash).
- `makeTalkingCues(durationSec)` returns a synthetic speech-like cue stream (alternating open/close visemes ≈8/sec) for the Web Speech path, where no audio buffer exists. app.js uses it so the avatar still "talks" during `speechSynthesis` playback.

### Avatar (js/avatar.js — Kamran)
```js
Avatar.mount(el)                 // builds SVG character
Avatar.setViseme('A'..'X')       // swap mouth shape immediately
Avatar.speak(cues, timeSrc)      // drive mouth from cue timeline during playback
Avatar.stop()
Avatar.getCanvas() -> HTMLCanvasElement  // for video export
Avatar.setMood('happy'|'neutral')        // optional
```
- Original character art only. 9 distinct mouth paths. Blink every 3–5s, gentle bob.
- `speak(cues, timeSrc)`: `timeSrc` is an HTMLAudioElement OR any object exposing a numeric `currentTime` (seconds) — Kamran reads only `currentTime` via rAF. Empty/missing cues → static neutral mouth, no crash.
- While `speak()` is active, manual `setViseme()` calls are ignored until `stop()`.
- `getCanvas()` returns the live-rendered canvas (same pixels as the on-screen character, redrawn each frame) — this is what Exporter records.

### Exporter (js/exporter.js — Faraz)
```js
Exporter.downloadAudio(blob, filename)                       // generic file download (WAV, MP3, WebM)
Exporter.encodeWAV(audioBuffer) -> Blob                  // RIFF-valid
Exporter.recordVideo(canvas, audioURL, {width, height, onAudio}) -> Promise<Blob>  // WebM; rejects with clean Error if MediaRecorder/captureStream unsupported
Exporter.saveProject(obj)                                // localStorage ('voicesync-project') AND JSON file download
Exporter.loadProject(jsonText?) -> object|null           // parse jsonText when given, else read localStorage
```
- `recordVideo` creates its own `<audio>` from `audioURL`, merges `canvas.captureStream()` video with the audio element's stream, records until the audio ends, resolves with a WebM Blob. `onAudio(audioEl)` (optional) fires before playback so app.js can attach lip-sync via `Avatar.speak(cues, audioEl)` — the exported video then has moving lips.

### i18n (js/i18n.js — Sana)
```js
I18N.strings = { en: {...}, ur: {...} }
I18N.apply(lang)  // sets all [data-i18n] elements (+ [data-i18n-placeholder] for input placeholders)
```
Every visible label uses `data-i18n="key"`. Default UI language is `'en'`. `I18N.apply(lang)` is safe to call any time (no-op if strings are missing); app.js persists the choice in localStorage (`voicesync-lang`).

### 3.6 DOM contract (app.js ↔ index.html — Sana implements these ids exactly)

| id | element | purpose — app.js wiring |
|---|---|---|
| `appRoot` | div | app container |
| `textInput` | textarea | script text → `TTS.synthesize(text, voiceId)` |
| `charCount` | span | character count readout |
| `ttsLang` | select (`ur`,`en`) | synthesis language → `TTS.getVoices(lang)` |
| `voiceSelect` | select | voice list; selected value → `voiceId` |
| `btnGenerate` | button | generate → analyze → speak → play |
| `btnPlay` / `btnStop` | buttons | replay last result / stop everything |
| `avatarMount` | div | `Avatar.mount(el)` target |
| `moduleStatus` | div | module readiness line (app-generated) |
| `statusMsg` | div (`role="status"`) | user messages / errors |
| `timeline` | progress | playback progress (`max=100`) |
| `timeLabel` | span | `0:03 / 0:12` readout |
| `btnWav` / `btnMp3` / `btnVideo` | buttons | `Exporter.encodeWAV`+`downloadAudio` / `downloadAudio(blob)` / `recordVideo` |
| `btnSave` / `btnLoad` | buttons | `Exporter.saveProject` / `loadProject` |
| `fileLoad` | input[type=file] (hidden) | project JSON picker |
| `langToggle` | select (`en`,`ur`) | UI language → `I18N.apply(lang)` |

### 3.7 Module loading
Each `js/*.js` file attaches its namespace to `window` (`window.TTS`, `window.LipSync`, `window.Avatar`, `window.Exporter`, `window.I18N`). Plain `<script>` tags, no ES modules, no build. Load order is irrelevant — `app.js` feature-detects every module at boot and guards every call, so a missing module shows a status line instead of crashing.

## 4. Free-API strategy (Bilal proves, docs/API.md records)
| Need | Primary (free, no key) | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Neural TTS | Edge readaloud WS (`speech.platform.bing.com`) | Google `translate_tts?client=tw-ob` | Web Speech API |
| Lip-sync | Rhubarb WASM (pinned CDN) | energy heuristic (built-in) | — |
- Rules: no endpoint ships without a live `curl`/fetch proof (status + content-type + date) in API.md; every primary has an automatic fallback; CORS failures must degrade gracefully, never white-screen.

## 5. Acceptance criteria (Nadia enforces)
- [ ] Page loads over `file://` AND `https://` with zero console errors.
- [ ] Urdu text → Urdu voice audio plays; English likewise.
- [ ] Mouth moves in sync with audio (viseme changes ≥ 4/sec during speech).
- [ ] Killing network for Rhubarb/Edge still yields working audio + mouth (fallbacks).
- [ ] WAV download is a valid RIFF file; WebM export works in Chrome.
- [ ] Urdu/English toggle translates 100% of labels.
- [ ] Works in a 360px-wide mobile viewport.
- [ ] `node --check` passes on every js file.

## 6. Out of scope (Phase 2)
Website linking, user accounts, usage analytics, voice cloning, photo lip-sync. Phase 1 ends at: working software pushed to GitHub.
