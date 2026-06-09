# Musical Atelier

A **reference full-stack web application** you can clone and learn from. It
demonstrates how a modern, production-shaped app fits together — frontend,
API, database, background jobs, file storage, and authentication — using the
standard, widely-recognised technology for each layer.

> **The example use case:** upload a photo or PDF of sheet music (even
> hand-written), and the app transcribes it into **MusicXML** — a file you can
> open in music-notation software like MuseScore. The transcription is slow and
> CPU-heavy, which is exactly why it's a great demo: it shows how real apps push
> slow work into the **background** instead of making you wait.

This README is written for **everyone** — including non-engineers. Each section
starts in plain language, then adds a short technical note. Every folder has its
own README that goes deeper on that piece.

---

## The big idea in one picture

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                      YOUR BROWSER                          │
                 │   The Musical Atelier website (a "single-page app")        │
                 └───────────────┬─────────────────────────┬─────────────────┘
                                 │                          │
                  (1) loads the website            (2) calls the API
                                 │                          │
                                 ▼                          ▼
            ┌────────────────────────────┐   ┌──────────────────────────────────┐
            │  Vercel (global CDN)        │   │  API — Node/Express  (Sydney)     │
            │  Serves the website fast    │   │  The "front desk": checks who you  │
            │  from everywhere            │   │  are, talks to the database, hands │
            └────────────────────────────┘   │  slow work to the queue            │
                                              └───┬───────────┬─────────────┬─────┘
                                                  │           │             │
                                       (3) save records   (4) hand off   (5) presigned
                                                  │         slow job        upload/download
                                                  ▼           ▼             ▼
                                       ┌──────────────┐ ┌──────────┐  ┌──────────────┐
                                       │  Postgres    │ │  Redis   │  │ Cloudflare R2│
                                       │  (database)  │ │ (queue)  │  │ (file store) │
                                       └──────────────┘ └────┬─────┘  └──────▲───────┘
                                                             │               │
                                                   (6) picks up the job      │
                                                             ▼               │
                                              ┌──────────────────────────┐   │
                                              │ Worker — Python (Sydney)  │───┘
                                              │ Does the heavy lifting:   │ (7) download input,
                                              │ runs the transcription    │     upload result
                                              │ engine, reports progress  │
                                              └──────────────────────────┘
```

**The core principle:** keep the things that talk to each other constantly —
the API, database, queue, and worker — physically *co-located* in one region
(Sydney) so they're milliseconds apart. Keep the things users touch directly —
the website, file downloads, sign-in — *globally distributed* so they're fast
no matter where the user is.

---

## The stack at a glance

| Layer | What it does | Technology | Where it runs |
|---|---|---|---|
| **Frontend** | The website you see and click | React (single-page app) | Vercel — global CDN |
| **API** | The "front desk" — auth, data, hands off jobs | Node + Express + TypeScript | Fly.io — Sydney |
| **Database** | Remembers users, uploads, job status | Postgres + Prisma | Fly.io — Sydney |
| **Queue** | A to-do list of slow jobs | BullMQ on Redis | Fly.io — Sydney |
| **Worker** | Does the slow work (transcription) | Python + homr | Fly.io — Sydney |
| **Auth** | Sign-in and accounts | Clerk (behind an adapter) | Hosted |
| **File storage** | Holds uploaded images & results | Cloudflare R2 | Global |

Locally, most cloud services have a **real open-source counterpart** you run on
your own machine — so you develop against the actual software, not a fake:

| Cloud (prod) | Local (dev) |
|---|---|
| Fly Managed Postgres | `postgres` container |
| Fly/Upstash Redis | `redis` container |
| Cloudflare R2 | **MinIO** container (S3-compatible) |
| Clerk | a Clerk **development instance** (free; hosted, but works on localhost) |

The one exception is **Clerk** — it's hosted SaaS with no local server, so you
point at a free Clerk *development* instance (its keys allow `localhost`).
Auth is always real; there's no "skip login" mode.

Only the *addresses and passwords* change between local and prod — never the
code. That swap happens entirely through environment variables (see
[`.env.example`](./.env.example)).

---

## Why a "background worker"? (the heart of the demo)

Imagine a café. When you order a coffee, the cashier (**the API**) doesn't make
your coffee while you stand there blocking the line. They write your order on a
ticket (**the queue**), hand it to the barista (**the worker**), and immediately
serve the next customer. The barista works through tickets and calls your name
when ready.

That's exactly what happens here:

1. You upload sheet music. The API instantly says *"got it, here's your ticket
   number"* and returns — it does **not** wait for transcription.
2. The API drops a job on the **queue** (Redis/BullMQ).
3. The **worker** picks up the job, does the slow transcription, and reports
   progress as it goes.
4. The website watches the ticket and shows a live status bar:
   `queued → processing → 42% → completed`.

This keeps the app responsive even when the actual work is slow — the single
most important pattern in this template.

---

## The two request flows

**Fast / synchronous** (e.g. "show me my uploads"):
browser → API (Sydney) → Postgres → back to browser. A few milliseconds inside
the data tier; the only real distance is browser ↔ Sydney.

**Slow / asynchronous** (the transcription):
browser → API returns `202 Accepted` + a job id instantly → worker processes in
the background → website polls/streams status → result appears (a download link
to the MusicXML in R2). Nothing ever blocks an HTTP request.

---

## Repository layout

```
/
├─ docker-compose.yml     # Local backing services: postgres, redis, minio
├─ .env.example           # Every environment variable, documented
├─ turbo.json             # Runs the JS/TS apps together (Turborepo)
├─ apps/
│  ├─ web/                # The website — React single-page app (Vercel)
│  ├─ api/                # The "front desk" — Node/Express API (Fly, Sydney)
│  └─ worker/             # The heavy lifter — Python worker (Fly, Sydney)
└─ packages/
   └─ contracts/          # The shared "job contract" both api + worker obey
```

Each of those folders has its own README explaining what it does and how.

---

## Getting started (local development)

> **Status:** the full local demo works end-to-end (Phases 1–5, 7) against a
> **stub** transcription engine — upload a file and watch it go
> `queued → processing → completed` with an in-browser score preview. The real
> homr engine (Phase 6) and cloud deploy (Phase 8) are still to come. See
> [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md).

### Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node.js ≥ 20** | runs the API & build tooling | https://nodejs.org |
| **pnpm** | package manager for the JS workspaces | `npm install -g pnpm` |
| **uv** | Python tooling for the worker | `brew install uv` |
| **Docker Desktop** | runs postgres/redis/minio locally | `brew install --cask docker` |
| **A free Clerk account** | authentication (no local stand-in) | https://clerk.com |

> macOS note: installing Docker Desktop via Homebrew asks for your password at
> the end (it creates a system symlink). Run it in your own terminal so you can
> type the password, then **open Docker Desktop once** so its engine starts.

### 1. Set up your environment file

```bash
cp .env.example .env       # the defaults already match docker-compose.yml
```

Then fill in the **Clerk** values (the one service with no local stand-in).
Create a free app at https://clerk.com → **API keys**, and set
`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_ISSUER`, and `CLERK_JWKS_URL` in `.env`
(see the comments in `.env.example`). Everything else works with the defaults.

### 2. Start the backing services (Postgres, Redis, MinIO)

```bash
pnpm infra:up              # = docker compose up -d
```

This also creates the MinIO bucket automatically. You can browse uploaded files
at the MinIO console: http://localhost:9001 (user/pass: `minioadmin`).

### 3. Install dependencies

```bash
pnpm install               # JS workspaces (web, api, contracts)

cd apps/worker && uv sync  # Python worker deps (creates apps/worker/.venv)
cd ../..
```

### 4. Run the API, the worker, and the website

```bash
# Terminal A — the API
pnpm --filter @musical-atelier/api dev

# Terminal B — the worker
cd apps/worker && uv run python worker.py

# Terminal C — the website
pnpm --filter @musical-atelier/web dev
```

### 5. Try the demo

Open the website at **http://localhost:5173**. You'll be prompted to **sign in
via Clerk** (create a test account — it's your Clerk dev instance). Then upload
any image or PDF, and watch "My scores" move
through `queued → processing → completed` live, and click **Show preview** to
see the transcribed MusicXML rendered in the browser. You can also watch the job
flow through the queue at **http://localhost:8080/admin/queues** (Bull Board).

> The local engine is a **stub** that returns a fixed sample score, so every
> upload "transcribes" to the same thing — that's intentional: it proves the
> whole pipeline. The real homr engine is Phase 6.

Quick health check from the terminal:
```bash
curl http://localhost:8080/healthz
# -> {"ok":true,"checks":{"redis":true,"db":true},...}
```

### Handy commands

```bash
pnpm infra:up        # start postgres + redis + minio
pnpm infra:down      # stop them (keeps data)
pnpm infra:reset     # stop them AND wipe all local data volumes
pnpm infra:logs      # tail the backing-service logs
```

### Running in WebStorm / JetBrains

The repo ships shared run configurations (committed under
`.idea/runConfigurations/`), so opening the project in WebStorm gives you
ready-made buttons in the Run menu:

- **Dev: all** — one click starts the whole stack (a compound of Infra, API,
  Worker, Web).
- **API**, **Web**, **Worker** — run a single service. `Web` launches the SPA
  with the JS debugger attached; `API`/`Web` are npm configs, `Worker` runs
  `uv run python worker.py`.
- **Infra: up** / **Infra: down**, **DB: migrate**, **DB: studio** — the
  `infra:*` and `db:*` package scripts.

The JS configs use the project Node interpreter; the Worker runs in the
integrated terminal so it picks up `uv` from your shell. (First-time setup
steps 1–3 above — `.env`, `pnpm install`, `uv sync` — still need doing once.)

---

## Where to read next

- [`apps/api/README.md`](./apps/api/README.md) — the front-desk API
- [`apps/worker/README.md`](./apps/worker/README.md) — the background worker
- [`apps/web/README.md`](./apps/web/README.md) — the website
- [`packages/contracts/README.md`](./packages/contracts/README.md) — the job contract
- [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md) — what's built so far, phase by phase
