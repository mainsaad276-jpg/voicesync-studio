# Rabia — Documentation Lead — progress

**Date:** 2026-10-08 | **Status: DONE** (docs written against the real UI, verified)

## Docs written
- `README.md` — what VoiceSync Studio is, free-API table (Edge Neural →
  Google translate_tts → Web Speech; Rhubarb WASM → energy heuristic), local
  run in 3 steps, GitHub Pages deploy via `.github/workflows/pages.yml`,
  browser support, 10-member team credits, Phase 2 out-of-scope note.
- `docs/USER-GUIDE.md` — English step-by-step (type → language → voice →
  Play → preview → export audio/video → save/load → Urdu toggle),
  troubleshooting table.
- `docs/USER-GUIDE-UR.md` — same guide in Urdu script.

## Verification (rule: docs describe reality, not wishes)
- Read the ACTUAL `index.html` (Sana's build) before writing. Every
  button/menu named in the guides was checked against real ids/labels —
  **36/36 verified present**, zero mismatches:
  `btn-lang-toggle, text-input, char-count, lang-select, voice-select,
  avatar-mount, btn-play, btn-stop, timeline, progress, status,
  btn-export-audio, btn-export-video, btn-save-project, btn-load-project`
  + labels "Script Editor, Your text, Language, Voice, Loading voices…,
  Preview, Export, Project, Play, Stop, Download Audio, Download Video,
  Save Project, Load Project, Ready — type your text and press Play.,
  100% free — no API keys, no sign-up."
- `js/` state checked at write time: `i18n.js` (Sana) and `exporter.js`
  (Faraz) exist and pass `node --check`; `tts.js`, `lipsync.js`, `avatar.js`,
  `app.js` do NOT exist yet.
- Observed (already fixed, not a live mismatch): the original `.gitignore`
  contained `css/`, `js/`, `index.html` — i.e. it ignored the project's own
  source files. Imran found and replaced it (see `progress/imran.md`); current
  `.gitignore` only ignores tooling/temp files. Verified via `git
  check-ignore`: `index.html`, `css/style.css`, `js/*.js` are committable.
- `.github/workflows/pages.yml` read to describe Pages deploy accurately
  (push to `main` → checkout → upload-pages-artifact → deploy-pages, no build).

## Marked "in progress" (accurate as of 14:00 PKT 2026-10-08)
- README build-status line: UI shell + i18n + exporter built; tts / lipsync /
  avatar / app.js = "team working on it".
- USER-GUIDE steps 5–9: voice list loading, Play/Stop playback, talking
  character, Download Audio/Video, Save/Load Project, اردو toggle — all
  marked "(team working on it)" / "(ٹیم اس پر کام کر رہی ہے)" because the
  wiring (`app.js`) and engine modules aren't built yet.
- Troubleshooting table explicitly says Play/export do nothing until the JS
  engine lands.

## Open items for later
- When Daniyal finishes `app.js` and the remaining modules, the guides need
  one re-check pass: real voice dropdown behavior, real status-line messages,
  and any id renames during integration. The Urdu toggle will need a
  verification click that all 21 `data-i18n` keys have `ur` strings in
  `js/i18n.js`.
