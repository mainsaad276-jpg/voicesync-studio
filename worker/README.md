# Voice relay (Cloudflare Worker) for Azure AI Speech

The app asks this Worker for Studio voices; the Worker calls Azure with the
secret key and returns MP3. The key never goes into the website or the APK.

## One-time setup (Cloudflare dashboard, no command line)

1. dash.cloudflare.com → **Workers & Pages → Create → Create Worker**.
   Name it `voicesync-tts` → **Deploy** (the hello-world code is fine for now).
2. **Edit code** → delete everything → paste the whole of `worker/src/index.js`
   → **Deploy**.
3. Worker → **Settings → Variables and Secrets → Add**:

   | Type | Name | Value |
   |---|---|---|
   | Secret | `AZURE_SPEECH_KEY` | KEY 1 from Azure → Speech resource → Keys and Endpoint |
   | Text | `AZURE_SPEECH_REGION` | the Location shown there, e.g. `centralindia` |
   | Text | `ALLOWED_ORIGINS` | `https://mainsaad276-jpg.github.io,https://localhost,http://localhost,capacitor://localhost,http://localhost:8000` |

   → **Deploy**.
4. Open `https://voicesync-tts.<your-subdomain>.workers.dev/health` — it should
   show `"keySet":true`.
5. Put that address (without `/health`) in `js/config.js` → `ttsProxy`.

## Notes
- Azure **Free F0** tier: 0.5 million characters a month, never billed; when
  it runs out Azure answers 429 and the app falls back to the free engines.
- Per-request limit: 3000 characters (the app splits longer scripts).
- Optional per-visitor rate limit: deploy with wrangler using `wrangler.toml`
  (`[[ratelimits]]`, 30 requests/minute). The code works without it.
- To change the Azure key later, edit only the `AZURE_SPEECH_KEY` secret.

## JSF Labs voice cloning (automatic deploy from GitHub)

The same Worker also relays JSF Labs (jsflabs.io) cloning:
`POST /jsf/clone` (multipart: audio, name, gender, language) and
`POST /jsf/tts` (json: text, voice_id, speed) → WAV audio.

GitHub deploys it for you (`.github/workflows/deploy-worker.yml`) whenever
`worker/` changes on `main`, or from **Actions → Deploy voice Worker → Run workflow**.
It needs these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare token from the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `JSF_API_KEY` | JSF Labs API key (starts with `jsf_`) |
| `VS_ADMIN_KEY` (recommended) | Your password for the admin page (plan codes) |
| `AZURE_SPEECH_KEY` (optional) | Azure Speech key |

After the first run, the job summary shows the Worker address. Open
`<address>/health` — it should show `"jsfKeySet": true` — then put the address
in `js/config.js` → `ttsProxy`.

## Paid plans (activation codes)

HD JSF voices and cloning need an activation code with a character balance.
The workflow creates a Cloudflare KV store (`voicesync-pro`, binding `PRO`).

1. Customer pays (WhatsApp / bank details from `js/config.js` → `pro.payment`).
2. Open `https://mainsaad276-jpg.github.io/voicesync-studio/docs/admin.html`,
   enter `VS_ADMIN_KEY` and the Worker address, pick the plan → **Create code**
   → **Send on WhatsApp**.
3. Customer: app → ⭐ Pro → *Have an activation code?* → Activate.

Each `/jsf/tts` call deducts the text length from the code (only when JSF
succeeds). Top up or renew a code from the admin page.
