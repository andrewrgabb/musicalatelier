/**
 * HTTP routes for scores — a thin layer. Each handler does only: read the
 * request, call the service, and shape the HTTP response. All business logic
 * (validation, "not found", orchestration) lives in service.ts; domain errors
 * it throws are mapped to status codes by the central error handler.
 *
 *   POST /scores              -> create row + presigned upload URL
 *   POST /scores/:id/uploaded -> file is uploaded; enqueue the transcription
 *   GET  /scores              -> list my scores + status
 *   GET  /scores/:id          -> one score's status (+ download URL if done)
 */
import { Router } from "express";
import { requireAuth } from "../../lib/auth/middleware.js";
import {
  createScoreWithUploadUrl,
  enqueueTranscriptionForUser,
  getScoreStatus,
  listScores,
} from "./service.js";

export const scoresRouter = Router();

// All score routes require auth; req.user is the authenticated local user.
scoresRouter.use(requireAuth);

scoresRouter.post("/", async (req, res, next) => {
  try {
    const { score, uploadUrl } = await createScoreWithUploadUrl(
      req.user!.id,
      req.body?.sourceType,
      req.body?.contentType
    );
    res.status(201).json({ scoreId: score.id, uploadUrl });
  } catch (err) {
    next(err);
  }
});

scoresRouter.post("/:id/uploaded", async (req, res, next) => {
  try {
    const score = await enqueueTranscriptionForUser(req.params.id, req.user!.id);
    res.status(202).json({ scoreId: score.id, status: "queued" });
  } catch (err) {
    next(err);
  }
});

scoresRouter.get("/", async (req, res, next) => {
  try {
    res.json({ scores: await listScores(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

scoresRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(await getScoreStatus(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});
