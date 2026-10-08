# VoiceSync Studio — 10-Member Team
**Project:** Free voiceover + lip-sync web software (100% free APIs, no keys, no payments).
**Repo:** `~/workspace/voicesync-studio` → GitHub (push pending user OAuth).
**Rule #1: koi ghalti na ho.** Every member verifies their own work with real commands/tests and writes proof in `progress/<name>.md`. Never claim success without evidence.

## Roster

### 1. Daniyal — Team Lead / Architect
- **Kia (what):** Owns SPEC.md compliance, `js/app.js` orchestration, final integration of all modules, release sign-off.
- **Kaise (how):** Reads every module's contract in SPEC.md first; writes `app.js` last so it wires real (not imagined) module APIs; runs the full acceptance checklist; merges and tags v1.0.
- **Owns:** `SPEC.md`, `js/app.js`, `PROGRESS.md` (aggregate)
- **Done =** app boots with zero console errors, text→voice→lip-sync→export works end-to-end.
- **Quality gate:** `node --check` on all js files; end-to-end click-path test documented.

### 2. Usman — TTS Engine Developer
- **Kia:** Free text-to-speech engine with automatic fallback chain.
- **Kaise:** Primary = Microsoft Edge Neural voices (free, no key) via the readaloud endpoint; fallback 1 = Google Translate TTS (`translate_tts?client=tw-ob`); fallback 2 = browser Web Speech API (offline). Voice lists for ur-PK, hi-IN, en-US, en-GB, ar-SA + more. Exposes exactly the SPEC.md `TTS.*` contract.
- **Owns:** `js/tts.js`
- **Done =** `TTS.synthesize()` returns playable audio for Urdu + English; failures auto-fall back, never crash.
- **Quality gate:** real synthesis calls tested (paste HTTP status/audio bytes in progress note); `node --check`.

### 3. Hina — Lip-Sync Engine Developer
- **Kia:** Audio → viseme (mouth-shape) timeline.
- **Kaise:** Primary = Rhubarb LipSync WASM (open-source, free) loaded from a Bilal-verified CDN, pinned version; fallback = built-in amplitude/energy heuristic (always works, no dependency). Output = Rhubarb cue format `{viseme, start, end}` with visemes A,B,C,D,E,F,G,H,X. Exposes exactly the SPEC.md `LipSync.*` contract.
- **Owns:** `js/lipsync.js`
- **Done =** `LipSync.analyze(audioBuffer)` returns a sane cue list even when WASM CDN is blocked.
- **Quality gate:** unit-test with a generated tone WAV; both paths exercised; `node --check`.

### 4. Kamran — Avatar & Animation Developer
- **Kia:** Talking character that moves its mouth to the viseme timeline.
- **Kaise:** Original SVG character (no copied art), 9 mouth shapes (A–X) as SVG paths, blinking + subtle head bob, canvas renderer for video export. `Avatar.setViseme(v)` swaps mouth instantly (60fps-safe).
- **Owns:** `js/avatar.js`
- **Done =** all 9 visemes visibly distinct; `Avatar.getCanvas()` returns the live canvas.
- **Quality gate:** screenshot-free logic test (viseme→path mapping asserted in a node script); `node --check`.

### 5. Sana — Frontend UI Developer
- **Kia:** The studio UI the user touches.
- **Kaise:** `index.html` + `css/style.css` + `js/i18n.js` (Urdu + English toggle). Layout: text editor, language + voice picker, avatar preview, transport controls (play/stop), timeline, export buttons. Mobile-friendly, dark studio theme. No framework (vanilla, zero build).
- **Owns:** `index.html`, `css/style.css`, `js/i18n.js`
- **Done =** every button wired to `app.js` handlers; Urdu toggle translates all labels.
- **Quality gate:** HTML validates (no unclosed tags — check via `python3 -m html.parser` or tidy if present); CSS has no dead selectors for missing ids.

### 6. Bilal — Free-API Research & Integration Specialist
- **Kia:** Prove every "free API" claim with real network evidence.
- **Kaise:** `curl` each endpoint (Edge voices list, Edge synthesis WS handshake docs, Google translate_tts, Rhubarb WASM CDN URLs). Record: URL, HTTP status, content-type, CORS headers, rate-limit notes, fallback trigger. Writes `docs/API.md` — the single source of truth Hina/Usman code against.
- **Owns:** `docs/API.md`
- **Done =** every endpoint in API.md has a pasted status code + timestamp; dead ends documented with the chosen alternative.
- **Quality gate:** no endpoint listed without a live test; re-test before marking final.

### 7. Faraz — Export & Storage Engineer
- **Kia:** Get the finished product OUT of the app.
- **Kaise:** Audio download (WAV encode from AudioBuffer — always works; MP3 when available), video export via `canvas.captureStream()` + `MediaRecorder` → WebM download, project save/load (JSON file + localStorage). Exposes exactly the SPEC.md `Exporter.*` contract.
- **Owns:** `js/exporter.js`
- **Done =** WAV bytes valid (RIFF header asserted in node test); WebM path guarded for unsupported browsers with a clear message.
- **Quality gate:** node test on WAV encoder; `node --check`.

### 8. Nadia — QA & Testing Lead
- **Kia:** The "100% theek" guarantee.
- **Kaise:** Writes `docs/QA-CHECKLIST.md` (module contract tests, fallback tests, Urdu/English UI test, mobile layout test, export test), runs every check she can from the VM, logs bugs to `docs/BUGLOG.md` with severity + owner, re-tests fixes. Honest verdict: what passed, what needs a real phone/browser test.
- **Owns:** `docs/QA-CHECKLIST.md`, `docs/BUGLOG.md`
- **Done =** checklist 100% attempted; every bug either fixed or logged with owner.
- **Quality gate:** her sign-off line in PROGRESS.md states exactly what was and wasn't verified.

### 9. Imran — DevOps / GitHub Manager
- **Kia:** Repo hygiene + GitHub Pages deployment.
- **Kaise:** `git init`, clean commits per module, `.github/workflows/pages.yml` (static deploy, no build), release tag v1.0. Push to GitHub the moment user OAuth completes (Muse will hand him the remote).
- **Owns:** `.github/workflows/pages.yml`, `.gitignore`, git history, releases
- **Done =** workflow YAML valid (`python3 -c yaml.safe_load` or actionlint if present); repo pushes cleanly.
- **Quality gate:** never force-push; every commit builds (nothing to build — files must exist as listed).

### 10. Rabia — Documentation Lead
- **Kia:** A stranger can use this software without asking anyone.
- **Kaise:** `README.md` (what it is, free-APIs used, how to run/deploy, browser support), `docs/USER-GUIDE.md` (English, step-by-step with screenshots placeholders), `docs/USER-GUIDE-UR.md` (Urdu guide). Reads the actual built UI before writing a word — docs describe reality, not wishes.
- **Owns:** `README.md`, `docs/USER-GUIDE.md`, `docs/USER-GUIDE-UR.md`
- **Done =** every button/menu in the UI appears in the guide; README install = 3 steps max.
- **Quality gate:** a second read-through against the real `index.html` ids.

## Coordination protocol (no collisions, no mistakes)
1. Bilal publishes `docs/API.md` FIRST — Usman & Hina code against it, not against guesses.
2. Everyone reads `SPEC.md` before writing code. Contracts are frozen; changes go through Daniyal.
3. One member, one file set (table above). Shared files: append-only progress notes in `progress/<name>.md`.
4. Muse (orchestrator) checks `progress/*.md` repeatedly and reports done vs remaining to the user.
5. Website linking is PHASE 2 — not in this build. This phase ends at: working software on GitHub.
