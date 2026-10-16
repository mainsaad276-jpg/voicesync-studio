# VoxNova — Vercel par chalana (site + API ek saath)

Is tareeqe mein GitHub secrets ki zaroorat nahi. Sab kuch Vercel ke dashboard se hota hai.

## 1. Project import
1. vercel.com par **GitHub se login** karein.
2. **Add New → Project** → `voicesync-studio` repo chunein → **Import**.
3. Framework: **Other** (vercel.json pehle se set hai) → **Deploy**.

## 2. Storage (codes, requests, free trials)
Project → **Storage** → **Create / Connect** → **Upstash for Redis** (free) → is project se connect karein.
Ye `KV_REST_API_URL` aur `KV_REST_API_TOKEN` khud daal deta hai.

## 3. Admin password
Project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `VS_ADMIN_KEY` | Apna mazboot password (admin page ke liye) |

Phir **Deployments → … → Redeploy**.

## 4. API keys (yahi "API ki jagah" hai)
`https://<aap-ki-site>.vercel.app/admin` kholein (Dashboard, Requests, Users, Payments, Plans, API settings):
- Admin key = `VS_ADMIN_KEY`, API address = `https://<aap-ki-site>.vercel.app/api`
- **API settings** tab → JSF Labs key aur Azure Speech key + region (`centralindia`) → **Save keys**.

Keys server par rehti hain, app ya website mein nahi.

## 5. GitHub Pages site aur Android app
`js/config.js` mein sab se upar **API PLACE** wali line mein address likhein:

```js
var VS_API_ADDRESS = 'https://<aap-ki-site>.vercel.app/api';
```

Commit karte hi nayi APK ban jayegi. (Vercel wali site par ye line khali bhi chalegi.)

## Rozana ka kaam
- Customer app mein **⭐ Pro → plan → Buy** se request bhejta hai (naam, WhatsApp, TID, screenshot).
- Admin page → **Requests** → check karein → **Approve** → customer ka plan khud chalu.
- Har naye device ko **10,000 HD characters free** milte hain (`freeTrialChars` in `js/config.js`).

Health check: `https://<aap-ki-site>.vercel.app/api/health` → `plansReady`, `adminKeySet`, `jsfKeySet` sab `true`.
