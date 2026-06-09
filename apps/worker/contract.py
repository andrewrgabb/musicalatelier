"""The Python side of the job contract.

This MUST stay in sync with packages/contracts/src/index.ts — they describe the
same queue from the two languages. The API (Node) produces jobs; this worker
(Python) consumes them. They share nothing else.
"""

# Name of the BullMQ queue that carries transcription jobs.
TRANSCRIPTION_QUEUE = "transcription"

# The (single) job name on that queue.
TRANSCRIBE_JOB = "transcribe"

# Lifecycle states mirrored into the Postgres `scores.status` column.
STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

# Job data shape (for reference; Python reads these keys off job.data):
#   { "scoreId": str, "sourceKey": str }
# Success return shape:
#   { "outputKey": str }
