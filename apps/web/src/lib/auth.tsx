/**
 * The frontend auth boundary — the mirror of the backend's auth adapter.
 *
 * Screens NEVER call Clerk's SDK directly. They use:
 *   - useCurrentUser() — the signed-in user (or null while loading)
 *   - <RequireAuth>   — gate a route behind being signed in
 *
 * All Clerk-specific code is confined to this file and SignInPage. We wrap the
 * app in <ClerkProvider>, hand the API client a real Bearer token, and require
 * sign-in. The rest of the app just reads { user, loading } via
 * useCurrentUser(), so swapping providers later touches only these two files.
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
if (!CLERK_KEY) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY is not set. Create a free Clerk app and add its " +
      "publishable key to your .env (see .env.example)."
  );
}

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

/** Bridges Clerk's session into our app: registers the token getter, then
 *  resolves our internal user from the API once signed in. */
function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // Teach the API client how to get a Bearer token. Once set, every api()
  // call carries the user's Clerk session JWT automatically.
  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
  }, [getToken]);

  const [internal, setInternal] = useState<AuthState>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setInternal({ user: null, loading: false });
      return;
    }
    let cancelled = false;
    api<{ user: CurrentUser }>("/me")
      .then((res) => !cancelled && setInternal({ user: res.user, loading: false }))
      .catch(() => !cancelled && setInternal({ user: null, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  const value: AuthState = {
    user: isSignedIn ? internal.user : null,
    loading: !isLoaded || (isSignedIn === true && internal.loading),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={CLERK_KEY!} afterSignOutUrl="/sign-in">
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
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
