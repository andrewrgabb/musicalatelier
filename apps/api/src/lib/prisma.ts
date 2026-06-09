/**
 * The shared Prisma client — our typed gateway to Postgres.
 *
 * We export a single instance for the whole process. Importing `env` first
 * guarantees the repo-root .env is loaded before the client reads
 * DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client";
import "./env.js";

export const prisma = new PrismaClient();

/** Returns true if a trivial query succeeds. Used by /healthz. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
