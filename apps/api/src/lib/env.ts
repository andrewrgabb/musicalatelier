/**
 * Loads and validates environment variables for the API.
 *
 * In local dev we read the single root `.env` file (one source of truth for
 * the whole monorepo). In production (Fly) there is no .env file — the values
 * come from real environment variables / Fly secrets — and dotenv simply finds
 * nothing, which is fine.
 *
 * Importing this module is the FIRST thing that should happen, so that every
 * other module sees a populated process.env. Other lib modules import `env`
 * from here, which guarantees this runs first.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/lib -> src -> api -> apps -> repo root
const repoRoot = path.resolve(here, "../../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env (see the repo root).`
    );
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:5173",

  redisUrl: required("REDIS_URL"),

  databaseUrl: process.env.DATABASE_URL ?? "",
  directUrl: process.env.DIRECT_URL ?? "",

  r2: {
    endpoint: process.env.R2_ENDPOINT ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
    region: process.env.R2_REGION ?? "auto",
    forcePathStyle: (process.env.R2_FORCE_PATH_STYLE ?? "true") === "true",
  },

  // Auth is always real (JWT verified against the issuer's JWKS). These are
  // required — set up a free Clerk app and fill them in (see .env.example).
  auth: {
    issuer: required("CLERK_ISSUER"),
    jwksUrl: required("CLERK_JWKS_URL"),
  },
};
