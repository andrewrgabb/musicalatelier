/**
 * Database access for scores (the upload → transcription lifecycle).
 * All queries are scoped to a user id so one user can never see another's rows.
 *
 * A `Score` is the uploaded source; each transcription run is an `Attempt`. We
 * always load a score with its attempts (newest first).
 */
import type { Attempt, Prisma, Score, SourceType } from "@prisma/client";
import type { OmrEngine, TranscriptionOptions } from "@musical-atelier/contracts";
import { prisma } from "../../lib/prisma.js";

/** A score with its attempts eagerly loaded (newest first). */
export type ScoreWithAttempts = Score & { attempts: Attempt[] };

const withAttempts = {
  attempts: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.ScoreInclude;

export function createScore(input: {
  userId: string;
  sourceKey: string;
  sourceType: SourceType;
}): Promise<Score> {
  return prisma.score.create({ data: input });
}

/** Fetch one score (with its attempts), but only if it belongs to the user. */
export function getScoreForUser(
  id: string,
  userId: string
): Promise<ScoreWithAttempts | null> {
  return prisma.score.findFirst({
    where: { id, userId },
    include: withAttempts,
  });
}

/** List a user's scores (with attempts), newest first. */
export function listScoresForUser(userId: string): Promise<ScoreWithAttempts[]> {
  return prisma.score.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: withAttempts,
  });
}

/** Set the (final) storage key for a score's source file. */
export function setScoreSourceKey(id: string, sourceKey: string): Promise<Score> {
  return prisma.score.update({ where: { id }, data: { sourceKey } });
}

/** Start a new transcription run for a score, with the chosen engine + options. */
export function createAttempt(input: {
  scoreId: string;
  engine: OmrEngine;
  options?: TranscriptionOptions;
}): Promise<Attempt> {
  return prisma.attempt.create({
    data: {
      scoreId: input.scoreId,
      engine: input.engine,
      options:
        input.options === undefined
          ? undefined
          : (input.options as Prisma.InputJsonValue),
    },
  });
}

/** Record the enqueued job id on an attempt. */
export function setAttemptJobId(id: string, jobId: string): Promise<Attempt> {
  return prisma.attempt.update({ where: { id }, data: { jobId } });
}

/** Delete a score (its attempts cascade via the FK). */
export function deleteScore(id: string): Promise<Score> {
  return prisma.score.delete({ where: { id } });
}
