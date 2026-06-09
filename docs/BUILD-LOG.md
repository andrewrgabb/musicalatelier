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
| 8 | Polish + deploy to Fly (Sydney) + Vercel | — |

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
