# Build log

This template is built incrementally in 8 phases. Each phase is verified before
the next begins. This log tracks what's done and how to check it.

| Phase | What | Status |
|---|---|---|
| 1 | Repo skeleton + docker compose (backing services, API `/healthz`, worker connects) | ✅ done |
| 2 | Database — Prisma schema (`users`, `scores`) + first migration | ✅ done |
| 3 | Auth adapter — `authenticate()` + dev stub, one protected route | ✅ done |
| 4 | Storage — presigned upload/download against MinIO | ✅ done |
| 5 | End-to-end flow with a **stub** transcription engine | ✅ done |
| 6 | Real engine — swap in homr behind the same `transcribe()` adapter | ✅ done |
| 7 | Frontend SPA — upload, live status list, score preview | ✅ done |
| 8 | Polish + deploy to Fly (Sydney) + Vercel | ✅ deployed (live) |

---

## Phase 1 — skeleton + compose ✅

**Built:**
- pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `apps/worker`,
  `packages/contracts`).
- `docker-compose.yml` with postgres, redis, minio, and an auto bucket-create.
- Express API with `GET /` and `GET /healthz` (pings Redis).
- Python worker (uv) that connects to Redis and waits on the `transcription`
  queue.
- The shared job contract (TS + mirrored Python).
- Plain-language READMEs throughout.

**How to verify:**
```bash
cp .env.example .env
pnpm infra:up
pnpm install
cd apps/worker && uv sync && cd ../..

# Terminal A
pnpm --filter @musical-atelier/api dev
# Terminal B
cd apps/worker && uv run python worker.py

curl http://localhost:8080/healthz   # -> {"ok":true,"checks":{"redis":true}}
```
The worker should log `listening on queue 'transcription' — waiting for jobs`.

**Design decisions locked here:** Express (API), uv (worker), hybrid local dev
(backing services in Docker, apps on host), plain-language + light-technical
READMEs.

---

## Phase 2 — database (Prisma) ✅

**Built:**
- `apps/api/prisma/schema.prisma` with two models (`users`, `scores`), two
  enums (`SourceType`, `ScoreStatus`), snake_case column mapping, the
  `scores.user_id → users.id` foreign key (cascade delete), and an index on
  `user_id`.
- Dual datasource URLs: `url` (pooled, runtime) + `directUrl` (direct,
  migrations) — locally both point at the Postgres container.
- `src/lib/prisma.ts`: the shared `PrismaClient` + a `dbHealthy()` check, now
  wired into `/healthz`.
- pnpm `onlyBuiltDependencies` allowlist so Prisma's postinstall runs.
- `db:*` scripts on the api package, all loading the repo-root `.env` via
  `dotenv-cli`.

**How to verify:**
```bash
pnpm --filter @musical-atelier/api db:migrate   # applies migrations
pnpm --filter @musical-atelier/api db:studio     # GUI table browser (optional)
curl http://localhost:8080/healthz               # -> "db":true
```

**Migration workflow reminder:** `db:migrate` (= `prisma migrate dev`) in
development; `db:deploy` (= `prisma migrate deploy`) in prod/CI applies pending
migrations only and never resets.

---

## Phase 3 — auth adapter ✅

**Built (backend; the frontend half lands in Phase 7):**
- `src/lib/auth/identity.ts` — the normalised, provider-agnostic `Identity`.
- `src/lib/auth/verify.ts` — `authenticate(req)`: in `stub` mode returns a fixed
  dev identity; in `clerk` mode verifies the Bearer JWT against the issuer's
  JWKS with `jose`. The claim mapping (the only provider-specific code) is
  isolated here.
- `src/lib/auth/middleware.ts` — `requireAuth`: authenticate → upsert local user
  → attach `req.user` / `req.auth`.
- `src/features/users/db.ts` — `upsertUserByIdentity` (find-or-create by
  `external_auth_id`).
- `src/types/express.d.ts` — types for `req.user` / `req.auth`.
- Protected demo route `GET /me`.

**How to verify:**
```bash
# stub mode (default): returns the dev user, creates the users row
curl http://localhost:8080/me
# clerk mode: rejects an unauthenticated request
AUTH_MODE=clerk CLERK_JWKS_URL=https://example/.well-known/jwks.json \
  pnpm --filter @musical-atelier/api dev   # then: curl -i .../me -> HTTP 401
```

**Key property:** the rest of the app references `req.user.id` (our internal id)
only — never the provider's id. Swapping providers changes config in
`verify.ts`, not the schema or any feature code.

> **Later update:** the `stub` auth mode (and `AUTH_MODE`) was **removed** —
> Clerk is now required in every environment, including local dev (you point at
> a free Clerk development instance). This dropped the dual code paths in both
> `verify.ts` and the frontend `lib/auth.tsx`. Real Clerk auth is wired end to
> end (frontend `<ClerkProvider>`/`<SignIn>`/`<UserButton>`, backend JWKS
> verification).

---

## Phase 4 — storage (presigned R2/MinIO) ✅

**Built:**
- `src/lib/storage.ts` — an S3 client pointed at `R2_ENDPOINT` (MinIO locally,
  R2 in prod), path-style addressing, plus `presignUpload(key, contentType)`
  and `presignDownload(key)` (5-minute URLs).
- `scripts/storage-roundtrip.ts` — uploads then downloads a file using ONLY
  presigned URLs and asserts the bytes match.

**How to verify:**
```bash
pnpm --filter @musical-atelier/api verify:storage
# ✓ uploaded ... ✓ downloaded ... ✓ round-trip OK — bytes match.
```

**Key property:** file bytes never pass through the API — the browser uploads
and downloads directly to/from storage via short-lived presigned URLs.

---

## Phase 5 — end-to-end async flow (stub engine) ✅

The centerpiece: the full job lifecycle across the language boundary.

**Built (API / producer):**
- `src/lib/queue.ts` — the BullMQ producer (`transcription` queue).
- `src/features/scores/` — `db.ts`, `service.ts`, `api.ts`:
  - `POST /scores` → create row + presigned upload URL.
  - `POST /scores/:id/uploaded` → enqueue the job (with retries/backoff).
  - `GET /scores` → list my scores.
  - `GET /scores/:id` → status (+ presigned download URL when completed).
- `src/lib/bullboard.ts` — Bull Board at `/admin/queues` (optional Basic auth).
- Catch-all JSON error handler.

**Built (worker / consumer):**
- `transcribe/__init__.py` — the swappable engine adapter (STUB returns a fixed
  MusicXML).
- `storage.py` — boto3 S3 download/upload.
- `db.py` — asyncpg writer that mirrors status into the `scores` row (option a).
- `worker.py` — processes a job: processing → download → staged progress →
  transcribe → upload → completed; on error → failed + re-raise.

**How to verify (services up, API + worker running):**
```bash
# create -> upload -> enqueue -> poll status -> download (see the Phase 5 test)
# observed: queued -> processing 25/50 -> completed; download returns MusicXML
curl -L localhost:8080/admin/queues   # live queue dashboard (HTTP 200)
```

**Engineering notes resolved here:** deduped `ioredis` via a pnpm override
(BullMQ pinned a different minor); disabled `declaration` emit (TS2742
portability errors — nothing here is consumed as a library).

---

## Phase 7 — frontend SPA ✅

**Built** (`apps/web`, Vite + React + React Router, feature-based):
- `lib/api.ts` — single fetch client (attaches a Bearer token when present).
- `lib/auth.tsx` — `AuthProvider`, `useCurrentUser()`, `<RequireAuth>`; the
  frontend mirror of the backend auth adapter. Stub mode = auto-signed-in.
- `features/scores/` — upload flow (create → direct-to-storage upload →
  enqueue), the live-polling "My scores" list, and a **lazy-loaded** OSMD
  MusicXML preview.
- `features/auth/` — the sign-in page (the one provider-specific seam).
- `features/layout/AppLayout` — header + nav shell.

**Decisions/notes:**
- Frontend imports are extensionless (Vite); the API keeps `.js` (Node ESM).
- The OSMD preview (~1 MB) is code-split into its own chunk via `React.lazy`.
- The API now signs the upload URL with the **client-supplied content type** so
  the browser's PUT matches the signature for any image type, not just PNG.

**How to verify:**
```bash
pnpm --filter @musical-atelier/web dev      # http://localhost:5173
pnpm --filter @musical-atelier/web build    # typecheck + production build
```
Verified: typecheck + build pass; dev server serves; MinIO returns CORS headers
for the browser's cross-origin upload/preview.

---

## Phase 6 — real engine (homr) ✅

**Built:**
- Split `transcribe/` into a dispatcher (`__init__.py`), `stub.py`, and
  `homr_engine.py`, selectable via `TRANSCRIBE_ENGINE` (`homr` default | `stub`).
- `homr_engine.py` runs homr's CLI as a subprocess and reads back the
  `<input>.musicxml` it writes.
- Pinned the worker to **Python 3.12** (homr 0.6.2 requires <3.13) and added
  `homr>=0.6.2` (ONNX-based; no PyTorch).
- Documented model-weight caching, the **AGPL-3.0** license, and the accuracy
  caveat in the worker README.

**How to verify:**
```bash
# direct adapter call on a real printed sample
TRANSCRIBE_ENGINE=homr uv run python -c "from transcribe.homr_engine import transcribe; print(len(transcribe('sample.jpg')))"
# or full pipeline: upload a sheet-music image in the UI with the worker on homr
```
Verified: produced ~106 KB of valid MusicXML from a real printed sample, both
via the adapter directly and through the full worker pipeline
(upload → enqueue → homr → completed → download).

**Note:** first run downloads model weights (slow, needs network); cached after.
Phase 8 pre-bakes them into the worker image.

> **Later update:** the **stub** transcription engine (and `TRANSCRIBE_ENGINE`)
> was **removed** — homr is now the only engine. `transcribe/__init__.py` simply
> re-exports the homr engine; swapping engines means changing that one import.
> (Phases 5–6 above used a stub first; that scaffolding is gone.)

---

## Phase 8 — polish + deploy 🔧

**Artifacts built and locally verified (Half 1):**
- `apps/api/Dockerfile` — bundles the API with **tsup** (inlines the `contracts`
  workspace pkg so Node can run it); fresh in-image install so Prisma's engine is
  a Linux binary. Verified: image runs, `/healthz` green in-container.
- `apps/worker/Dockerfile` — Python 3.12 + uv + homr, with **model weights baked
  in** (a warm-up run during build downloads + caches them; also proves homr
  inference works on Linux). Verified: image runs, connects to the queue.
- `apps/api/fly.toml`, `apps/worker/fly.toml` (region `syd`), `apps/web/vercel.json`,
  root `.dockerignore` (excludes `node_modules`/`.venv`/`.env`).
- Robust `.env` loading (walk up from cwd) in both `apps/api/src/lib/env.ts` and
  `apps/worker/worker.py`, so the source, the bundle, and the container all work.
- `docs/DEPLOY.md` — the full provisioning + deploy runbook.

**Image sizes:** worker ~2 GB (onnxruntime + opencv + models), API ~1.5 GB
(copies the whole workspace incl. dev deps — a multi-stage prod prune would slim
it; kept simple here).

**Deployed (Half 2) — live on `musicalatelier.com`:**
- Fly `syd`: `musicalatelier-api` (https://api.musicalatelier.com, Let's Encrypt
  cert) + `musicalatelier-worker` (homr, baked models) + Managed Postgres
  (Basic, $38/mo) + Upstash Redis (Fixed 250MB, $10/mo).
- Cloudflare R2 bucket `musical-atelier` + S3 token + CORS for the site origin.
- Vercel: SPA at `www.musicalatelier.com` (apex redirects to www).
- Clerk: **production** instance on `clerk.musicalatelier.com` (5 CNAMEs in
  Route 53 → `*.clerk.services`, own Google OAuth, `pk_live_…` key). The API's
  `CLERK_ISSUER`/`CLERK_JWKS_URL` and Vercel's `VITE_CLERK_PUBLISHABLE_KEY` were
  swapped dev→prod together. (The dev instance stays for local development.)

**Gotchas worth remembering (template lessons):**
- MPG exposes only the **pooler** host (`pgbouncer.<id>.flympg.net`); there's no
  separate `<id>` direct host. Its pooler is session-mode, so use the pooler URL
  for BOTH `DATABASE_URL` (with `?pgbouncer=true`) and `DIRECT_URL` (no flag) —
  `prisma migrate deploy` works over it.
- Route 53 had **two hosted zones** for the domain; records must go in the one
  whose NS match the registered domain.
- Vercel made **www** canonical (apex → www redirect), so the API now accepts a
  comma-separated `APP_ORIGIN` (apex + www) and R2 CORS allows both.
- Vercel build-time env vars (`VITE_*`) must be set **before** the build; a
  monorepo CLI deploy runs from the **repo root** with root directory `apps/web`.

**Optional follow-ups:** Clerk production instance; slim the API image (multi-stage
prod prune); `fly scale count 0 -a musicalatelier-worker` between demos to save cost.

---

## Post-8 — Audiveris as a selectable OMR engine (branch `feat/audiveris-engine`)

Evaluating **Audiveris** (Java + Tesseract OMR) as an alternative to homr. The
worker's `transcribe(input_path) -> MusicXML` boundary absorbs the swap, so only
the worker changed.

**Built:**
- `transcribe/__init__.py` — now a tiny dispatcher: reads `OMR_ENGINE`
  (`homr` default | `audiveris`) and **lazily** imports the matching engine.
- `transcribe/audiveris_engine.py` — drives the batch CLI
  `Audiveris -batch -export -output <dir> -- <input>`, then unzips the compressed
  `.mxl` it emits (a zip; reads the rootfile named by `META-INF/container.xml`)
  and returns the inner MusicXML. Honors `AUDIVERIS_CMD` / `AUDIVERIS_TIMEOUT_SECONDS`.
- `apps/worker/Dockerfile` — multi-stage: a Java-25 stage builds Audiveris
  `5.10.2` from source (`./gradlew installDist`); the runtime stage adds a JRE +
  `tesseract-ocr-eng` and the install, keeping homr too. A build-time
  `Audiveris -help` smoke step fails fast on a broken launcher.
- `apps/worker/fly.toml` — `OMR_ENGINE=audiveris`, `AUDIVERIS_TIMEOUT_SECONDS`,
  `TESSDATA_PREFIX`; VM bumped 2 GB → 4 GB (JVM is heavier).
- Docs/config: `.env.example`, worker `README.md` (incl. macOS local setup),
  `docs/DEPLOY.md`.

**How to verify (local, the primary path):** install Tesseract + Audiveris on
macOS, set `OMR_ENGINE=audiveris` + `AUDIVERIS_CMD` in `.env`, `pnpm infra:up`,
run the worker, and upload an image **and** a PDF through the app — watch
`queued → processing → completed`, then download/preview the MusicXML. Flip back
with `OMR_ENGINE=homr` (no code change).

**Notes / to-confirm when building the image:** Audiveris moves fast (master now
targets JDK 25; we pin tag `5.10.2`). The exact `installDist` output path and the
Debian `TESSDATA_PREFIX` location should be re-verified at image-build time — the
in-build smoke step guards this. Audiveris is **AGPL-3.0** (same as homr).
