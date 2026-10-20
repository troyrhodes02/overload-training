import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Settings → What's New (design doc Screen 3, preview §03): the permanent way
 * into the release history. The same whether or not anything is unseen — no
 * count, no dot (design principle 5).
 */
export function WhatsNewSection() {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">What&apos;s New</h2>
      <p className="text-sm text-muted-foreground">
        Every update to Overload, newest first.
      </p>
      <Button asChild variant="outline" className="h-11 md:h-9">
        <Link href="/settings/whats-new">
          <ScrollText aria-hidden className="size-4" />
          See what&apos;s new
        </Link>
      </Button>
    </div>
  );
}
