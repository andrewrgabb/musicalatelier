/**
 * The job contract — the single seam between the Node API (producer) and the
 * Python worker (consumer). They share NO code, only this agreement:
 *   - the queue name
 *   - the shape of the data put on a job
 *   - how progress and results are reported
 *
 * The TypeScript side of the contract lives here and is imported by `web` and
 * `api`. The Python worker mirrors these same constants/shapes in
 * `apps/worker/contract.py`. If you change one side, change the other.
 */

/** Name of the BullMQ queue that carries transcription jobs. */
export const TRANSCRIPTION_QUEUE = "transcription";

/** The (single) job name on that queue. */
export const TRANSCRIBE_JOB = "transcribe";

/**
 * Data the API puts on a job and the worker reads off it.
 * Keep this tiny and stable — it crosses a language boundary.
 */
export interface TranscriptionJobData {
  /** The `scores` row id (also the user-facing handle for status). */
  scoreId: string;
  /** The R2/MinIO object key of the uploaded image/PDF to transcribe. */
  sourceKey: string;
}

/** What the worker returns on success (BullMQ stores it on the job). */
export interface TranscriptionJobResult {
  /** The R2/MinIO object key of the generated MusicXML. */
  outputKey: string;
}

/**
 * The lifecycle states mirrored into the `scores.status` column.
 * Postgres is the user-facing source of truth; Redis/BullMQ holds the
 * in-flight job. The worker mirrors progress into the row so it stays
 * queryable and survives Redis being cleared.
 */
export type ScoreStatus = "queued" | "processing" | "completed" | "failed";
