# VoxNova — QA Checklist (Nadia, QA & Testing Lead)

**Rule:** no item passes without evidence. Evidence = command output, file read, or screenshot/video of a real run. "It should work" is not evidence.

## Group A — Static checks (runnable on this VM)

### A1. File layout matches SPEC §2 (frozen by Daniyal)
- [ ] `index.html`, `css/style.css` exist.
- [ ] All six `js/*.js` files exist: `app.js`, `tts.js`, `lipsync.js`, `avatar.js`, `exporter.js`, `i18n.js`.
- [ ] `.github/workflows/pages.yml`, `docs/API.md`, `docs/USER-GUIDE.md`, `docs/USER-GUIDE-UR.md`, `README.md`, `SPEC.md`, `TEAM.md`, `PROGRESS.md` exist.
- [ ] `progress/<member>.md` exists for all 10 members (per TEAM §4: progress notes).

### A2. Syntax — SPEC §5: `node --check` on every js file
- [ ] `node --check js/tts.js` exit 0.
- [ ] `node --check js/lipsync.js` exit 0.
- [ ] `node --check js/avatar.js` exit 0.
- [ ] `node --check js/exporter.js` exit 0.
- [ ] `node --check js/i18n.js` exit 0.
- [ ] `node --check js/app.js` exit 0.

### A3. Module contract tests — SPEC §3 (read each file, assert exports exactly)
TTS (`js/tts.js` — Usman):
- [ ] `TTS.getVoices(lang)` defined, returns array of `{id, name, lang, gender, engine}` with `engine ∈ {'edge','google','webspeech'}`.
- [ ] `TTS.synthesize(text, voiceId)` defined, returns a `Promise`.
- [ ] `TTS.cancel()` defined.
- [ ] No `throw` reaches UI paths (failures return `{error}`).
- [ ] Chunking logic present for text > 400 chars.
LipSync (`js/lipsync.js` — Hina):
- [ ] `LipSync.ready()` defined, resolves `'rhubarb'|'heuristic'`.
- [ ] `LipSync.analyze(audioBuffer)` defined, resolves `{cues:[{viseme:'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'X', start, end}], duration, engine}`.
- [ ] Energy-heuristic fallback works with no network/CDN (pure JS).
Avatar (`js/avatar.js` — Kamran):
- [ ] `Avatar.mount(el)`, `Avatar.setViseme('A'..'X')`, `Avatar.speak(cues, audioEl)`, `Avatar.stop()` defined.
- [ ] `Avatar.getCanvas()` returns an `HTMLCanvasElement`.
- [ ] `Avatar.setMood('happy'|'neutral')` defined.
- [ ] 9 distinct mouth paths exist (A,B,C,D,E,F,G,H,X — no two identical).
- [ ] Blink timer 3–5s and idle bob present in code.
Exporter (`js/exporter.js` — Faraz):
- [ ] `Exporter.downloadAudio(blob, filename)` defined.
- [ ] `Exporter.encodeWAV(audioBuffer)` defined → Blob.
- [ ] `Exporter.recordVideo(canvas, audioURL, {width,height})` defined → Promise<Blob>, throws clean `Error` (not silent failure) when MediaRecorder is unsupported.
- [ ] `Exporter.saveProject(obj)` / `Exporter.loadProject()` defined (JSON file + localStorage).
i18n (`js/i18n.js` — Sana):
- [ ] `I18N.strings = { en: {...}, ur: {...} }` present.
- [ ] `I18N.apply(lang)` sets every `[data-i18n]` element.
- [ ] `en` and `ur` key sets are identical (no key missing in either language).

### A4. HTML wiring — Sana + Daniyal
- [ ] `index.html` contains every element id referenced by `js/app.js` (grep all `getElementById`/`querySelector` ids in app.js, assert each exists in index.html).
- [ ] Every visible label uses `data-i18n="key"` (no hardcoded English/Urdu text in body).
- [ ] No unclosed tags (`python3 -c` HTML parse check or tidy).
- [ ] `css/style.css` has no selectors targeting ids/classes absent from index.html.

### A5. WAV validity (node test — Faraz's gate)
- [ ] Decode `Exporter.encodeWAV` output bytes in node: first 4 bytes `RIFF`, bytes 8–11 `WAVE`, `fmt ` chunk valid, data chunk length consistent.
- [ ] Pass a generated tone buffer through the encoder and confirm length = 44 + samples×channels×2.

## Group B — Runtime acceptance tests (need a real browser)

### B1. SPEC §5: loads over `file://` AND `https://` with zero console errors
- [ ] Open `index.html` via `file://` → page renders, avatar mounts, console has 0 errors.
- [ ] Serve over local `https://` → same, 0 errors.
- Evidence: console log export from DevTools.

### B2. SPEC §5: Urdu text → Urdu voice plays; English → English voice
- [ ] Paste Urdu text, pick an `ur-PK` voice → audio plays audibly.
- [ ] English text + `en-US` voice → audio plays audibly.
- Evidence: recorded screen clip or witnessed run.

### B3. SPEC §5: mouth in sync (viseme changes ≥ 4/sec during speech)
- [ ] Play voiceover, observe avatar: count ≥ 4 distinct viseme swaps per second during speech segments.
- Evidence: cue list timestamps from `LipSync.analyze` (verify `end-start` values produce ≥4 changes/sec on average) + visual confirmation.

### B4. SPEC §5: network-killed fallback test
- [ ] Block Rhubarb CDN (offline/devtools network kill) → `LipSync.ready()` resolves `'heuristic'`, audio still produces mouth movement.
- [ ] Block Edge + Google TTS endpoints → `TTS.synthesize` falls back to Web Speech API (or returns `{error}` that app displays, no white-screen).
- [ ] Full offline (`navigator.onLine=false` + killed network): voice still speaks via Web Speech, mouth still moves via heuristic, page never white-screens.
- Evidence: network-kill run log.

### B5. SPEC §5: WAV download valid; WebM export works in Chrome
- [ ] Download audio → file opens in a media player, bytes pass the RIFF check in A5.
- [ ] Export video in Chrome → `.webm` downloads and plays (picture + sound).
- [ ] On a browser without MediaRecorder support → clean error message shown (not a crash).

### B6. SPEC §5: Urdu/English toggle = 100% of labels
- [ ] Toggle to Urdu → every label/button/placeholder on screen is Urdu.
- [ ] Toggle back → 100% English again. No orphan untranslated strings.
- Method: cross-check rendered page against `I18N.strings` key sets from A3.

### B7. SPEC §5: 360px mobile viewport
- [ ] Set viewport 360×640: no horizontal scroll, all controls reachable, avatar visible, buttons tappable (≥40px touch targets), export buttons reachable without zoom.
- Evidence: screenshot at 360px.

### B8. End-to-end click path (Daniyal's integration proof)
- [ ] text → language+voice → Generate → Play (avatar speaks in sync) → Export WAV → Export WebM, in one session, no errors.

## Group C — Documentation & deployment gates

- [ ] `docs/API.md` has a live `curl`/fetch proof (status + content-type + date) for EVERY endpoint Usman/Hina code against (Bilal's gate).
- [ ] `pages.yml` parses (`python3 -c yaml.safe_load`); repo pushes cleanly, no force-push (Imran's gate).
- [ ] Every button/menu in `index.html` appears in `docs/USER-GUIDE.md` and `docs/USER-GUIDE-UR.md` (Rabia's gate).

## Sign-off
QA sign-off requires every box above checked with evidence, and BUGLOG.md showing zero open CRITICAL/MAJOR bugs.
