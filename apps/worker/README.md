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

The worker does two jobs that suit Python: it drives the **Audiveris** OMR engine
(a Java app, run as a subprocess) and converts the resulting MusicXML to **MIDI**
(via `music21`). Keeping all of this in its own app with its own dependencies and
Docker image means the heavy toolchain (a JVM, Tesseract, music21) never bloats
the lightweight API image.

The API (Node) and the worker (Python) **share no code**. They agree only on the
**job contract** — the queue name and the shape of a job — written down in two
mirrored files: [`packages/contracts`](../../packages/contracts) (TS) and
[`contract.py`](./contract.py) (Python). BullMQ is interoperable across languages
because both speak the same Redis Lua scripts.

## What it does

A score is the uploaded source; each transcription run is an **attempt** (a score
can be re-processed many times with different options, so it keeps a history).
On each job the worker:

1. Pulls a `transcribe` job off the `transcription` queue
   (`{ scoreId, attemptId, sourceKey, options }`).
2. Marks the attempt `processing` and downloads the source from storage.
3. Runs **Audiveris** with the run's options behind the `transcribe()` adapter.
4. Converts the MusicXML to **MIDI** (best-effort).
5. Uploads both outputs (keys namespaced per attempt) and marks the attempt
   `completed` — or `failed` on error.

Status is mirrored into the Postgres `attempts` row so it stays the user-facing
source of truth even if Redis is cleared.

Files:
- `worker.py` — the job processor + BullMQ worker loop.
- `transcribe/__init__.py` — the engine adapter (re-exports the Audiveris engine).
- `transcribe/audiveris_engine.py` — runs Audiveris and returns the MusicXML.
- `transcribe/midi.py` — converts MusicXML → MIDI (music21).
- `storage.py` — boto3 S3 download/upload.
- `db.py` — asyncpg writer mirroring status into the `attempts` row.
- `contract.py` — the Python mirror of the job contract.

## The engine: Audiveris

- **What it is:** a mature Java OMR application. It runs headless from the command
  line, handles **PDFs and images** natively, and does well on dense, multi-staff
  printed scores.
- **How we call it:** `audiveris_engine.py` runs the batch CLI
  `Audiveris [-constant …] -batch -export -output <dir> -- <input>` and reads the
  result back. Audiveris exports **compressed MusicXML** (a `.mxl`, a zip
  containing the `.xml`), so the adapter unzips it and returns the inner XML.
- **What it needs:** a Java runtime, the Audiveris distribution, and Tesseract OCR
  language data. In production the worker Docker image bakes all three
  (build-from-source stage + JRE + `tesseract-ocr-eng`) and sets `AUDIVERIS_CMD`
  / `TESSDATA_PREFIX` for you.
- **License:** Audiveris is **AGPL-3.0** — the network-use clause matters for a
  hosted service.

The engine lives behind a `transcribe(input_path, options) -> MusicXML` boundary
(`transcribe/`). To swap in a different engine (oemer, a vision LLM, …), drop in a
module exposing the same function and re-export it from `transcribe/__init__.py`.

### Transcription options

The curated options (see `TranscriptionOptions` in
[`packages/contracts`](../../packages/contracts)) are mapped to Audiveris
**application constants** passed as `-constant key=value` flags. The keys were
verified against Audiveris 5.9.0 source:

| Option | Constant | Values |
|---|---|---|
| `inputQuality` | `…sheet.Profiles.defaultQuality` | `Synthetic` / `Standard` / `Poor` |
| `binarization` | `…image.FilterDescriptor.defaultKind` | `GLOBAL` / `ADAPTIVE` |
| `binarizationThreshold` | `…image.GlobalDescriptor.defaultThreshold` | `0`–`255` |
| `ocrLanguage` | `…text.Language.defaultSpecification` | e.g. `eng` |
| `switches.*` | `…sheet.ProcessingSwitches.<name>` | `true` / `false` |

(`<name>` ∈ `smallHeads`, `crossHeads`, `lyrics`, `articulations`,
`implicitTuplets`.) An unrecognised or out-of-range option is simply not applied,
so it can never break the command.

### MIDI export

`transcribe/midi.py` converts the engine's MusicXML to a standard MIDI file with
music21. It's engine-agnostic and **best-effort**: if conversion fails the attempt
still completes with its MusicXML (just no MIDI), rather than failing the job.

### Honest caveat

Optical music recognition — especially of hand-written or low-quality images — is
genuinely hard. Accuracy varies and results often need post-editing. The options
above (and re-processing with different settings) let you tune for your inputs.

## Running it locally (macOS)

1. Install Tesseract (provides `eng.traineddata`):
   ```bash
   brew install tesseract
   ```
2. Install Audiveris — the official macOS installer from
   [its releases](https://github.com/Audiveris/audiveris/releases) bundles its own
   JRE, so you don't need a system Java.
3. Point the worker at it in the repo-root `.env`:
   ```bash
   AUDIVERIS_CMD=/Applications/Audiveris.app/Contents/MacOS/Audiveris
   # Only if Audiveris can't find Tesseract's data on its own:
   TESSDATA_PREFIX=/opt/homebrew/share/tessdata
   ```
   If `AUDIVERIS_CMD` is unset the adapter falls back to an `Audiveris`/`audiveris`
   binary on `PATH`.
4. With backing services up (`pnpm infra:up` from the repo root):
   ```bash
   cd apps/worker
   uv sync                    # install deps into .venv (first time only)
   uv run python worker.py    # start the worker
   ```

It reads `REDIS_URL`, `DATABASE_URL`, the `R2_*` group, and the `AUDIVERIS_*` /
`TESSDATA_PREFIX` vars from the repo-root `.env`.

## Why uv

`uv` is a fast, modern Python package manager and resolver. One tool handles the
virtualenv, dependency locking, and the Docker build, which keeps the worker's
setup simple and reproducible.
