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

const EXT: Record<SourceType, string> = { image: "png", pdf: "pdf" };
const CONTENT_TYPE: Record<SourceType, string> = {
  image: "image/png",
  pdf: "application/pdf",
};

/** Storage key for a score's uploaded source file. */
function sourceKeyFor(userId: string, scoreId: string, type: SourceType) {
  return `uploads/${userId}/${scoreId}/source.${EXT[type]}`;
}

/**
 * Step 1: create the score row and hand back a presigned URL the browser uses
 * to upload the file directly to storage. Nothing is queued yet.
 */
export async function createScoreWithUploadUrl(
  userId: string,
  sourceType: SourceType
): Promise<{ score: Score; uploadUrl: string }> {
  // Create first so we have the id to build a stable, collision-free key,
  // then set the final key derived from that id.
  const tempKey = `uploads/${userId}/pending/${Date.now()}.${EXT[sourceType]}`;
  const created = await createScore({ userId, sourceKey: tempKey, sourceType });

  const sourceKey = sourceKeyFor(userId, created.id, sourceType);
  const score = await setScoreSourceKey(created.id, sourceKey);

  const uploadUrl = await presignUpload(sourceKey, CONTENT_TYPE[sourceType]);
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
