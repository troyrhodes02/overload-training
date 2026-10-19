import Link from "next/link";
import { Button } from "@/components/ui/button";

/** A reset link that can't be used (opened directly, expired, or too old). */
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
    </div>
  );
}
