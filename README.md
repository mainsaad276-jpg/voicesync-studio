# VoiceSync Studio

**Free voiceover + lip-sync studio — 100% free, no API keys, no sign-up.**

Type or paste text, pick a language and a neural voice, and a talking character
speaks your script with synced lip movement. Export the result as audio (WAV)
or as a video (WebM) of the character. Static site, zero build step, zero cost.

> **Build status (checked 2026-10-08, 14:00 PKT):** UI shell built by Sana
> (`index.html`, `css/style.css`, `js/i18n.js` — English ⇄ اردو strings);
> export engine built by Faraz (`js/exporter.js`, node-tested). Still in
> progress — **team working on it**: `js/tts.js`, `js/lipsync.js`,
> `js/avatar.js`, `js/app.js` (final wiring). See `PROGRESS.md`.

## How it works (as designed)

1. **Type** your script — Urdu, Hindi, English (US/UK), Arabic and more.
2. **Pick** the language and a neural voice from the dropdowns.
3. **Press Play** — the app generates the voiceover and the character's mouth
   moves in sync with the audio (viseme timeline).
4. **Export** — download the audio (WAV) or a video (WebM) of the talking
   character; save/load your project as a JSON file.

## Free APIs it uses (no keys, no payments)

| Need | Primary (free, no key) | Automatic fallbacks |
|---|---|---|
| Neural voiceover | Microsoft Edge Neural TTS (`speech.platform.bing.com`) | Google `translate_tts` → browser Web Speech API (offline) |
| Lip-sync | Rhubarb LipSync WASM (open-source, pinned CDN) | Built-in energy-heuristic mouth shapes (always works) |

Every primary endpoint has an automatic fallback — if the network drops, the
app still speaks with a working mouth instead of crashing. Endpoint proofs are
documented by the API researcher in `docs/API.md` (team working on it).

## Run it locally (3 steps)

1. Clone or download this repo.
2. `cd voicesync-studio` and run `python3 -m http.server 8000`
3. Open `http://localhost:8000` in Chrome or Edge.

(The page is also designed to work when opened directly as a file.)

## Deploy to GitHub Pages

A ready workflow is included at `.github/workflows/pages.yml` — push to the
`main` branch and GitHub deploys the static site automatically; the live URL
appears on the workflow run (`https://<username>.github.io/voicesync-studio/`).
No build step is needed: the repo ships as plain HTML/CSS/JS.

## Browser support

- **Best:** Chrome / Edge (WebM video export needs `MediaRecorder`).
- Voice generation falls back to the browser's built-in speech engine, so a
  basic voice works even offline.
- Layout is mobile-friendly down to a 360px-wide viewport.
- The UI language toggle (English ⇄ اردو) translates every label.

## Team

Built by the 10-person VoiceSync Studio team — duties in `TEAM.md`, tech spec
in `SPEC.md`:

- **Daniyal** — Team Lead / Architect (`js/app.js`, integration)
- **Usman** — TTS Engine (`js/tts.js`)
- **Hina** — Lip-Sync Engine (`js/lipsync.js`)
- **Kamran** — Avatar & Animation (`js/avatar.js`)
- **Sana** — Frontend UI (`index.html`, `css/style.css`, `js/i18n.js`)
- **Bilal** — Free-API Research (`docs/API.md`)
- **Faraz** — Export & Storage (`js/exporter.js`)
- **Nadia** — QA & Testing (`docs/QA-CHECKLIST.md`, `docs/BUGLOG.md`)
- **Imran** — DevOps / GitHub (`.github/workflows/pages.yml`)
- **Rabia** — Documentation (`README.md`, `docs/USER-GUIDE.md`, `docs/USER-GUIDE-UR.md`)

Website linking to the user's business site is **Phase 2** — out of scope for
this build. Phase 1 ends at: working software pushed to GitHub.
