# Worker — the "back-office staff"

**Plain language:** this is the part that does the slow, heavy work out of
sight. Back to the café analogy: the API is the cashier who takes your order;
this worker is the barista who actually makes the drink. It picks jobs off the
queue one at a time, does the hard work (transcribing your sheet music), and
reports how far along it is so the website can show a progress bar.

**Technical:** a standalone Python process running a BullMQ worker loop. It has
no web server and no public port. It runs on Fly.io in Sydney alongside the API,
queue, and database. It's a **separate program in a separate language** from the
API on purpose — see below.

## Why Python, and why separate from the API?

The transcription engine we ship (**homr**) is a Python library that does
optical music recognition with machine-learning models. Running it *in-process*
in Python is far cleaner than having the Node API shell out to it. So the worker
is its own Python app with its own dependencies and its own Docker image — the
heavy ML toolchain never bloats the lightweight API image.

The API (Node) and the worker (Python) **share no code**. They agree only on the
**job contract** — the queue name and the shape of a job — which is written down
in two mirrored files: [`packages/contracts`](../../packages/contracts) (TS) and
[`contract.py`](./contract.py) (Python). BullMQ is interoperable across
languages because both speak the same Redis Lua scripts.

## What it does (full design)

1. Pulls a `transcribe` job off the `transcription` queue (`{ scoreId, sourceKey }`).
2. Downloads the uploaded image/PDF from R2 (S3 SDK).
3. Normalises the input (e.g. rasterises PDF pages to images).
4. Runs the transcription engine behind a swappable `transcribe()` adapter.
5. Reports progress 0–100 via BullMQ progress events.
6. Uploads the resulting MusicXML to R2.
7. Mirrors the lifecycle into the Postgres `scores` row
   (`queued → processing → completed | failed`).

## What exists now (Phase 1)

A tiny worker that connects to Redis, attaches to the `transcription` queue, and
waits — proving the queue plumbing works before we add the slow ML. The
processor is a no-op; the API doesn't produce jobs yet (that starts in Phase 5).

## The transcription engine is swappable

The engine lives behind a `transcribe(input) -> MusicXML` boundary so you can
change it without touching the rest of the worker:

- **homr** (default) — transformer-based, photo/handwriting-oriented. AGPL-3.0.
- **oemer** — lighter, MIT-licensed, weaker, no handwriting.
- **Audiveris** — mature, printed-focused, Java (called via subprocess).
- **a vision LLM** — often the best shot at messy handwriting.

We build the whole pipeline with a **stub engine** first (Phase 5) that returns
a fixed MusicXML, then swap in homr (Phase 6). This proves the architecture
without fighting slow, finicky ML up front.

## Running it

Backing services must be up (`pnpm infra:up` from the repo root). Then:

```bash
cd apps/worker
uv sync                    # install deps into .venv (first time only)
uv run python worker.py    # start the worker
```

It reads `REDIS_URL` (and later `DATABASE_URL`, the `R2_*` group, homr's model
cache dir) from the repo-root `.env`.

## Why uv

`uv` is a fast, modern Python package manager and resolver. One tool handles the
virtualenv, dependency locking, and the Docker build, which keeps the worker's
setup simple and reproducible.
