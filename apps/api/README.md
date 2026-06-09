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

## What exists now (Phase 1)

A minimal server that proves connectivity:

- `GET /` — a friendly JSON hello.
- `GET /healthz` — liveness + a Redis ping (Fly's health check target).

Later phases add the `/scores` routes, the auth adapter, presigned URLs, the
BullMQ producer, and Bull Board.

## Layout

We use a **feature-based** structure — code is grouped by feature (a vertical
slice), with cross-cutting infrastructure in `lib/`.

```
src/
├─ index.ts              # server entry: middleware + routes
├─ lib/                  # cross-cutting infra (shared by all features)
│  ├─ env.ts             # loads + validates environment variables
│  └─ redis.ts           # the shared ioredis connection (+ health check)
└─ features/             # added in later phases:
   └─ scores/            #   api/ (routes), service/ (logic), db/ (Prisma)
```

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
