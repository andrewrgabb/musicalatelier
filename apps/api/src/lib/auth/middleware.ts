/**
 * Express middleware that protects routes.
 *
 * Flow on every protected request:
 *   1. authenticate(req)  -> verify the token, get a normalised Identity
 *   2. upsertUserByIdentity -> find-or-create our local users row
 *   3. attach req.auth (identity) and req.user (the internal User) for handlers
 *
 * Handlers downstream only ever read req.user.id (our internal id) — they never
 * see the auth provider's id, keeping the rest of the app vendor-neutral.
 */
import type { NextFunction, Request, Response } from "express";
import { authenticate, AuthError } from "./verify.js";
import { upsertUserByIdentity } from "../../features/users/db.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const identity = await authenticate(req);
    const user = await upsertUserByIdentity(identity);
    req.auth = identity;
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
}
