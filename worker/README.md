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
