# Build log

This template is built incrementally in 8 phases. Each phase is verified before
the next begins. This log tracks what's done and how to check it.

| Phase | What | Status |
|---|---|---|
| 1 | Repo skeleton + docker compose (backing services, API `/healthz`, worker connects) | ✅ done |
| 2 | Database — Prisma schema (`users`, `scores`) + first migration | ✅ done |
| 3 | Auth adapter — `authenticate()` + dev stub, one protected route | ✅ done |
| 4 | Storage — presigned upload/download against MinIO | — |
| 5 | End-to-end flow with a **stub** transcription engine | — |
| 6 | Real engine — swap in homr behind the same `transcribe()` adapter | — |
| 7 | Frontend SPA — upload, live status list, score preview | — |
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
