"""Musical Atelier worker — entry point.

Consumes the BullMQ `transcription` queue and runs the OMR pipeline:
  1. mark the score `processing`
  2. download the uploaded source from storage
  3. run the transcription engine (stub now; homr in Phase 6) behind transcribe()
  4. report progress (BullMQ progress events + the scores row)
  5. upload the MusicXML and mark the score `completed`
  6. on any error, mark the score `failed` and let BullMQ record the failure

Status is mirrored into Postgres (option a) so the row stays the user-facing
source of truth even if Redis is cleared.
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

from contract import TRANSCRIPTION_QUEUE  # noqa: E402
import db  # noqa: E402
import storage  # noqa: E402
from transcribe import transcribe  # noqa: E402

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


def _ext_from_key(key: str) -> str:
    suffix = Path(key).suffix
    return suffix if suffix else ".bin"


async def process(job, job_token):
    """Handle one transcription job."""
    data = job.data
    score_id = data["scoreId"]
    source_key = data["sourceKey"]
    print(f"[worker] job {job.id} start: score={score_id} key={source_key}")

    try:
        await db.set_processing(score_id)
        await job.updateProgress(0)

        # 1) download the uploaded source (blocking S3 call off the event loop)
        source_bytes = await asyncio.to_thread(storage.download, source_key)

        # write it to a temp file so the engine gets a real path (matches homr)
        with tempfile.NamedTemporaryFile(
            suffix=_ext_from_key(source_key), delete=False
        ) as tmp:
            tmp.write(source_bytes)
            input_path = tmp.name

        try:
            # 2) coarse staged progress. homr runs as one opaque step, so we
            #    nudge the bar to 75% before it starts and 100% when it returns.
            #    (A finer-grained engine could report real progress here.)
            for pct in (25, 50, 75):
                await asyncio.sleep(1)
                await job.updateProgress(pct)
                await db.set_progress(score_id, pct)

            # 3) run the engine behind the swappable adapter
            musicxml = await asyncio.to_thread(transcribe, input_path)
        finally:
            os.unlink(input_path)

        # 4) upload the result
        output_key = f"outputs/{score_id}/score.musicxml"
        await asyncio.to_thread(
            storage.upload,
            output_key,
            musicxml.encode("utf-8"),
            "application/vnd.recordare.musicxml+xml",
        )

        # 5) mark completed
        await job.updateProgress(100)
        await db.set_completed(score_id, output_key)
        print(f"[worker] job {job.id} done: output={output_key}")
        return {"outputKey": output_key}

    except Exception as err:  # noqa: BLE001 — record then re-raise for BullMQ
        await db.set_failed(score_id, str(err))
        print(f"[worker] job {job.id} FAILED: {err}")
        raise


async def main():
    from bullmq import Worker

    print(f"[worker] connecting to Redis at {REDIS_URL}")
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
