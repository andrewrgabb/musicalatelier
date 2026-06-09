/**
 * Bull Board — a drop-in web dashboard for watching jobs move through the queue
 * in real time (queued → active → progress → completed/failed). Great visual
 * aid for the demo; mounted at /admin/queues.
 *
 * It's an admin surface, so we guard it with HTTP Basic auth IF
 * BULLBOARD_USER / BULLBOARD_PASS are set. Locally they're usually unset, so
 * the board is open for convenience — but you MUST set them in production.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { transcriptionQueue } from "./queue.js";

const BASE_PATH = "/admin/queues";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(BASE_PATH);

createBullBoard({
  queues: [new BullMQAdapter(transcriptionQueue)],
  serverAdapter,
});

/** Optional HTTP Basic auth guard, enabled only when creds are configured. */
const guard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const user = process.env.BULLBOARD_USER;
  const pass = process.env.BULLBOARD_PASS;
  if (!user || !pass) return next(); // open in local dev

  const header = req.header("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u === user && p === pass) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="bull-board"').status(401).end();
};

export const bullBoardBasePath = BASE_PATH;
export const bullBoardGuard = guard;
export const bullBoardRouter = serverAdapter.getRouter();
