/**
 * Sign-in screen. This is the ONE genuinely provider-specific piece of UI.
 *
 * In local stub mode you're always "signed in" as the dev user, so this page is
 * rarely shown. When you wire a real provider (e.g. Clerk), replace the body
 * with that provider's <SignIn /> component — and nothing else in the app
 * changes, because everything else goes through useCurrentUser()/<RequireAuth>.
 */
import { Link } from "react-router-dom";

export function SignInPage() {
  return (
    <section className="card">
      <h2>Sign in</h2>
      <p className="muted">
        This template is running in <strong>development (stub) auth</strong> mode
        — you’re automatically signed in as a dev user, so there’s no login form.
      </p>
      <p className="muted">
        To use a real provider, drop your provider’s sign-in component here (see
        the comments in <code>src/lib/auth.tsx</code>).
      </p>
      <Link to="/" className="button-link">
        Continue
      </Link>
    </section>
  );
}
