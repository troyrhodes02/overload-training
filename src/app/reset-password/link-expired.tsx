import Link from "next/link";
import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

/**
 * A reset link that can't be used (opened directly, expired, or reused;
 * Public Accounts design Screen 5). "Back to sign in" signs out first: a stale
 * recovery auth session can do nothing else, and /login would otherwise send
 * it straight back here.
 */
export function ResetLinkExpired() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">This link has expired</h1>
      <p className="text-sm text-muted-foreground">
        Reset links work once and expire after an hour.
      </p>
      <Button asChild className="h-11 w-full">
        <Link href="/forgot-password">Send a new link</Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" className="h-11 w-full">
          Back to sign in
        </Button>
      </form>
    </div>
  );
}
