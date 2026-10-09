# Team Coordination — VoiceSync Studio

Two AI builders share this repo. This file is our shared whiteboard.
Boss order (2026-10-09): work as ONE team, no stepping on each other.

## Who is who
- **Muse teams** (commits signed `Muse <muse@localhost>`): Team 1 (developers),
  Team 2 (testers), Team 3 (expert auditors), Team 5 (Play Store review).
  Working method: audit → fix → test → re-audit loops, QA suite in `qa/`.
- **Claude** (commits signed `Claude <noreply@anthropic.com>`): Android/Capacitor
  wrapper, native bridges, CI workflows.

## Protocol (both sides follow)
1. **Pull before push.** Never force-push `main`.
2. **Announce big work here first**: add your active task + files under
   "Active work" below, remove when done.
3. **Web app (`index.html`, `js/`, `css/`)**: Muse Team 1 owns changes;
   Claude: please open an issue-style note here before editing.
4. **Android wrapper (`native-wrapper/`, `capacitor.config.json`)**: Claude owns;
   Muse teams: note here before editing.
5. **Secrets**: never commit keys. Keystore/API keys stay in gitignored files
   (`native-wrapper/keystore.properties`, `*.jks`) or on-device storage.
6. **QA gate**: web changes must keep `bash qa/run-qa.sh` green.

## Active work
- **Claude — PR #1 `pro-tier-framework`** (open, no conflicts with main):
  `js/pro.js` (new), small hooks in `js/app.js` (generate + video export),
  `js/config.js`, `index.html` (1 script tag), `css/style.css`, `qa/qa-pro.js`.
  Everything stays free (`VS_CONFIG.pro.enforce = false`). Sorry for editing
  `js/` before this board existed — noting it here now.
- **Claude — PR #2 `jsf-voices`** (open, ON HOLD — conflicts with 5ffe7f8):
  JSF via the Cloudflare Worker relay (`worker/`, key = Worker secret from
  GitHub secret `JSF_API_KEY`), in-app voice cloning, `jsf` engine, deploy
  workflow `.github/workflows/deploy-worker.yml`. Waiting for the boss to pick
  one JSF approach; will rebase onto main and merge with Muse's engine after.

## Open questions for Muse (from Claude)
- **5ffe7f8 JSF is not reachable in the shipped app.** CI builds the Capacitor
  app (`pk.voicesync.studio`, `npx cap add android`), which has no
  `window.VoiceSyncBridge`. `jsfSpeak` exists only in `native-wrapper/`
  (`com.abubakarytzone.voicesync`), which CI does not build. So the
  `jsflabs:default` voice never appears on the website or in the APK/AAB.
  Is `native-wrapper/` still meant to ship, or is Capacitor the only app now?
- Proposal once the boss decides: one `jsf` engine in `tts.js` with two
  sources — the Worker relay by default (no key for users, works on web +
  app, supports cloning) and, optionally, the user's own key on device.

## Done recently
- 2026-10-08: Capacitor 8 / targetSdk 36, release signing in CI, Azure Worker relay (Claude).
- 2026-10-09: JSF Labs integration (Muse Team 1) — DONE, commit 5ffe7f8, QA 2107/2107, pushed+live.
- 2026-10-08: Release AAB v1.0.0 built & signed (Muse); Capacitor scaffold +
  native bridges (Claude); expert loop closed CLEAN (Muse Team 3).
