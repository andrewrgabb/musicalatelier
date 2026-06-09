# API — the "front desk"

**Plain language:** this is the part of the app that the website talks to. Think
of it as the front desk of a hotel. It checks who you are (auth), looks things
up in the filing cabinet (the database), hands you a key to the storage room
(presigned upload/download links), and writes work orders for the back-office
staff (the queue + worker). Crucially, it never does the slow work itself — it
delegates and responds quickly.

**Technical:** a Node + Express + TypeScript HTTP service. It runs on Fly.io in
Sydney, co-located with the database, queue, and worker on a private network so
those hops are ~1–2 ms. The browser reaches it at `api.<your-domain>`.

## Responsibilities

- **Authenticate** every protected request via the swappable auth adapter
  (verifies a JWT against the issuer's JWKS; in local dev a stub returns a fixed
  test user).
- **Read/write the database** through Prisma (users, scores, job status).
- **Issue presigned R2 URLs** so the browser uploads/downloads files *directly*
  to/from storage — file bytes never stream through the API.
- **Enqueue background jobs** on the BullMQ queue and return immediately.
- **Serve job/score status** so the website can show live progress.
- **Host Bull Board** at `/admin/queues` — a live dashboard of the queue.

## HTTP endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /` | — | friendly JSON hello |
| `GET /healthz` | — | liveness + Redis & DB checks (Fly health check) |
| `GET /me` | ✓ | the current user (demonstrates the auth adapter) |
| `POST /scores` | ✓ | create a score row + return a presigned upload URL |
| `POST /scores/:id/uploaded` | ✓ | file uploaded → enqueue the transcription job |
| `GET /scores` | ✓ | list my scores + status |
| `GET /scores/:id` | ✓ | one score's status (+ presigned download when done) |
| `/admin/queues` | Basic* | Bull Board — live queue dashboard |

\* Bull Board is guarded by HTTP Basic auth only when `BULLBOARD_USER` /
`BULLBOARD_PASS` are set (open locally; set them in prod).

## Queue & background jobs (the producer)

The API is the **producer**: `POST /scores/:id/uploaded` adds a `transcribe` job
to the BullMQ `transcription` queue (`lib/queue.ts`) and returns `202` instantly.
The Python worker (a separate app) is the consumer. They cooperate only through
the queue, using the shared [job contract](../../packages/contracts). Jobs are
configured with retries + exponential backoff.

## Database (Prisma)

The API is the **sole owner** of the database schema and migrations. The schema
is described as code in [`prisma/schema.prisma`](./prisma/schema.prisma); Prisma
generates a type-safe client from it and turns schema changes into versioned SQL
migrations committed under `prisma/migrations/`.

Two tables today:
- **`users`** — our local record of a user. Identity lives with the auth
  provider; this table holds an internal `id` (which everything else references)
  plus `external_auth_id` (the provider's id, upserted on first login).
- **`scores`** — one uploaded score and its transcription lifecycle
  (`status`, `progress`, `source_key`, `output_key`, `job_id`, …).

Two connection URLs (see [`.env.example`](../../.env.example)):
- `DATABASE_URL` — used at **runtime** (pooled via PgBouncer in prod).
- `DIRECT_URL` — used for **migrations** (direct; migrations need advisory locks
  a pooler can't carry). Locally both point at the same Postgres container.

Commands (run from the repo root or this folder):
```bash
pnpm --filter @musical-atelier/api db:migrate    # create + apply a migration (dev)
pnpm --filter @musical-atelier/api db:deploy      # apply pending migrations (prod/CI)
pnpm --filter @musical-atelier/api db:studio      # GUI table browser
pnpm --filter @musical-atelier/api db:generate    # regenerate the typed client
```

## Auth (the swappable adapter)

Auth is the most provider-specific part of any app, so we hide it behind a thin
boundary. The rest of the codebase never imports Clerk's SDK — it depends only
on a normalised `Identity` and on `req.user` (our local user row).

- **`lib/auth/verify.ts`** — `authenticate(req)` returns an `Identity`. Two
  modes via `AUTH_MODE`: `stub` (local dev, a fixed test user, no provider
  needed) and `clerk` (verifies the Bearer JWT against the issuer's JWKS with
  `jose`). The claim mapping is the only provider-specific code, and it lives
  here — swap providers by changing config in this one file.
- **`lib/auth/middleware.ts`** — `requireAuth`: verify → **upsert the local
  `users` row** by `external_auth_id` → attach `req.user` + `req.auth`.
- Protect any route by adding `requireAuth`; see `GET /me`.

**Why a local `users` table on top of the provider?** The provider owns
identity, but our domain tables need a stable owner reference. Everything
foreign-keys to our internal `users.id`, never the provider's id — so the schema
isn't coupled to Clerk's id format. On first login the adapter upserts by
`external_auth_id`.

Local dev defaults to `AUTH_MODE=stub`, so you can build and test everything
without a Clerk account.

## File storage (presigned URLs)

Uploaded images/PDFs and generated MusicXML live in **object storage** — MinIO
locally, Cloudflare R2 in prod (same S3 SDK, different endpoint + credentials).

The rule: **file bytes never stream through the API.** Instead `lib/storage.ts`
issues short-lived **presigned URLs** and the browser talks to storage directly:
- `presignUpload(key, contentType)` → a URL the browser `PUT`s the file to.
- `presignDownload(key)` → a URL the browser `GET`s the result from.

This keeps the API fast, cheap, and stateless even for large files. Verify the
plumbing any time with:
```bash
pnpm --filter @musical-atelier/api verify:storage
```

## Layout

We use a **feature-based** structure — code is grouped by feature (a vertical
slice), with cross-cutting infrastructure in `lib/`.

```
src/
├─ index.ts              # server entry: middleware + routes
├─ lib/                  # cross-cutting infra (shared by all features)
│  ├─ env.ts             # loads + validates environment variables
│  ├─ redis.ts           # the shared ioredis connection (+ health check)
│  ├─ prisma.ts          # the shared Prisma client (+ health check)
│  ├─ storage.ts         # S3 client + presignUpload/presignDownload
│  ├─ queue.ts           # the BullMQ producer (transcription queue)
│  ├─ bullboard.ts       # Bull Board dashboard router (+ Basic-auth guard)
│  └─ auth/              # the swappable auth adapter
│     ├─ identity.ts     #   the normalised Identity shape
│     ├─ verify.ts       #   authenticate() — stub | clerk (JWKS via jose)
│     └─ middleware.ts   #   requireAuth — verify + upsert user + attach req.user
├─ prisma/
│  ├─ schema.prisma      # the database blueprint (models + enums)
│  └─ migrations/        # versioned SQL migrations (committed)
└─ features/
   ├─ users/             # db.ts: upsert local user by external_auth_id
   └─ scores/            # the upload -> transcription lifecycle
      ├─ api.ts          #   route handlers (thin)
      ├─ service.ts      #   business logic (presign, enqueue, status)
      └─ db.ts           #   Prisma queries (scoped to the user)
```

## A note on `.js` imports in `.ts` files

You'll see imports like `import { env } from "./lib/env.js"` even though the file
is `env.ts`. That's **not** JavaScript — it's the TypeScript-on-Node-ESM
convention: this service runs under Node's native ES modules, where import
specifiers must carry the `.js` extension that the compiled output *will* have.
TypeScript deliberately makes you write the runtime path. (The Vite frontend
uses bundler resolution, so it omits extensions instead.)

## Running it

From the repo root (backing services must be up — `pnpm infra:up`):

```bash
pnpm --filter @musical-atelier/api dev    # hot-reloading dev server
```

It reads configuration from the repo-root `.env`. Key variables (see
[`.env.example`](../../.env.example)): `PORT`, `APP_ORIGIN` (CORS), `REDIS_URL`,
`DATABASE_URL` / `DIRECT_URL`, the `R2_*` group, and the `AUTH_MODE` group.

## Why these choices

- **Express** — the most widely recognised Node web framework, so this template
  is instantly readable to the most people. Bull Board mounts onto it cleanly.
- **ioredis (not the Upstash REST client)** — BullMQ needs a persistent TCP
  connection; the REST client can't carry its blocking commands and Lua scripts.
- **Presigned URLs** — keeping large files out of the API keeps it fast, cheap,
  and stateless.
