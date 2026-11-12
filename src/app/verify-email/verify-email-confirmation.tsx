import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The /verify-email surface (Public Accounts design Screen 6, D8). A
 * single-purpose card that shows the STORED verification state; the page
 * never writes (OVE-121). The return button follows the session: "Go to
 * Today" / "Open Settings" when signed in, "Sign in" when not.
 *
 *  - verified:   "Email verified" with the account's own email.
 *  - unverified: signed in, not verified — send a link from Settings.
 *  - signed_out: no session, so nothing to show — sign in to check.
 *  - expired:    "This verification link has expired" with a pointer back to
 *                Settings (signed in) or Sign in (signed out) to send a new one.
 *
 * Verification gates nothing, so there is no blocking and no upgrade note.
 */
export type VerifyEmailState =
  "verified" | "unverified" | "signed_out" | "expired";

export function VerifyEmailConfirmation({
  state,
  signedIn,
  email,
}: {
  state: VerifyEmailState;
  signedIn: boolean;
  email: string | null;
}) {
  if (state === "verified") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Email verified</h1>
          <p className="text-sm text-muted-foreground">
            {email ? `${email} is verified.` : "Your email is verified."}
          </p>
        </div>
        <Button asChild className="h-11 w-full">
          <Link href={signedIn ? "/" : "/login"}>
            {signedIn ? "Go to Today" : "Sign in"}
          </Link>
        </Button>
      </div>
    );
  }

  if (state === "unverified") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">
            Your email isn&apos;t verified yet
          </h1>
          <p className="text-sm text-muted-foreground">
            Open Settings and send a verification email, then open the link in
            it.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/settings">Open Settings</Link>
        </Button>
      </div>
    );
  }

  if (state === "signed_out") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to see whether your email is verified.
          </p>
        </div>
        <Button asChild className="h-11 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">
          This verification link has expired
        </h1>
        <p className="text-sm text-muted-foreground">
          Open Settings and send a new one.
        </p>
      </div>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href={signedIn ? "/settings" : "/login"}>
          {signedIn ? "Open Settings" : "Sign in"}
        </Link>
      </Button>
    </div>
  );
}
