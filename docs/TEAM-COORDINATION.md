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
- _(none — JSF Labs round complete)_

## Done recently
- 2026-10-09: JSF Labs integration (Muse Team 1) — DONE, commit 5ffe7f8, QA 2107/2107, pushed+live.
- 2026-10-08: Release AAB v1.0.0 built & signed (Muse); Capacitor scaffold +
  native bridges (Claude); expert loop closed CLEAN (Muse Team 3).
