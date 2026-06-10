"""Musical Atelier worker — entry point.

Consumes the BullMQ `transcription` queue and runs the OMR pipeline:
  1. mark the attempt `processing`
  2. download the uploaded source from storage
  3. run the chosen engine (audiveris | homr, with the run's options) via transcribe()
  4. convert the MusicXML to MIDI (best-effort)
  5. report progress (BullMQ progress events + the attempts row)
  6. upload the MusicXML + MIDI and mark the attempt `completed`
  7. on any error, mark the attempt `failed` and let BullMQ record the failure

Each run is an `attempts` row (a score can be transcribed many times with
different options). Status is mirrored into Postgres (option a) so the row stays
the user-facing source of truth even if Redis is cleared.
"""

import asyncio
import os
import signal
import tempfile
from pathlib import Path

from dotenv import find_dotenv, load_dotenv

# Load the nearest .env (walking up from the working directory) BEFORE importing
# modules that read env. In local dev this finds the repo-root .env; in the
# container there's no .env and Fly injects real env vars, so this is a no-op.
load_dotenv(find_dotenv(usecwd=True))

from bullmq import UnrecoverableError  # noqa: E402

from contract import TRANSCRIPTION_QUEUE  # noqa: E402
import db  # noqa: E402
import storage  # noqa: E402
from transcribe import DEFAULT_ENGINE, transcribe  # noqa: E402
from transcribe.errors import TranscriptionInputError  # noqa: E402
from transcribe.midi import musicxml_to_midi  # noqa: E402

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


def _redacted(url: str) -> str:
    """Mask any password in a connection URL so it's safe to log."""
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(url)
    if parts.password:
        user = parts.username or ""
        netloc = f"{user}:***@{parts.hostname or ''}"
        if parts.port:
            netloc += f":{parts.port}"
        return urlunsplit(parts._replace(netloc=netloc))
    return url


def _ext_from_key(key: str) -> str:
    suffix = Path(key).suffix
    return suffix if suffix else ".bin"


async def process(job, job_token):
    """Handle one transcription job."""
    data = job.data
    score_id = data["scoreId"]
    attempt_id = data["attemptId"]
    source_key = data["sourceKey"]
    engine = data.get("engine") or DEFAULT_ENGINE
    options = data.get("options") or {}
    print(
        f"[worker] job {job.id} start: score={score_id} attempt={attempt_id} "
        f"engine={engine} key={source_key}"
    )

    try:
        await db.set_processing(attempt_id, engine)
        await job.updateProgress(0)

        # 1) download the uploaded source (blocking S3 call off the event loop)
        source_bytes = await asyncio.to_thread(storage.download, source_key)

        # write it to a temp file so the engine gets a real path
        with tempfile.NamedTemporaryFile(
            suffix=_ext_from_key(source_key), delete=False
        ) as tmp:
            tmp.write(source_bytes)
            input_path = tmp.name

        try:
            # 2) coarse staged progress. The engine runs as one opaque step, so
            #    we nudge the bar to 75% before it starts and 100% when it
            #    returns. (A finer-grained engine could report real progress.)
            for pct in (25, 50, 75):
                await asyncio.sleep(1)
                await job.updateProgress(pct)
                await db.set_progress(attempt_id, pct)

            # 3) run the chosen engine with this run's options
            musicxml = await asyncio.to_thread(transcribe, engine, input_path, options)
        finally:
            os.unlink(input_path)

        # 4) upload the MusicXML (keys are namespaced per attempt so re-runs
        #    don't overwrite each other's outputs)
        output_key = f"outputs/{score_id}/{attempt_id}/score.musicxml"
        await asyncio.to_thread(
            storage.upload,
            output_key,
            musicxml.encode("utf-8"),
            "application/vnd.recordare.musicxml+xml",
        )

        # 5) convert to MIDI (best-effort — MusicXML is the primary output, so a
        #    conversion failure must not fail the whole attempt)
        output_midi_key = None
        try:
            midi_bytes = await asyncio.to_thread(musicxml_to_midi, musicxml)
            output_midi_key = f"outputs/{score_id}/{attempt_id}/score.mid"
            await asyncio.to_thread(
                storage.upload, output_midi_key, midi_bytes, "audio/midi"
            )
        except Exception as midi_err:  # noqa: BLE001
            print(f"[worker] job {job.id} MIDI conversion failed: {midi_err}")

        # 6) mark completed
        await job.updateProgress(100)
        await db.set_completed(attempt_id, output_key, output_midi_key)
        print(
            f"[worker] job {job.id} done: output={output_key} midi={output_midi_key}"
        )
        return {"outputKey": output_key, "outputMidiKey": output_midi_key}

    except TranscriptionInputError as err:
        # The input itself can't be transcribed — retrying won't help, so fail it
        # now (no further attempts) and record why.
        await db.set_failed(attempt_id, str(err))
        print(f"[worker] job {job.id} FAILED (unrecoverable): {err}")
        raise UnrecoverableError(str(err)) from err

    except Exception as err:  # noqa: BLE001 — record then re-raise; BullMQ retries
        await db.set_failed(attempt_id, str(err))
        print(f"[worker] job {job.id} FAILED (will retry if attempts remain): {err}")
        raise


async def main():
    from bullmq import Worker

    print(f"[worker] connecting to Redis at {_redacted(REDIS_URL)}")
    worker = Worker(TRANSCRIPTION_QUEUE, process, {"connection": REDIS_URL})
    print(f"[worker] listening on queue '{TRANSCRIPTION_QUEUE}' — waiting for jobs")

    stop = asyncio.Future()

    def _shutdown():
        if not stop.done():
            stop.set_result(True)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            pass

    await stop
    print("[worker] shutting down")
    await worker.close()
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
