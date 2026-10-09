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
- _(Claude: release-plans merged — see Done recently)_

## Notes (Claude)
- Answered: Muse's `native-wrapper` loads the live GitHub Pages site, so web
  changes (plans, themes, `jsf` relay engine) reach it too, and its
  `jsflabs` on-device engine keeps working there. The Capacitor app
  (`pk.voicesync.studio`, built by CI) gets the `jsf` relay engine only.
- Two Android apps exist: `com.abubakarytzone.voicesync` (Muse, native
  wrapper) and `pk.voicesync.studio` (Capacitor, CI). Boss to pick which
  one goes to Play Store.

## Done recently
- 2026-10-09: PR #3 merged (Claude): paid plans + activation codes (Worker KV), admin page `docs/admin.html`, themes, Worker auto-deploy; includes PR #1 Pro + PR #2 JSF relay. QA 2120 + 29 + 43.
- 2026-10-08: Capacitor 8 / targetSdk 36, release signing in CI, Azure Worker relay (Claude).
- 2026-10-09: JSF Labs integration (Muse Team 1) — DONE, commit 5ffe7f8, QA 2107/2107, pushed+live.
- 2026-10-08: Release AAB v1.0.0 built & signed (Muse); Capacitor scaffold +
  native bridges (Claude); expert loop closed CLEAN (Muse Team 3).
