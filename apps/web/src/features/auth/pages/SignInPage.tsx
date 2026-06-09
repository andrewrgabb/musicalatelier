/**
 * Sign-in screen — the one genuinely provider-specific piece of UI. We render
 * Clerk's hosted <SignIn> component; everything else in the app stays
 * provider-neutral behind useCurrentUser()/<RequireAuth>.
 */
import { SignIn } from "@clerk/clerk-react";

export function SignInPage() {
  return (
    <section className="signin">
      <SignIn routing="hash" forceRedirectUrl="/" />
    </section>
  );
}
