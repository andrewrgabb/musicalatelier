/**
 * The frontend auth boundary — the mirror of the backend's auth adapter.
 *
 * Screens NEVER call an auth provider's SDK directly. They use:
 *   - useCurrentUser() — the signed-in user (or null while loading / signed out)
 *   - <RequireAuth>   — gate a route behind being signed in
 *
 * Two modes, chosen by whether a Clerk publishable key is present:
 *   - stub  (no key): the API treats every request as a fixed dev user, so
 *                     there's no token and no login screen — `GET /me` always
 *                     succeeds. Great for local development.
 *   - clerk (key set): wrap the app in Clerk, hand the API a real Bearer token,
 *                      and require sign-in. The ONLY Clerk-specific code lives
 *                      in this file and in SignInPage.
 *
 * Either way, the rest of the app sees the same { user, loading } shape via
 * useCurrentUser(), so feature screens are identical in both modes.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { api, setTokenGetter } from "./api";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

/** Which auth mode the frontend runs in (mirrors the API's AUTH_MODE). */
export const AUTH_MODE: "clerk" | "stub" = CLERK_KEY ? "clerk" : "stub";

export interface CurrentUser {
  id: string;
  email: string | null;
  externalAuthId: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

/** Fetch our internal user from the API. Shared by both modes. */
function useInternalUser(enabled: boolean): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(() => {
    if (!enabled) {
      setState({ user: null, loading: false });
      return;
    }
    let cancelled = false;
    api<{ user: CurrentUser }>("/me")
      .then((res) => !cancelled && setState({ user: res.user, loading: false }))
      .catch(() => !cancelled && setState({ user: null, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}

// --- stub mode ---------------------------------------------------------------

function StubAuthProvider({ children }: { children: ReactNode }) {
  const state = useInternalUser(true); // /me always succeeds in stub mode
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// --- clerk mode --------------------------------------------------------------

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // Teach the API client how to get a Bearer token. Once set, every api()
  // call carries the user's Clerk session JWT automatically.
  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
  }, [getToken]);

  // Only resolve the internal user once Clerk is loaded AND the user is signed
  // in (otherwise /me would 401).
  const internal = useInternalUser(isLoaded && isSignedIn === true);
  const loading = !isLoaded || (isSignedIn === true && internal.loading);
  const value: AuthState = { user: isSignedIn ? internal.user : null, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={CLERK_KEY!} afterSignOutUrl="/sign-in">
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

// --- public API --------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  return AUTH_MODE === "clerk" ? (
    <ClerkAuthProvider>{children}</ClerkAuthProvider>
  ) : (
    <StubAuthProvider>{children}</StubAuthProvider>
  );
}

export function useCurrentUser(): AuthState {
  return useContext(AuthContext);
}

/** Gate a route: show a loader, then either the children or a redirect. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  if (loading) return <div className="muted">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}
