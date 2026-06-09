/**
 * Typed calls to the score endpoints, plus the direct-to-storage upload.
 * Components import these instead of calling `api()` with raw strings.
 */
import type { ScoreStatus } from "@musical-atelier/contracts";
import { api } from "../../../lib/api";

export type SourceType = "image" | "pdf";

export interface Score {
  id: string;
  sourceType: SourceType;
  status: ScoreStatus;
  progress: number;
  outputKey: string | null;
  error: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreStatusResponse extends Score {
  /** Presigned GET for the MusicXML, present only when completed. */
  downloadUrl: string | null;
}

/** Step 1: create the score row and get a presigned upload URL. */
export function createScore(input: { sourceType: SourceType; contentType: string }) {
  return api<{ scoreId: string; uploadUrl: string }>("/scores", {
    method: "POST",
    body: input,
  });
}

/**
 * Step 2: upload the file DIRECTLY to storage via the presigned URL.
 * This bypasses our API entirely — bytes go straight to MinIO/R2. The
 * Content-Type MUST match what the API signed.
 */
export async function uploadToStorage(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
}

/** Step 3: tell the API the upload is done, which enqueues the job. */
export function markUploaded(scoreId: string) {
  return api<{ scoreId: string; status: ScoreStatus }>(
    `/scores/${scoreId}/uploaded`,
    { method: "POST" }
  );
}

export function listScores() {
  return api<{ scores: Score[] }>("/scores");
}

export function getScore(id: string) {
  return api<ScoreStatusResponse>(`/scores/${id}`);
}
