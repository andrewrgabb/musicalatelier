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

## What it does

On each job the worker: marks the score `processing`, downloads the source from
storage (`storage.py`), reports staged progress (BullMQ events + the `scores`
row via `db.py`), runs `transcribe()` (homr), uploads the resulting MusicXML,
and marks the score `completed` — or `failed` on error.

Files:
- `worker.py` — the job processor + BullMQ worker loop.
- `transcribe/__init__.py` — the engine adapter; picks the engine from `OMR_ENGINE`.
- `transcribe/homr_engine.py` — runs homr and returns the MusicXML.
- `transcribe/audiveris_engine.py` — runs Audiveris and returns the MusicXML.
- `storage.py` — boto3 S3 download/upload.
- `db.py` — asyncpg writer mirroring status into the `scores` row.
- `contract.py` — the Python mirror of the job contract.

## The transcription engine is swappable

The engine lives behind a `transcribe(input_path) -> MusicXML` boundary
(`transcribe/`). Two engines ship today and `OMR_ENGINE` picks one at runtime
(default `homr`):

```bash
OMR_ENGINE=homr        # shipped default — ONNX, Python
OMR_ENGINE=audiveris   # Java + Tesseract, via the batch CLI
```

`transcribe/__init__.py` reads that env var and **lazily** imports the matching
module, so an engine's heavy deps are only loaded when it's selected. To add a
third engine (oemer — MIT, lighter; a vision LLM — best for messy handwriting),
drop in a sibling module exposing `transcribe(input_path) -> str` and add a
branch to the dispatcher. Nothing else in the worker changes.

### homr (the shipped engine)

- **What it is:** transformer-based OMR (Polyphonic-TrOMR + UNet segmentation),
  ONNX-based (no PyTorch). Focuses on pitch/rhythm on the treble/bass clef;
  omits dynamics, articulation, and double accidentals.
- **How we call it:** homr exposes a CLI (`homr <image>`) that writes
  `<image>.musicxml` beside the input. We invoke it as a subprocess and read the
  result back — which also isolates its heavy/native work from the worker loop.
- **Model weights:** downloaded from homr's GitHub releases on first run and
  cached locally (so the first transcription takes minutes; later ones are
  fast). In production we pre-bake the weights into the Docker image (Phase 8).
- **License:** homr is **AGPL-3.0** — its network-use clause matters for a
  hosted service. If that's a problem, switch to a permissive engine (oemer is
  MIT) behind the same adapter.

### Audiveris (alternative engine)

- **What it is:** a mature Java OMR application. It runs headless from the
  command line, handles **PDFs and images** natively (homr is images-only), and
  tends to do better on dense, multi-staff, printed scores.
- **How we call it:** `audiveris_engine.py` runs the batch CLI
  `Audiveris -batch -export -output <dir> -- <input>` and reads the result back.
  Audiveris exports **compressed MusicXML** (a `.mxl`, which is a zip containing
  the `.xml`), so the adapter unzips it and returns the inner XML string.
- **What it needs:** a Java runtime, the Audiveris distribution, and Tesseract
  OCR language data. In production the worker Docker image bakes all three
  (build-from-source stage + JRE + `tesseract-ocr-eng`) and sets `AUDIVERIS_CMD`
  / `TESSDATA_PREFIX` for you.
- **License:** Audiveris is **AGPL-3.0** (same as homr) — the network-use clause
  matters for a hosted service.

#### Running Audiveris locally (macOS)

1. Install Tesseract (provides `eng.traineddata`):
   ```bash
   brew install tesseract
   ```
2. Install Audiveris — the official macOS installer from
   [its releases](https://github.com/Audiveris/audiveris/releases) bundles its
   own JRE, so you don't need a system Java.
3. Point the worker at it in the repo-root `.env`:
   ```bash
   OMR_ENGINE=audiveris
   AUDIVERIS_CMD=/Applications/Audiveris.app/Contents/app/bin/Audiveris
   # Only if Audiveris can't find Tesseract's data on its own:
   TESSDATA_PREFIX=/opt/homebrew/share/tessdata
   ```
4. Run the worker as usual (`uv run python worker.py`) and upload a score.

If `AUDIVERIS_CMD` is unset the adapter falls back to an `Audiveris`/`audiveris`
binary on `PATH`.

### Honest caveat

Optical music recognition — especially of hand-written or low-quality images —
is genuinely hard. Accuracy varies a lot and results often need post-editing.
That's expected: the value of this template is the **end-to-end pipeline**
(upload → queue → worker → live status → result), and the swappable adapter lets
you plug in whatever performs best for your inputs.

## Running it

Backing services must be up (`pnpm infra:up` from the repo root). Then:

```bash
cd apps/worker
uv sync                    # install deps into .venv (first time only)
uv run python worker.py    # start the worker
```

It reads `REDIS_URL`, `DATABASE_URL`, the `R2_*` group, and the engine config
(`OMR_ENGINE` plus the `HOMR_*` / `AUDIVERIS_*` vars) from the repo-root `.env`.

## Why uv

`uv` is a fast, modern Python package manager and resolver. One tool handles the
virtualenv, dependency locking, and the Docker build, which keeps the worker's
setup simple and reproducible.
