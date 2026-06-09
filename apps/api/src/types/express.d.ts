// Declaration merging: teach Express's Request about the fields requireAuth
// attaches, so handlers get `req.user` / `req.auth` with full types.
import type { User } from "@prisma/client";
import type { Identity } from "../lib/auth/identity.js";

declare global {
  namespace Express {
    interface Request {
      /** The normalised, provider-agnostic identity (set by requireAuth). */
      auth?: Identity;
      /** The local user row (set by requireAuth). */
      user?: User;
    }
  }
}

export {};
