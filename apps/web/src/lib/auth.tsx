/**
 * The frontend auth boundary — the mirror of the backend's auth adapter.
 *
 * Screens NEVER call an auth provider's SDK directly. They use:
 *   - useCurrentUser() — the signed-in user (or null while loading / signed out)
 *   - <RequireAuth>   — gate a route behind being signed in
 *
 * Today we run in STUB mode: the API (AUTH_MODE=stub) treats every request as a
 * fixed dev user, so there's no token and no login screen — `GET /me` always
 * succeeds. To plug in Clerk (or WorkOS, …) you wrap this provider around the
 * provider's SDK and call setTokenGetter() with its getToken — and nothing in
 * the feature screens changes.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";
import { api } from "./api";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    // In stub mode this succeeds with the dev user; in a real provider it
    // succeeds once the user is signed in (and the token getter is set).
    api<{ user: CurrentUser }>("/me")
      .then((res) => !cancelled && setState({ user: res.user, loading: false }))
      .catch(() => !cancelled && setState({ user: null, loading: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
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
