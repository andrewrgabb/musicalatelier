/**
 * Database access for users.
 *
 * The auth provider is the source of truth for IDENTITY; this local `users`
 * table is the source of truth for the OWNER REFERENCE that the rest of the
 * schema foreign-keys to. We bridge the two by upserting on first login.
 */
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { Identity } from "../../lib/auth/identity.js";

/**
 * Find-or-create the local user for a verified identity, keyed by the auth
 * provider's id. Called on every authenticated request (cheap upsert), so the
 * first request after sign-up transparently creates the row.
 *
 * Swapping auth providers later changes only how `externalAuthId` is produced
 * (in verify.ts) — this upsert, and the schema, stay the same.
 */
export async function upsertUserByIdentity(identity: Identity): Promise<User> {
  return prisma.user.upsert({
    where: { externalAuthId: identity.externalAuthId },
    update: { email: identity.email },
    create: {
      externalAuthId: identity.externalAuthId,
      email: identity.email,
    },
  });
}
