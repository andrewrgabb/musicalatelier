/**
 * Provider-agnostic token verification — the single file that knows anything
 * about the auth provider. Everything else depends only on `Identity`.
 *
 * Two modes, controlled by AUTH_MODE:
 *   stub  -> local dev. No real token needed; returns a fixed test identity so
 *            you can build features without a live auth provider.
 *   clerk -> verifies a real JWT against the issuer's JWKS endpoint with `jose`.
 *            "clerk" is just the configured issuer — the verification itself is
 *            generic, so pointing CLERK_ISSUER/CLERK_JWKS_URL at WorkOS, Auth0,
 *            etc. would work the same way.
 *
 * To swap providers you change config (issuer, JWKS URL, claim mapping) HERE,
 * and nothing else.
 */
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env.js";
import type { Identity } from "./identity.js";

/** Thrown when a request is not authenticated. The middleware maps it to 401. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// A fixed identity used in stub mode. Stable id so the same dev user is
// upserted every time and owns the data you create locally.
const STUB_IDENTITY: Identity = {
  externalAuthId: "dev_user_local",
  email: "dev@musical-atelier.local",
};

// Lazily-created JWKS fetcher (caches keys, refreshes as needed).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    if (!env.auth.jwksUrl) {
      throw new Error("AUTH_MODE=clerk but CLERK_JWKS_URL is not set");
    }
    jwks = createRemoteJWKSet(new URL(env.auth.jwksUrl));
  }
  return jwks;
}

function bearerToken(req: Request): string {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new AuthError("Missing or malformed Authorization header");
  }
  return token;
}

/**
 * Verify the incoming request and return a normalised Identity.
 * Throws AuthError if the request is not authenticated.
 */
export async function authenticate(req: Request): Promise<Identity> {
  if (env.auth.mode === "stub") {
    return STUB_IDENTITY;
  }

  // --- clerk (generic JWKS verification) ---
  const token = bearerToken(req);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: env.auth.issuer || undefined,
    });

    // --- claim mapping (the provider-specific bit, isolated here) ---
    const externalAuthId = String(payload.sub ?? "");
    if (!externalAuthId) throw new AuthError("Token has no subject (sub) claim");

    return {
      externalAuthId,
      email: typeof payload.email === "string" ? payload.email : undefined,
      orgId: typeof payload.org_id === "string" ? payload.org_id : undefined,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("Invalid or expired token");
  }
}
