/**
 * Database access for scores (the upload → transcription lifecycle).
 * All queries are scoped to a user id so one user can never see another's rows.
 */
import type { Score, SourceType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export function createScore(input: {
  userId: string;
  sourceKey: string;
  sourceType: SourceType;
}): Promise<Score> {
  return prisma.score.create({ data: input });
}

/** Fetch one score, but only if it belongs to the given user. */
export function getScoreForUser(
  id: string,
  userId: string
): Promise<Score | null> {
  return prisma.score.findFirst({ where: { id, userId } });
}

/** List a user's scores, newest first. */
export function listScoresForUser(userId: string): Promise<Score[]> {
  return prisma.score.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/** Set the (final) storage key for a score's source file. */
export function setScoreSourceKey(id: string, sourceKey: string): Promise<Score> {
  return prisma.score.update({ where: { id }, data: { sourceKey } });
}

/** Record the enqueued job id on a score. */
export function setScoreJobId(id: string, jobId: string): Promise<Score> {
  return prisma.score.update({ where: { id }, data: { jobId } });
}
