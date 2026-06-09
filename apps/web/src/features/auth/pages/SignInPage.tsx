/**
 * Sign-in screen — the one genuinely provider-specific piece of UI.
 *
 * In clerk mode we render Clerk's hosted <SignIn> component. In stub mode
 * you're always signed in as the dev user, so this is just an informational
 * placeholder (rarely seen).
 */
import { SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { AUTH_MODE } from "../../../lib/auth";

export function SignInPage() {
  if (AUTH_MODE === "clerk") {
    return (
      <section className="signin">
        <SignIn routing="hash" forceRedirectUrl="/" />
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Sign in</h2>
      <p className="muted">
        This template is running in <strong>development (stub) auth</strong> mode
        — you’re automatically signed in as a dev user, so there’s no login form.
      </p>
      <p className="muted">
        Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> (and the API’s
        <code> AUTH_MODE=clerk</code>) to switch on real Clerk auth.
      </p>
      <Link to="/" className="button-link">
        Continue
      </Link>
    </section>
  );
}
