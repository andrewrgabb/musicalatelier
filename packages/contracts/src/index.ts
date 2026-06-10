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
 * Curated transcription options. These tune the Audiveris engine (the worker
 * maps them to its CLI flags). Kept small and stable since this crosses the
 * language boundary and is stored on the attempt row.
 */
export interface TranscriptionOptions {
  /** How forgiving the classifier is about image quality. */
  inputQuality?: "synthetic" | "standard" | "poor";
  /** Image binarization method. */
  binarization?: "adaptive" | "global";
  /** Threshold (0–255) used when binarization is "global". */
  binarizationThreshold?: number;
  /** Dominant OCR language for text/lyrics (Tesseract code, e.g. "eng"). */
  ocrLanguage?: string;
  /** A few common processing switches (enable recognition of these items). */
  switches?: {
    smallHeads?: boolean;
    crossHeads?: boolean;
    lyrics?: boolean;
    articulations?: boolean;
    implicitTuplets?: boolean;
  };
}

/**
 * Data the API puts on a job and the worker reads off it.
 * Keep this tiny and stable — it crosses a language boundary.
 */
export interface TranscriptionJobData {
  /** The `scores` row id (the uploaded source). */
  scoreId: string;
  /** The `attempts` row id this run writes its status/outputs to. */
  attemptId: string;
  /** The R2/MinIO object key of the uploaded image/PDF to transcribe. */
  sourceKey: string;
  /** The options chosen for this run (absent = engine defaults). */
  options?: TranscriptionOptions;
}

/** What the worker returns on success (BullMQ stores it on the job). */
export interface TranscriptionJobResult {
  /** The R2/MinIO object key of the generated MusicXML. */
  outputKey: string;
  /** The R2/MinIO object key of the generated MIDI (absent if conversion failed). */
  outputMidiKey?: string;
}

/**
 * The lifecycle states mirrored into the `scores.status` column.
 * Postgres is the user-facing source of truth; Redis/BullMQ holds the
 * in-flight job. The worker mirrors progress into the row so it stays
 * queryable and survives Redis being cleared.
 */
export type ScoreStatus = "queued" | "processing" | "completed" | "failed";
