# VoiceSync Studio — Bug Log (Nadia, QA Lead)

Severity: **CRITICAL** = release blocker, software cannot function | **MAJOR** = SPEC §5 acceptance item at risk | **MINOR** = quality/polish | **INFO** = watch-item.

Statuses: OPEN → FIXED (re-test evidence required before any FIXED).

## FIXED in round 2 (Daniyal integration, 2026-10-08)

### CRITICAL-01..05 — all five module files exist (Usman/Hina/Kamran/Faraz/Daniyal)
`js/tts.js`, `js/lipsync.js`, `js/avatar.js`, `js/exporter.js`, `js/app.js` all present.
**Evidence:** `node --check` passes on all six js files; full wiring test
(`/tmp/daniyal2-wiring.js`, 31/31 passed) loads all five real modules with zero
errors and traces the complete flow. → FIXED.

### CRITICAL-06 — `docs/API.md` published (Bilal)
Truth table with live status codes on every endpoint; 4 critical findings
reconciled in round-2 (see INT-02..INT-05). → FIXED.

### CRITICAL-07 — 5 script tags resolve (Daniyal)
All scripts exist; wiring test loads them with zero console errors. → FIXED.

### MAJOR-01 — user guides exist (Rabia)
`docs/USER-GUIDE.md` + `docs/USER-GUIDE-UR.md` written against the real UI. → FIXED.

### MAJOR-02 — README.md complete (Rabia)
Full README (free-API table, 3-step run, Pages deploy, team credits). → FIXED.

### MAJOR-03 — progress notes complete
All 10 `progress/<member>.md` notes present. → FIXED.

### INT-01 (was CRITICAL) — `index.html` ids did not match SPEC §3.6 / `app.js`
Sana's HTML used kebab-case ids (`text-input`, `btn-play`, …) while `app.js`
wires camelCase SPEC ids — **every button was dead**: no Generate button at all,
transport unwired, `moduleStatus`/`fileLoad`/`timeLabel`/`btnWav`/`btnMp3`
missing, `ttsLang` offered 5 locales while the TTS contract expects `ur|en`.
**Fix:** `index.html` rewritten to all 20 SPEC §3.6 ids exactly (verified by
script: 20/20 present, 0 stale ids); `ttsLang` options = `ur|en` per SPEC.
**Evidence:** id-check script + wiring test (all buttons fire). → FIXED.

### INT-02 (was CRITICAL) — `LipSync.makeTalkingCues()` missing (Hina)
SPEC v1.1 contract + `app.js` dependency, but never implemented → Google and
Web Speech paths would have had a **dead mouth**. **Fix:** implemented in
`js/lipsync.js` (pure, deterministic, ≈8 visemes/sec). **Evidence:** wiring
test asserts non-empty cues drive `Avatar.speak` on the Google path. → FIXED.

### INT-03 (was MAJOR) — `TTS.getVoices()` exact-match instead of SPEC prefix-match (Usman)
`getVoices('ur')` returned **zero** Edge voices (compared `'ur-PK' !== 'ur'`).
**Fix:** prefix match (`'ur'` → `ur-PK` + `ur-IN`). **Evidence:** wiring test
asserts `ur-PK-AsadNeural` present. → FIXED.

### INT-04 (was MAJOR) — Google TTS `fetch()` is CORS-blocked in browsers (Bilal finding #3)
Usman's byte path works in Node but browsers block `fetch()` to
`translate_tts` (no CORS headers) → Google fallback **dead in production**.
**Fix:** `js/tts.js` Google path split — browser: `<audio>`-element playback
returning `{audioBuffer:null, blob:null, url, urls, duration, engine:'google'}`;
Node keeps the fetch/byte path for testing. `app.js` gained the Google
playback path (chunk playlist + virtual clock + `makeTalkingCues` mouth) and
MP3-via-URL export. **Evidence:** wiring test traces
`TTS.synthesize → LipSync.makeTalkingCues → Avatar.speak → Audio.play` with a
real `translate.google.com` URL. → FIXED.

### INT-05 (MINOR) — no loading state for the 37 MB Rhubarb download (Bilal finding #4)
First `LipSync.ready()` silently downloads ~37 MB. **Fix:** `app.js`
`probeLipSync()` + `getCues()` show "Loading lip-sync engine (one-time
download)…" via the status line when init takes >2 s. → FIXED.

### INT-06 (MINOR) — timeline `#progress` bar never animated
`app.js` set `.value` on a `<div>` (no-op). **Fix:** `startTimeline()` now also
sets `#progress` width % + `aria-valuenow`. → FIXED.

## OPEN

### INFO-01 — `style.css` classes `.busy` / `.error` forward-referenced (Sana)
`app.js` never toggles them (uses `data-kind` on `#statusMsg` instead). Harmless
dead CSS; remove or wire in a polish pass. Not a defect.

## QA-verified OK (evidence in BUGLOG, not just claimed)

- `js/i18n.js` — `node --check` exit 0; `I18N.strings={en,ur}` + `I18N.apply(lang)` match SPEC §3 exactly; en/ur key sets 33/33, zero mismatches. (Owner Sana — done right.)
- `index.html` — no unclosed/stray tags (html.parser check); every `data-i18n`/`data-i18n-ph` key exists in i18n strings; all ids present. (Owner Sana.)
- `css/style.css` — 33 selectors, no genuinely dead selectors (only hex-color false positives). (Owner Sana.)
- `.github/workflows/pages.yml` — valid YAML, least-privilege permissions, zero build step. (Owner Imran.)
- **Round-2 additions:** `node --check` passes on all 6 js files; all 20 SPEC §3.6
  ids present in `index.html` (script-verified); all 22 `data-i18n` keys have
  en+ur strings; wiring test 31/31 passed with real modules
  (`/tmp/daniyal2-wiring.js`).

## Cannot verify on this VM (needs real browser / phone)

Nadia's Group B: real Edge-browser neural audio (Edge WS 403-from-datacenter is
VM-specific), Google `<audio>`-element playback + CORS behavior on Pages,
viseme rate on a real screen, 360px mobile layout, WebM export in desktop
Chrome, Rhubarb WASM 37 MB first-load timing. The stub-DOM wiring test proves
the click path and module contracts — it does not replace a human browser run.
None faked — marked NOT VERIFIED until then.
