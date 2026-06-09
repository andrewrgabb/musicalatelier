# contracts — the shared agreement

**Plain language:** the API and the worker are two separate programs written in
two different languages (TypeScript and Python). For them to cooperate, they
need to agree on a few things: *what is the to-do list called?* and *what
information does each to-do item carry?* This little package writes that
agreement down so both sides stay in sync. It's like the standard order ticket
both the cashier and the barista understand.

**Technical:** a tiny TypeScript package defining the **job contract** — the
queue name, job name, the job-data shape, the result shape, and the lifecycle
status values. It's imported by `web` and `api`. The Python worker can't import
TypeScript, so it keeps a **mirror** in
[`apps/worker/contract.py`](../../apps/worker/contract.py). **If you change one
side, change the other.**

## The contract

| Thing | Value |
|---|---|
| Queue name | `transcription` |
| Job name | `transcribe` |
| Job data (API → worker) | `{ scoreId: string, sourceKey: string }` |
| Progress | integer `0–100` via BullMQ `updateProgress` |
| Success result | `{ outputKey: string }` |
| Failure | the worker throws; BullMQ marks the job failed |
| Status values | `queued \| processing \| completed \| failed` |

## Why a separate package?

Keeping the contract in one place (rather than copy-pasting types into `web` and
`api`) means there's a single source of truth for the JS/TS side, and an obvious
"this is the seam between services" marker for anyone reading the codebase.
