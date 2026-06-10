/**
 * Typed calls to the score endpoints, plus the direct-to-storage upload.
 * Components import these instead of calling `api()` with raw strings.
 *
 * A score is the uploaded source; each transcription run is an Attempt. The
 * list endpoint returns attempts without URLs; the detail endpoint adds
 * presigned download URLs (MusicXML + MIDI) for completed attempts.
 */
import type {
  OmrEngine,
  ScoreStatus,
  TranscriptionOptions,
} from "@musical-atelier/contracts";
import { api } from "../../../lib/api";

export type SourceType = "image" | "pdf";
export type { OmrEngine, TranscriptionOptions };

export interface Attempt {
  id: string;
  engine: string | null;
  options: TranscriptionOptions | null;
  status: ScoreStatus;
  progress: number;
  outputKey: string | null;
  outputMidiKey: string | null;
  error: string | null;
  createdAt: string;
}

export interface AttemptWithUrls extends Attempt {
  /** Presigned GET for the MusicXML, present only when completed. */
  downloadUrl: string | null;
  /** Presigned GET for the MIDI, present only when completed + converted. */
  midiUrl: string | null;
}

export interface Score {
  id: string;
  sourceType: SourceType;
  createdAt: string;
  attempts: Attempt[];
}

export interface ScoreDetail extends Omit<Score, "attempts"> {
  attempts: AttemptWithUrls[];
  /** Presigned GET for the original uploaded image/PDF. */
  sourceUrl: string | null;
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

/** Step 3: tell the API the upload is done, which starts the first attempt. */
export function markUploaded(
  scoreId: string,
  engine: OmrEngine,
  options?: TranscriptionOptions
) {
  return api<{ scoreId: string; attemptId: string; status: ScoreStatus }>(
    `/scores/${scoreId}/uploaded`,
    { method: "POST", body: { engine, options } }
  );
}

/** Re-run an already-uploaded score with a (possibly different) engine + options. */
export function reprocessScore(
  scoreId: string,
  engine: OmrEngine,
  options?: TranscriptionOptions
) {
  return api<{ scoreId: string; attemptId: string; status: ScoreStatus }>(
    `/scores/${scoreId}/reprocess`,
    { method: "POST", body: { engine, options } }
  );
}

export function listScores() {
  return api<{ scores: Score[] }>("/scores");
}

export function getScore(id: string) {
  return api<ScoreDetail>(`/scores/${id}`);
}

/** Delete a score and all its files + attempts. */
export function deleteScore(id: string) {
  return api<void>(`/scores/${id}`, { method: "DELETE" });
}
