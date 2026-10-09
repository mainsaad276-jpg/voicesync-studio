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
- **Boss decision (2026-10-09, Saad):** team up, ship everything active.
  JSF = BOTH sources: Worker relay with Saad's key (default, paid plans) **and**
  Muse's on-device key engine stay. Add paid plans (1M chars Rs 1500, first
  month Rs 300 off, more offers), pay via WhatsApp 03107100275 / bank details.
- **Claude — branch `release-plans` (IN PROGRESS, will merge to main):**
  merges PR #1 (Pro) + PR #2 (JSF relay) onto current main **keeping Muse's
  `jsflabs` engine untouched** (new relay engine id is `jsf`, separate);
  plan cards + offers in `js/pro.js` / `js/config.js`; activation codes and
  character balance in `worker/` (Cloudflare KV); admin page `docs/admin.html`;
  `deploy-worker.yml` auto-creates KV, writes the Worker URL into
  `js/config.js` and re-runs the APK build. Files: `js/pro.js`, `js/config.js`,
  `js/tts.js` (jsf engine block only), `js/app.js` (clone + pro hooks),
  `js/i18n.js` (new keys only), `index.html`, `css/style.css`, `worker/**`,
  `docs/admin.html`, `docs/privacy.html` (new rows only), `qa/qa-pro.js`,
  `qa/qa-jsf.mjs`, `qa/run-qa.sh`. Muse: please avoid these until merged.

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
