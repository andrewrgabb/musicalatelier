/**
 * The normalised identity the rest of the app depends on.
 *
 * This is the WHOLE point of the auth adapter: every part of the app speaks in
 * terms of this provider-agnostic shape, never Clerk's SDK or token format.
 * Swapping auth providers means changing how this object is produced (see
 * verify.ts) — nothing downstream changes.
 */
export interface Identity {
  /** The auth provider's stable user id (Clerk's "user_..."). */
  externalAuthId: string;
  /** The user's email, if the provider includes it in the token. */
  email?: string;
  /** Optional organisation/tenant id, if you use orgs. */
  orgId?: string;
}
