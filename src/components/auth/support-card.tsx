import Link from "next/link";
import { ArrowLeft, LifeBuoy, Mail } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

/**
 * The /support contact card (Public Accounts design doc Screen 9, D5; spec §6,
 * R10). Two variants, chosen by whether the visitor is signed in:
 *
 *  - Signed OUT: a plain contact affordance — the support address and a
 *    `mailto:` button that opens the visitor's own mail client, plus "Back to
 *    sign in". It is NOT a database-writing form: a signed-out write path would
 *    be an unauthenticated write and an abuse surface the pitch rules out
 *    (CLAUDE.md: no new unauthenticated write paths). The `mailto:` is the one
 *    external link allowed here, because it is the contact mechanism itself.
 *
 *  - Signed IN: the same card, but the primary action is "Send feedback" →
 *    /feedback (the existing, richer path that writes to the owner's inbox),
 *    with the support address shown only as a muted fallback.
 *
 * The support address is resolved on the server (supportEmail()) and passed in,
 * so this component holds no secret. Static markup — no client interactivity.
 */
export function SupportCard({
  signedIn,
  supportAddress,
}: {
  signedIn: boolean;
  supportAddress: string;
}) {
  if (signedIn) {
    return (
      <AuthCard>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Get help</h1>
          <p className="text-sm text-muted-foreground">
            You can send feedback or a question from inside Overload.
          </p>
        </div>
        <Button asChild className="h-11 w-full">
          <Link href="/feedback">
            <LifeBuoy className="size-4" aria-hidden="true" />
            Send feedback
          </Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Or email{" "}
          <a
            href={`mailto:${supportAddress}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            {supportAddress}
          </a>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      footer={
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Get help</h1>
        <p className="text-sm text-muted-foreground">
          Email the person who runs Overload and they&apos;ll get back to you.
        </p>
      </div>
      <p className="text-sm text-foreground">{supportAddress}</p>
      <Button asChild className="h-11 w-full">
        <a href={`mailto:${supportAddress}`}>
          <Mail className="size-4" aria-hidden="true" />
          Email support
        </a>
      </Button>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/login">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </Button>
    </AuthCard>
  );
}
