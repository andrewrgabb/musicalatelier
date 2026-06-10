# Deployment runbook

How to take Musical Atelier from local to production. The architecture in prod:

| Piece | Where | Notes |
|---|---|---|
| Frontend (SPA) | **Vercel** (global CDN) | root domain `<domain>` |
| API (Node) | **Fly.io**, `syd` | `api.<domain>` |
| Worker (Python + Audiveris) | **Fly.io**, `syd` | no public port |
| Postgres | **Fly Managed Postgres**, `syd` | private network |
| Redis (BullMQ) | **Fly/Upstash Redis**, `syd` | private network |
| Object storage | **Cloudflare R2** | global, CDN-fronted |
| Auth | **Clerk** | production instance |

Co-locate the compute+data tier (API, worker, Postgres, Redis) in `syd` on the
private network; keep delivery (SPA, storage, auth) global. Replace `<domain>`
below with your real domain throughout.

> The Docker images are already verified to build and run locally
> (`docker build -f apps/api/Dockerfile .` and the worker equivalent), so the
> steps below are provisioning + wiring, not debugging.

---

## 0. Prerequisites

- A domain you control (DNS managed somewhere you can add records).
- Accounts: **Fly.io** (needs a card), **Cloudflare** (R2 is free-tier-friendly),
  **Vercel**, **Clerk** (you have this).
- CLIs:
  ```bash
  brew install flyctl        # Fly
  npm i -g vercel            # Vercel (optional; the dashboard works too)
  ```

---

## 1. Cloudflare R2 (object storage)

1. Cloudflare dashboard → **R2** → enable it (add billing; free tier covers a demo).
2. **Create bucket** → name it e.g. `musical-atelier`.
3. **Manage R2 API Tokens** → create a token with **Object Read & Write** for
   that bucket. Save the **Access Key ID**, **Secret Access Key**, and the
   **S3 API endpoint** (looks like `https://<accountid>.r2.cloudflarestorage.com`).
4. **CORS** (required — the browser uploads/previews *directly* to R2): on the
   bucket → Settings → CORS policy, allow your site origin:
   ```json
   [
     {
       "AllowedOrigins": ["https://<domain>"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

These map to the `R2_*` env vars: `R2_ENDPOINT` (the S3 API endpoint),
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_REGION=auto`,
`R2_FORCE_PATH_STYLE=true`.

---

## 2. Fly.io — apps, database, redis (all in `syd`)

```bash
fly auth login
```

### 2a. Create the two apps
```bash
fly apps create musicalatelier-api      # or your chosen unique name
fly apps create musicalatelier-worker
```
(If a name is taken, pick another and update the `app =` line in the matching
`fly.toml`.)

### 2b. Managed Postgres (syd)
```bash
fly mpg create --region syd
```
From its connection details, copy **two** connection strings:
- a **pooled** one → `DATABASE_URL` (runtime; add `?pgbouncer=true` if it's a
  PgBouncer endpoint),
- a **direct** one → `DIRECT_URL` (migrations + the worker).

### 2c. Redis (syd, private)
```bash
fly redis create     # choose region syd; pick a fixed-price plan for real
                      # BullMQ traffic (it polls frequently)
```
Copy the `redis://…` URL → `REDIS_URL`. (Use the TCP URL, never a REST/HTTP one.)

### 2d. Set secrets

API:
```bash
fly secrets set --app musicalatelier-api \
  APP_ORIGIN="https://<domain>" \
  DATABASE_URL="<pooled>" \
  DIRECT_URL="<direct>" \
  REDIS_URL="redis://…" \
  R2_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com" \
  R2_ACCESS_KEY_ID="…" R2_SECRET_ACCESS_KEY="…" \
  R2_BUCKET="musical-atelier" R2_REGION="auto" R2_FORCE_PATH_STYLE="true" \
  CLERK_ISSUER="https://<your-prod-clerk-domain>" \
  CLERK_JWKS_URL="https://<your-prod-clerk-domain>/.well-known/jwks.json"
```
(Clerk values come from step 4 — set them once you have the prod instance.)

Worker:
```bash
fly secrets set --app musicalatelier-worker \
  DIRECT_URL="<direct>" \
  REDIS_URL="redis://…" \
  R2_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com" \
  R2_ACCESS_KEY_ID="…" R2_SECRET_ACCESS_KEY="…" \
  R2_BUCKET="musical-atelier" R2_REGION="auto" R2_FORCE_PATH_STYLE="true"
```

### 2e. Deploy (from the repo root)
```bash
fly deploy --config apps/api/fly.toml    --dockerfile apps/api/Dockerfile .
fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile .
```
The API release step runs `prisma migrate deploy` automatically. Check:
```bash
fly logs --app musicalatelier-api       # "[api] listening …"
fly logs --app musicalatelier-worker    # "listening on queue 'transcription'"
```

### 2f. API custom domain
```bash
fly certs add api.<domain> --app musicalatelier-api
```
Then add the DNS records it prints (an A/AAAA or CNAME to the app) — see §5.

---

## 3. (done in §2) — n/a

## 4. Clerk — production instance

1. In Clerk, create/switch to a **Production** instance for `<domain>`.
2. Set the allowed origins / paths to your domain (Clerk guides DNS records for
   `clerk.<domain>` — add them).
3. Grab the **production** Publishable key (`pk_live_…`) and the Frontend API URL
   (your issuer).
4. Set the API's Clerk secrets (step 2d): `CLERK_ISSUER` = the prod Frontend API
   URL, `CLERK_JWKS_URL` = that + `/.well-known/jwks.json`.
5. The publishable key goes into Vercel as `VITE_CLERK_PUBLISHABLE_KEY` (step 5).

---

## 5. Vercel — the SPA

1. Import the GitHub repo into Vercel.
2. **Root Directory** = `apps/web` (Vercel detects the pnpm workspace at the repo
   root and links `@musical-atelier/contracts`). Framework: **Vite**.
3. **Environment variables** (Production):
   - `VITE_API_URL = https://api.<domain>`
   - `VITE_CLERK_PUBLISHABLE_KEY = pk_live_…`
4. Deploy. Add the root domain `<domain>` (and `www`) under the project's
   **Domains**. `apps/web/vercel.json` rewrites all paths to `index.html` so
   client-side routes (e.g. `/scores`) work on refresh/deep-link.

---

## 6. DNS summary

| Record | Points to |
|---|---|
| `<domain>` (root) + `www` | Vercel (per Vercel's instructions) |
| `api.<domain>` | the Fly API app (per `fly certs add` output) |
| `clerk.<domain>` (+ Clerk's records) | Clerk (per Clerk's instructions) |
| *(optional)* `files.<domain>` | an R2 custom domain for public assets |

CORS: the API allows `APP_ORIGIN` (set to `https://<domain>`); the R2 bucket
allows the same origin (step 1.4).

---

## 7. Verify production

1. `https://api.<domain>/healthz` → `{"ok":true,"checks":{"redis":true,"db":true}}`.
2. Open `https://<domain>` → Clerk sign-in → sign up.
3. Upload a sheet-music image → it uploads straight to R2, the worker runs
   Audiveris, status goes `queued → processing → completed`, and the preview
   renders (with a MIDI download too).
4. `fly logs` on both apps shows the job flowing through.

---

## Notes

- **Cost shape:** Fly API + worker + Postgres + Redis are the bulk (the worker's
  4 GB VM dominates); R2/Vercel/Clerk sit in free tiers for a demo. Verify
  current rates.
- **Scaling:** the single-region `syd` compute tier is the scale point
  (`fly scale count/​vm`); add worker machines to process more jobs in parallel.
  Frontend, storage, and auth already scale globally.

- **OMR engine (Audiveris):** the worker image builds Audiveris from source (a
  Java 25 stage) and bundles it with a JRE + `tesseract-ocr-eng`. That makes the
  image larger and the build slower, and Audiveris (a JVM, heavier on multi-page
  PDFs) wants real RAM — hence the **4 GB** worker VM (tune in
  `apps/worker/fly.toml`). The worker also converts each result to MIDI, so
  outputs are MusicXML + MIDI.
