/**
 * Business logic for the score lifecycle. Routes (api.ts) stay thin and call
 * into here; this layer talks to the DB, storage, and the queue.
 *
 * A score is the uploaded source; each transcription run is an Attempt. The
 * first run happens when the upload completes; re-processing creates another
 * attempt (with possibly different options) — both go through enqueueTranscription.
 */
import type { Attempt, Score, SourceType } from "@prisma/client";
import {
  TRANSCRIBE_JOB,
  type TranscriptionJobData,
  type TranscriptionOptions,
} from "@musical-atelier/contracts";
import { presignDownload, presignUpload } from "../../lib/storage.js";
import { transcriptionQueue } from "../../lib/queue.js";
import { BadRequestError, NotFoundError } from "../../lib/http-errors.js";
import {
  createAttempt,
  createScore,
  getScoreForUser,
  listScoresForUser,
  setAttemptJobId,
  setScoreSourceKey,
  type ScoreWithAttempts,
} from "./db.js";

const VALID_SOURCE_TYPES: SourceType[] = ["image", "pdf"];

function isSourceType(value: unknown): value is SourceType {
  return (
    typeof value === "string" &&
    (VALID_SOURCE_TYPES as string[]).includes(value)
  );
}

const INPUT_QUALITIES = ["synthetic", "standard", "poor"];
const BINARIZATIONS = ["adaptive", "global"];
const SWITCH_KEYS = [
  "smallHeads",
  "crossHeads",
  "lyrics",
  "articulations",
  "implicitTuplets",
];

/**
 * Validate the curated transcription options coming off the request body.
 * Unknown fields are ignored; bad values are rejected so we never enqueue a
 * malformed option set. Returns undefined when no options were sent.
 */
export function validateOptions(raw: unknown): TranscriptionOptions | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new BadRequestError("options must be an object");
  }
  const input = raw as Record<string, unknown>;
  const out: TranscriptionOptions = {};

  if (input.inputQuality !== undefined) {
    if (!INPUT_QUALITIES.includes(input.inputQuality as string)) {
      throw new BadRequestError(`inputQuality must be one of ${INPUT_QUALITIES.join(", ")}`);
    }
    out.inputQuality = input.inputQuality as TranscriptionOptions["inputQuality"];
  }

  if (input.binarization !== undefined) {
    if (!BINARIZATIONS.includes(input.binarization as string)) {
      throw new BadRequestError(`binarization must be one of ${BINARIZATIONS.join(", ")}`);
    }
    out.binarization = input.binarization as TranscriptionOptions["binarization"];
  }

  if (input.binarizationThreshold !== undefined) {
    const n = input.binarizationThreshold;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 255) {
      throw new BadRequestError("binarizationThreshold must be a number 0–255");
    }
    out.binarizationThreshold = Math.round(n);
  }

  if (input.ocrLanguage !== undefined) {
    if (typeof input.ocrLanguage !== "string" || !/^[A-Za-z+]{1,40}$/.test(input.ocrLanguage)) {
      throw new BadRequestError("ocrLanguage must be a Tesseract code like 'eng' or 'eng+fra'");
    }
    out.ocrLanguage = input.ocrLanguage;
  }

  if (input.switches !== undefined) {
    if (typeof input.switches !== "object" || input.switches === null) {
      throw new BadRequestError("switches must be an object");
    }
    const sw = input.switches as Record<string, unknown>;
    const cleaned: NonNullable<TranscriptionOptions["switches"]> = {};
    for (const key of SWITCH_KEYS) {
      if (sw[key] !== undefined) {
        if (typeof sw[key] !== "boolean") {
          throw new BadRequestError(`switches.${key} must be a boolean`);
        }
        (cleaned as Record<string, boolean>)[key] = sw[key] as boolean;
      }
    }
    if (Object.keys(cleaned).length > 0) out.switches = cleaned;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

// Map a MIME type to a file extension. The browser tells us the real content
// type of the file it's about to upload; we sign the presigned PUT with that
// exact type (the signature requires the client to send a matching header).
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "application/pdf": "pdf",
};

function extFor(contentType: string, sourceType: SourceType): string {
  return EXT_BY_CONTENT_TYPE[contentType] ?? (sourceType === "pdf" ? "pdf" : "png");
}

/** Storage key for a score's uploaded source file. */
function sourceKeyFor(userId: string, scoreId: string, ext: string) {
  return `uploads/${userId}/${scoreId}/source.${ext}`;
}

/**
 * Step 1: validate the request, create the score row, and hand back a presigned
 * URL the browser uses to upload the file directly to storage. Nothing is
 * queued yet — that happens once the upload completes.
 */
export async function createScoreWithUploadUrl(
  userId: string,
  sourceType: unknown,
  contentType: unknown
): Promise<{ score: Score; uploadUrl: string }> {
  if (!isSourceType(sourceType)) {
    throw new BadRequestError("sourceType must be 'image' or 'pdf'");
  }
  if (typeof contentType !== "string" || contentType.length === 0) {
    throw new BadRequestError("contentType (the file's MIME type) is required");
  }

  const ext = extFor(contentType, sourceType);

  // Create first so we have the id to build a stable, collision-free key,
  // then set the final key derived from that id.
  const tempKey = `uploads/${userId}/pending/${Date.now()}.${ext}`;
  const created = await createScore({ userId, sourceKey: tempKey, sourceType });

  const sourceKey = sourceKeyFor(userId, created.id, ext);
  const score = await setScoreSourceKey(created.id, sourceKey);

  const uploadUrl = await presignUpload(sourceKey, contentType);
  return { score, uploadUrl };
}

/**
 * Start a transcription run for a score (404 if it isn't the user's). Used for
 * BOTH the first run (when the upload finishes) and re-processing: each call
 * creates a new Attempt with the chosen options and enqueues a job for it, so a
 * score keeps a history of every run. Returns the new attempt.
 */
export async function enqueueTranscription(
  scoreId: string,
  userId: string,
  rawOptions: unknown
): Promise<Attempt> {
  const score = await getScoreForUser(scoreId, userId);
  if (!score) throw new NotFoundError("score not found");

  const options = validateOptions(rawOptions);
  const attempt = await createAttempt({ scoreId: score.id, options });

  const data: TranscriptionJobData = {
    scoreId: score.id,
    attemptId: attempt.id,
    sourceKey: score.sourceKey,
    options,
  };
  const job = await transcriptionQueue.add(TRANSCRIBE_JOB, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
  return setAttemptJobId(attempt.id, job.id!);
}

/** An attempt plus presigned download URLs (present only when completed). */
type AttemptWithUrls = Attempt & {
  downloadUrl: string | null;
  midiUrl: string | null;
};

async function presignAttempt(attempt: Attempt): Promise<AttemptWithUrls> {
  const done = attempt.status === "completed";
  return {
    ...attempt,
    downloadUrl: done && attempt.outputKey ? await presignDownload(attempt.outputKey) : null,
    midiUrl: done && attempt.outputMidiKey ? await presignDownload(attempt.outputMidiKey) : null,
  };
}

/**
 * Status for one of the user's scores: the score plus every attempt, each with
 * presigned download URLs (MusicXML + MIDI) when completed. 404 if not theirs.
 */
export async function getScoreStatus(scoreId: string, userId: string) {
  const score = await getScoreForUser(scoreId, userId);
  if (!score) throw new NotFoundError("score not found");
  const attempts = await Promise.all(score.attempts.map(presignAttempt));
  return { ...score, attempts };
}

/** A user's scores with their attempts (no presigned URLs — the list is light). */
export function listScores(userId: string): Promise<ScoreWithAttempts[]> {
  return listScoresForUser(userId);
}
