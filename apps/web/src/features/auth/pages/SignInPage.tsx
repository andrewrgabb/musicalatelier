/**
 * Sign-in screen — the one genuinely provider-specific piece of UI. We render
 * Clerk's hosted <SignIn> component; everything else stays provider-neutral
 * behind useCurrentUser()/<RequireAuth>.
 */
import { SignIn } from "@clerk/clerk-react";
import { Music4 } from "lucide-react";

export function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/20 px-6 py-12">
      <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Music4 className="size-6" />
        Musical Atelier
      </div>
      <SignIn routing="hash" forceRedirectUrl="/" />
    </div>
  );
}
