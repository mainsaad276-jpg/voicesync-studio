# VoiceSync Studio

AI voiceover website: text to speech, voice cloning, accounts, credits, PKR billing (EasyPaisa / JazzCash / bank), referral rewards, developer API and an admin panel. The voice engine is the JSF Labs API; your key stays on the server and customers never see it.

## Run it on your computer

1. Install **Node.js 18 or newer** from https://nodejs.org
2. Open Terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000
4. **Register first.** The first account becomes the **admin**, and so does the `ADMIN_EMAIL` in `.env`.

## First things to do as admin

1. **Clone 3–5 house voices** (your own voice, or team members who agree to it) in *Voice Cloning*.
2. Go to **Admin panel → Voices** and tick **Public** on them. They then show up in the free homepage playground and in every customer's library. Until a public voice exists, the playground shows "voices coming soon".
3. Edit **`config.js`** to set the brand name, prices, WhatsApp number, EasyPaisa/JazzCash/bank account details, free characters and clone limits.

## How payments work

Customer picks a plan → sends money to the account shown → enters the transaction ID → you check your EasyPaisa/JazzCash/bank → **Admin panel → Payments → Approve** → characters are added instantly.

## Put it online (Vercel)

1. Import this GitHub repo in Vercel. Set **Production Branch** to `studio-server` (Settings → Git).
2. **Storage → Create Database → Upstash for Redis** (free) and connect it to the project. This adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically. Without it, nothing is saved.
3. **Settings → Environment Variables:**
   - `ENGINE_API_KEY` = your JSF key
   - `ADMIN_EMAIL` = your email
   - `SESSION_SECRET` = any long random text
4. Redeploy. Open `/api/health` and check it says `"storage":"redis","engine":true`.

Vercel limits: requests are capped at about 4.5 MB, so the browser automatically compresses voice samples (24 kHz mono, max 60s). A function can run for up to 300s, so very long scripts may time out. Split them into parts.

## Important limits from the upstream engine

- Every customer's generation uses characters from **one** JSF Labs account. Keep that account topped up, and price your plans above your cost.
- That account has a fixed number of **voice slots (50)** shared by all customers. `cloneLimits` in `config.js` caps clones per customer.
- The engine API offers **clone + text-to-speech only**. It has no stock voice list, and models can't be chosen through the API.
- Output is **WAV**.

## Files

| Path | What it is |
|---|---|
| `config.js` | Brand, prices, payment accounts, limits — edit this |
| `api/index.js`, `vercel.json` | Vercel entry point and routing |
| `server.js` | All API routes: auth, studio, cloning, billing, admin, public `/v1` API |
| `lib/upstream.js` | Calls the voice engine with the secret key |
| `public/` | Website pages; `app.html` + `assets/js/app.js` is the dashboard |
