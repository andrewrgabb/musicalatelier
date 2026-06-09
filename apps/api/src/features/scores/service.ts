/**
 * Business logic for the score lifecycle. Routes (api.ts) stay thin and call
 * into here; this layer talks to the DB, storage, and the queue.
 */
import type { Score, SourceType } from "@prisma/client";
import {
  TRANSCRIBE_JOB,
  type TranscriptionJobData,
} from "@musical-atelier/contracts";
import { presignDownload, presignUpload } from "../../lib/storage.js";
import { transcriptionQueue } from "../../lib/queue.js";
import {
  createScore,
  getScoreForUser,
  listScoresForUser,
  setScoreJobId,
  setScoreSourceKey,
} from "./db.js";

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
 * Step 1: create the score row and hand back a presigned URL the browser uses
 * to upload the file directly to storage. Nothing is queued yet.
 *
 * `contentType` is the file's real MIME type, supplied by the browser; we sign
 * the URL with it so the browser's PUT (which must send the same Content-Type)
 * matches the signature.
 */
export async function createScoreWithUploadUrl(
  userId: string,
  sourceType: SourceType,
  contentType: string
): Promise<{ score: Score; uploadUrl: string }> {
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
 * Step 2: the browser has finished uploading. Enqueue the transcription job and
 * record its id. The worker takes it from here.
 */
export async function enqueueTranscription(score: Score): Promise<void> {
  const data: TranscriptionJobData = {
    scoreId: score.id,
    sourceKey: score.sourceKey,
  };
  const job = await transcriptionQueue.add(TRANSCRIBE_JOB, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
  await setScoreJobId(score.id, job.id!);
}

/**
 * Status for one score, plus a presigned download URL if it's completed.
 */
export async function getScoreStatus(id: string, userId: string) {
  const score = await getScoreForUser(id, userId);
  if (!score) return null;
  const downloadUrl =
    score.status === "completed" && score.outputKey
      ? await presignDownload(score.outputKey)
      : null;
  return { ...score, downloadUrl };
}

export function listScores(userId: string) {
  return listScoresForUser(userId);
}

export { getScoreForUser };
