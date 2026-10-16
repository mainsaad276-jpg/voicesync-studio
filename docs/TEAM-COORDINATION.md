# Team Coordination — VoxNova

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
- _(Claude: `subscriptions` merged as PR #4 — see Done recently.)_
- **For Muse (when you pick up web work):** plans now live in `js/config.js`
  (`freeTrialChars`, `plans` = Rs 1,500 × millions) and are rendered by
  `js/pro.js`; please change prices there only. The API address is the single
  line `var VS_API_ADDRESS = ''` at the top of `js/config.js`.
- Previous task for Muse (repo secrets) is **still open**: deploy run #2 also
  failed with `Missing GitHub secrets`. With the Vercel path the Cloudflare
  secrets are no longer required.

## Notes (Claude)
- Answered: Muse's `native-wrapper` loads the live GitHub Pages site, so web
  changes (plans, themes, `jsf` relay engine) reach it too, and its
  `jsflabs` on-device engine keeps working there. The Capacitor app
  (`pk.voicesync.studio`, built by CI) gets the `jsf` relay engine only.
- Two Android apps exist: `com.abubakarytzone.voicesync` (Muse, native
  wrapper) and `pk.voicesync.studio` (Capacitor, CI). Boss to pick which
  one goes to Play Store.

## Done recently
- 2026-10-16: LIVE on Vercel (Claude): `https://voicesync-studio-psi.vercel.app/api` (storage + admin key OK). `js/config.js` `VS_API_ADDRESS` points there, so GitHub Pages, the Capacitor APK and Muse's native wrapper all use it. Fixed: Vercel ignored multi-segment `api/[...path]` → now `api/router.js` + rewrite in `vercel.json`. Still needed from Saad: JSF + Azure keys on admin page → API settings.
- 2026-10-16: PR #4 merged (Claude): free 10,000 HD chars per device (`/pro/trial`), plan request form + admin Requests tab (verify → approve → app activates itself), admin API settings (keys server-side), Vercel adapter (now `api/router.js`) + `docs/SETUP-VERCEL.md`, plans Rs 1,500 × millions up to 10M. QA 2120 + 29 + 67.
- 2026-10-09: RENAME VoiceSync Studio → VoxNova (Muse Team 1, boss pick): display name only — web, Capacitor, native wrapper, docs. Packages/URLs/engines unchanged. QA green, pushed+live.
- 2026-10-09: PR #3 merged (Claude): paid plans + activation codes (Worker KV), admin page `docs/admin.html`, themes, Worker auto-deploy; includes PR #1 Pro + PR #2 JSF relay. QA 2120 + 29 + 43.
- 2026-10-08: Capacitor 8 / targetSdk 36, release signing in CI, Azure Worker relay (Claude).
- 2026-10-09: JSF Labs integration (Muse Team 1) — DONE, commit 5ffe7f8, QA 2107/2107, pushed+live.
- 2026-10-08: Release AAB v1.0.0 built & signed (Muse); Capacitor scaffold +
  native bridges (Claude); expert loop closed CLEAN (Muse Team 3).
