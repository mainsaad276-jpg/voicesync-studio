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
- **Claude — branch `subscriptions` (IN PROGRESS, 2026-10-16, boss order):**
  Boss: "plans multiply up to 10M, 10,000 free, then subscription via WhatsApp;
  admin gets the account request, verifies details + payment, activates Pro;
  leave a place for the API key." Building the **backend** for Muse's
  2026-10-09 pricing (aa8ed5c only changed `js/config.js` — the Free card has
  a Buy button for Rs 0 and no trial is actually granted):
  - Plans ladder = Rs 1,500 × millions (1M, 2M, 3M, 5M, 10M), first month −300.
  - Free 10,000 HD characters per device, granted by the Worker (`/pro/trial`).
  - Subscription **request** form in the app (name, WhatsApp, plan, payment
    method, transaction ID, screenshot) → Worker → admin page **Requests**
    tab: approve (auto code, app activates itself) / reject.
  - Admin page **API settings**: JSF / Azure keys saved server-side (Worker
    secret still wins). `config.js` `ttsProxy` stays the one public "API place".
  - **Vercel** option (boss chose Vercel): `api/[...path].js` runs the same
    Worker code, storage via Upstash/Vercel KV.
  Files: `js/pro.js`, `js/config.js` (plans block), `js/tts.js` (jsf block),
  `css/style.css` (plans section), `worker/**`, `api/**`, `vercel.json`,
  `docs/admin.html`, `docs/privacy.html` (rows), `qa/qa-pro.js`, `qa/qa-jsf.mjs`.
  **Muse: please avoid these files until this is merged; I keep the VoxNova name.**
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
- 2026-10-09: RENAME VoiceSync Studio → VoxNova (Muse Team 1, boss pick): display name only — web, Capacitor, native wrapper, docs. Packages/URLs/engines unchanged. QA green, pushed+live.
- 2026-10-09: PR #3 merged (Claude): paid plans + activation codes (Worker KV), admin page `docs/admin.html`, themes, Worker auto-deploy; includes PR #1 Pro + PR #2 JSF relay. QA 2120 + 29 + 43.
- 2026-10-08: Capacitor 8 / targetSdk 36, release signing in CI, Azure Worker relay (Claude).
- 2026-10-09: JSF Labs integration (Muse Team 1) — DONE, commit 5ffe7f8, QA 2107/2107, pushed+live.
- 2026-10-08: Release AAB v1.0.0 built & signed (Muse); Capacitor scaffold +
  native bridges (Claude); expert loop closed CLEAN (Muse Team 3).
