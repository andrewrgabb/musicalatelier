/**
 * HTTP routes for scores. All are behind requireAuth, so req.user is always
 * the authenticated local user and every query is scoped to req.user.id.
 *
 *   POST /scores              -> create row + presigned upload URL
 *   POST /scores/:id/uploaded -> file is uploaded; enqueue the transcription
 *   GET  /scores              -> list my scores + status
 *   GET  /scores/:id          -> one score's status (+ download URL if done)
 */
import { Router } from "express";
import type { SourceType } from "@prisma/client";
import { requireAuth } from "../../lib/auth/middleware.js";
import {
  createScoreWithUploadUrl,
  enqueueTranscription,
  getScoreForUser,
  getScoreStatus,
  listScores,
} from "./service.js";

export const scoresRouter = Router();

scoresRouter.use(requireAuth);

const VALID_SOURCE_TYPES: SourceType[] = ["image", "pdf"];

// Create a score and get a presigned upload URL.
scoresRouter.post("/", async (req, res, next) => {
  try {
    const sourceType = req.body?.sourceType as SourceType;
    const contentType = req.body?.contentType as string | undefined;
    if (!VALID_SOURCE_TYPES.includes(sourceType)) {
      res.status(400).json({ error: "sourceType must be 'image' or 'pdf'" });
      return;
    }
    if (!contentType || typeof contentType !== "string") {
      res.status(400).json({ error: "contentType (the file's MIME type) is required" });
      return;
    }
    const { score, uploadUrl } = await createScoreWithUploadUrl(
      req.user!.id,
      sourceType,
      contentType
    );
    res.status(201).json({ scoreId: score.id, uploadUrl });
  } catch (err) {
    next(err);
  }
});

// The browser finished uploading — enqueue the job.
scoresRouter.post("/:id/uploaded", async (req, res, next) => {
  try {
    const score = await getScoreForUser(req.params.id, req.user!.id);
    if (!score) {
      res.status(404).json({ error: "score not found" });
      return;
    }
    await enqueueTranscription(score);
    res.status(202).json({ scoreId: score.id, status: "queued" });
  } catch (err) {
    next(err);
  }
});

// List my scores.
scoresRouter.get("/", async (req, res, next) => {
  try {
    res.json({ scores: await listScores(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

// One score's status (+ a presigned download URL when completed).
scoresRouter.get("/:id", async (req, res, next) => {
  try {
    const status = await getScoreStatus(req.params.id, req.user!.id);
    if (!status) {
      res.status(404).json({ error: "score not found" });
      return;
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
});
