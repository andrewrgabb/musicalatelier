/**
 * Provider-agnostic token verification — the single file that knows anything
 * about the auth provider. Everything else depends only on `Identity`.
 *
 * We verify the request's Bearer JWT against the issuer's JWKS endpoint with
 * `jose`. The verification is generic OIDC — "Clerk" is just the configured
 * issuer — so pointing CLERK_ISSUER / CLERK_JWKS_URL at WorkOS, Auth0, etc.
 * would work the same way. To swap providers you change config (issuer, JWKS
 * URL, claim mapping) HERE, and nothing else.
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

// Lazily-created JWKS fetcher (caches keys, refreshes as needed).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
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
  const token = bearerToken(req);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: env.auth.issuer,
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
