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
TTS.getVoices(lang) -> [{id, name, lang, gender, engine}]   // engine: 'edge'|'google'|'webspeech'
TTS.synthesize(text, voiceId) -> Promise<{audioBuffer, blob, url, duration, engine}>
TTS.cancel()
```
- Chain: Edge Neural → Google translate_tts → Web Speech API. Never throw to UI; return `{error}` and let app show message.
- Chunk long text (>400 chars) per request; concatenate buffers.

### LipSync (js/lipsync.js — Hina)
```js
LipSync.ready() -> Promise<'rhubarb'|'heuristic'>           // which engine will be used
LipSync.analyze(audioBuffer) -> Promise<{cues:[{viseme:'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'X', start, end}], duration, engine}>
```
- Primary: Rhubarb LipSync WASM from Bilal-verified pinned CDN URL.
- Fallback: energy-heuristic visemes (always available offline).

### Avatar (js/avatar.js — Kamran)
```js
Avatar.mount(el)                 // builds SVG character
Avatar.setViseme('A'..'X')       // swap mouth shape immediately
Avatar.speak(cues, audioEl)      // drive mouth from cue timeline during playback
Avatar.stop()
Avatar.getCanvas() -> HTMLCanvasElement  // for video export
Avatar.setMood('happy'|'neutral')        // optional
```
- Original character art only. 9 distinct mouth paths. Blink every 3–5s, gentle bob.

### Exporter (js/exporter.js — Faraz)
```js
Exporter.downloadAudio(blob, filename)
Exporter.encodeWAV(audioBuffer) -> Blob                  // RIFF-valid
Exporter.recordVideo(canvas, audioURL, {width,height}) -> Promise<Blob>  // WebM; throws clean Error if MediaRecorder unsupported
Exporter.saveProject(obj) / Exporter.loadProject()       // JSON file + localStorage
```

### i18n (js/i18n.js — Sana)
```js
I18N.strings = { en: {...}, ur: {...} }
I18N.apply(lang)  // sets all [data-i18n] elements
```
Every visible label uses `data-i18n="key"`.

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
