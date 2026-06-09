"""Musical Atelier worker — entry point.

Phase 1 scope: prove the worker can reach Redis and attach to the BullMQ queue.
It starts a BullMQ Worker on the `transcription` queue with a no-op processor
and waits. No jobs are produced yet (the API starts enqueuing in Phase 5).

Later phases add: downloading the source from R2, running the OMR engine
(stub, then homr) behind a `transcribe()` adapter, reporting progress, writing
the result back to R2, and mirroring status into the Postgres `scores` row.
"""

import asyncio
import os
import signal
from pathlib import Path

from dotenv import load_dotenv

from contract import TRANSCRIPTION_QUEUE

# Load the single repo-root .env in local dev. worker.py is at
# apps/worker/worker.py, so three parents up is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


async def process(job, job_token):
    """Handle one transcription job. No-op until Phase 5."""
    print(f"[worker] received job {job.id}: {job.data}")
    return {"outputKey": None}


async def main():
    # Importing here keeps the import error message clear if deps are missing.
    from bullmq import Worker

    print(f"[worker] connecting to Redis at {REDIS_URL}")
    worker = Worker(
        TRANSCRIPTION_QUEUE,
        process,
        {"connection": REDIS_URL},
    )
    print(f"[worker] listening on queue '{TRANSCRIPTION_QUEUE}' — waiting for jobs")

    # Keep running until we get SIGINT/SIGTERM, then shut down cleanly.
    stop = asyncio.Future()

    def _shutdown():
        if not stop.done():
            stop.set_result(True)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            pass  # add_signal_handler isn't available on some platforms

    await stop
    print("[worker] shutting down")
    await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
