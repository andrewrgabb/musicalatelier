# Build log

This template is built incrementally in 8 phases. Each phase is verified before
the next begins. This log tracks what's done and how to check it.

| Phase | What | Status |
|---|---|---|
| 1 | Repo skeleton + docker compose (backing services, API `/healthz`, worker connects) | ✅ done |
| 2 | Database — Prisma schema (`users`, `scores`) + first migration | ✅ done |
| 3 | Auth adapter — `authenticate()` + dev stub, one protected route | — |
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
