# VoiceSync Studio — Technical Spec (v1.1)
Free voiceover + lip-sync web software. Static site, zero build step, zero API keys, zero cost. Deployable to GitHub Pages as-is.

> **v1.1 changelog (2026-10-08):** §1 lists the shipped feature set; §3 TTS contract
> covers the chatterbox / mic / dialogue result shapes (previously undocumented);
> §3.6 DOM contract recounts all 74 ids (was 19); §i18n uses the actual
> `data-i18n-ph` attribute name (code never used `data-i18n-placeholder`); §6
> corrects the voice-cloning scope statement (cloning shipped in Phase 1).
> (SPEC.md lives at the repo root, as shown in §2.)

## 1. What it does
1. User types/pastes text (Urdu, Hindi, English, Arabic, …).
2. User picks language + neural voice → app generates voiceover audio (free TTS).
3. App analyzes the audio → viseme (mouth-shape) timeline.
4. Built-in animated character speaks the audio with synced lip movement; user can play/preview.
5. User exports: audio file (WAV/MP3) and/or video (WebM) of the talking character.

Shipped beyond the v1 core (all in `index.html` + `js/app.js`, user-verified 2026-10-08):
1. **Character Voices card grid** — 27 named studio characters (`#charGrid`) with
   search (`#charSearch`), avatar, play/select, FREE tags, and distinct pitch offsets
   per character; selected character info box (`#selCharBox`).
2. **Language pills** — quick-pick language listbox (`#langPills`) + search
   (`#langSearch`) and a browser-voice selector (`#browserVoiceSelect`).
3. **Dialogue mode** — checkbox (`#dialogueMode`) + Voice 2 (`#voiceSelect2`);
   `1:`/`2:` prefixes route speakers to two voices, merged into one buffer
   (`engine:'dialogue'` result).
4. **Speed 0.5–2× + pitch −12/+12 semitone sliders** (`#speedRange`/`#pitchRange`).
5. **Background music mixer** — file picker (`#btnMusicPick`/`#musicFile`), volume
   (`#musicVol`), clear (`#btnMusicClear`); music mixes into preview AND video export.
6. **SRT subtitles download** (`#btnSrt`) with speed-scaled timings.
7. **Shorts 9:16 video export** (`#videoFormat`) — 720×1280 composite with
   burnt-in captions.
8. **Share button** (`#btnShare`) — Web Share API with download fallback.
9. **Named presets** (`#presetSelect`, `#btnPresetSave`/`#btnPresetDelete`) in localStorage.
10. **Easy Mode** (`#easyToggle`) — hides advanced UI.
11. **Roman Urdu transliteration toggle** (`#romanUrdu`).
12. **Record My Voice** (`#btnRecord`) — mic recording flows through playback,
    lip-sync and export (`engine:'mic'` result), and can serve as the Chatterbox
    clone reference via `TTS.setReferenceAudio(blob)`.
13. **Chatterbox engine** — human-like voices + zero-shot voice cloning via
    ResembleAI's free keyless Hugging Face Space (`@gradio/client`,
    `engine:'chatterbox'` result; beta, no Urdu — maps ur→hi).
14. **Premium voice-cloning UI** (locked) — `#btnCloneSample`, `#btnClonePremium`,
    `#cloneName`, `#cloneFile`/`#cloneFileName`; payment-gated.
15. **Engine guide cards** ("KAUN SA ENGINE KAB ISTEMAL KAREN?", `#guide-heading`)
    with 4 `<h4>` headings (`guide_ur_h`, `guide_eu_h`, `guide_off_h`, `guide_clone_h`).
16. **Voice preview** — `🔊 Preview` per character card + `#btnVoicePreview`;
    honest message when the engine falls back.
17. **Text tools** — char/word/part counter (`#textCounter`), Sample/Paste/Copy/
    Clear/Dictate buttons, module status line (`#moduleStatus`).
18. **Pause/Resume** — big transport buttons (`#btnPauseBig`, etc.) work on all
    playback paths; `aria` labels use `data-i18n-aria` attributes (see §i18n).

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
TTS.getVoices(lang) -> Promise<[{id, name, lang, gender, engine}]>  // engine: 'edge'|'google'|'webspeech'|'chatterbox'; param lang: 'ur'|'en' (match voice.lang prefix, e.g. 'ur-PK')
TTS.synthesize(text, voiceId) -> Promise<Result | {error: string}>
TTS.setReferenceAudio(blob)   // optional clone reference (mic recording) for the chatterbox engine
TTS.cancel()   // abort in-flight request AND speechSynthesis
```
- `Result` (audio path, engine `edge`): `{audioBuffer: AudioBuffer, blob: Blob, url: string, duration: number, engine}`. `url` is a playable object URL; `blob` is the engine's native MP3 — app.js uses `blob` directly for MP3 export and `audioBuffer` for WAV export.
- `Result` (element path, engine `google`): `{audioBuffer: null, blob: null, url: string, urls: string[], duration: number, engine: 'google'}`. translate_tts sends no CORS headers (API.md §3), so JS cannot read the MP3 bytes — playback goes through `<audio>` elements (one per ≤200-char chunk URL in `urls`); app.js drives the mouth from `LipSync.makeTalkingCues(duration)` so there is never a dead mouth. MP3 export downloads straight from `url`; WAV/video export are gated with a message (no bytes available).
- `Result` (offline path, engine `webspeech`): `{audioBuffer: null, blob: null, url: null, duration: number /* estimate */, engine: 'webspeech', utterance: SpeechSynthesisUtterance}`. No audio data exists on this path — app.js plays via `speechSynthesis`, animates the mouth from synthetic cues, and disables audio/video export with a message.
- `Result` (human-like path, engine `chatterbox`): `{audioBuffer: AudioBuffer, blob: Blob, url: string, duration: number, engine: 'chatterbox'}`. Generated via ResembleAI's free keyless Hugging Face Space (`@gradio/client`), ≤250-char chunks, WAV bytes decoded into `audioBuffer`; the mic recording (when present, via `TTS.setReferenceAudio`) is the zero-shot clone reference. Fixed (C1, 2026-10-08): `blob` now carries honest `audio/wav` via `_finishWavResult` — exporters key off `blob.type` via `audioExtForType`.
- `Result` (mic path, engine `mic`): `{audioBuffer: AudioBuffer|null, blob: Blob, url: string, duration: number, engine: 'mic'}`. Produced by app.js `Record My Voice` (MediaRecorder) — flows through the same playback/lip-sync/export pipeline as TTS results; export uses the WAV route (`exportWav`/`encodeWAV`), never the `audio/mpeg` label.
- `Result` (dialogue path, engine `dialogue`): `{audioBuffer: AudioBuffer, blob: Blob /* WAV */, url: string, duration: number, engine: 'dialogue'}`. app.js-side: `1:`/`2:`-prefixed segments synthesized per speaker with their own voice, resampled and merged into one buffer; full playback/lip-sync/export support.
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
I18N.apply(lang)  // sets all [data-i18n] elements (+ [data-i18n-ph] for input placeholders)
```
Every visible label uses `data-i18n="key"`; input placeholders use `data-i18n-ph`
(the actual attribute in `index.html` — earlier drafts said `data-i18n-placeholder`,
which the code never used). Accessibility labels carry `data-i18n-aria="aria_<key>"`
(English stays in `aria-label` as fallback); the `I18N.apply` aria mechanism is the
i18n engineer's next step (M28). Default UI language is `'en'`. `I18N.apply(lang)` is safe to call any time (no-op if strings are missing); app.js persists the choice in localStorage (`voicesync-lang`).

### 3.6 DOM contract (app.js ↔ index.html — Sana implements these ids exactly)

74 ids total (recounted from `index.html` 2026-10-08). 66 are wired via `app.js`
`$('...')`; the 8 `*-heading` ids are `aria-labelledby` section-heading targets.

| group | id(s) | purpose — app.js wiring |
|---|---|---|
| root | `appRoot` | app container |
| topbar | `easyToggle`, `langToggle` | Easy Mode toggle; UI language (`en`/`ur`) → `I18N.apply` |
| text | `editor-heading`, `textInput`, `textCounter`, `btnSample`, `btnPaste`, `btnCopy`, `btnClear`, `btnDictate`, `romanUrdu` | section heading; script text → `TTS.synthesize`; char/word/part readout; text tools; Roman-Urdu transliteration toggle |
| languages | `langpills-heading`, `langSearch`, `langPills`, `browserVoiceSelect` | section heading; language search + pill listbox; browser-voice select |
| voices | `ttsLang`, `voiceSelect`, `btnVoicePreview`, `voiceSelect2`, `dialogueMode`, `dialogueHint`, `presetSelect`, `btnPresetSave`, `btnPresetDelete` | synthesis language; voice list; per-voice preview; dialogue Voice 2; dialogue-mode checkbox + hint; named presets |
| characters | `char-heading`, `charSearch`, `charGrid`, `selCharBox` | section heading; character search; 27-card grid; selected-character info box |
| transport | `preview-heading`, `avatarMount`, `btnGenBig`, `btnListenBig`, `btnPauseBig`, `btnStopBig`, `btnDlMp3Big`, `btnGenerate`, `btnPlay`, `btnStop` (hidden legacy), `btnRecord`, `audioPlayer`, `speedRange`, `speedVal`, `pitchRange`, `pitchVal` | section heading; `Avatar.mount(el)` target; 5 big Generate/Listen/Pause/Stop/Download-MP3 buttons; legacy small buttons (hidden); Record My Voice; result `<audio>` player; speed/pitch sliders + value readouts |
| music | `btnMusicPick`, `musicFile`, `musicVol`, `musicName`, `btnMusicClear` | music picker button, file input, volume slider, track-name label, remove-music button |
| status | `moduleStatus`, `statusMsg`, `timeline`, `progress`, `timeLabel` | module readiness line; user messages/errors; progressbar + fill + `0:03 / 0:12` readout |
| clone | `clone-heading`, `btnCloneSample`, `btnClonePremium`, `cloneName`, `cloneFile`, `cloneFileName` | premium (locked) clone UI: sample, unlock CTA, clone-name input, reference-audio file + name |
| guide | `engines-heading`, `engineBadge`, `guide-heading` | engine section heading; post-generate engine badge; "KAUN SA ENGINE…" guide heading |
| export | `export-heading`, `btnSrt`, `btnShare`, `btnWav`, `btnMp3`, `btnVideo`, `videoFormat`, `btnSave`, `btnLoad`, `fileLoad` | section heading; SRT download; Web-Share; WAV/MP3 download; video export; format (incl. Shorts 9:16); project save/load + JSON picker |

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
Website linking, user accounts, usage analytics, photo lip-sync. Phase 1 ends at: working software pushed to GitHub.

> Correction (v1.1): "voice cloning" no longer belongs here — it shipped in
> Phase 1: (a) Chatterbox zero-shot cloning via mic recording as reference
> (free, beta, no Urdu — maps ur→hi); (b) the Premium true-clone UI, currently
> locked behind the payment gate. What stays out of scope: full paid-clone
> activation and usage analytics.
