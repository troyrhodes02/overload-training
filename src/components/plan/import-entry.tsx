import Link from "next/link";
import { Lock, Upload, Info, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Account } from "@/lib/data/account";
import { resolveEntitlement, can } from "@/lib/entitlements/resolve";
import { isPlanImportEnabled } from "@/lib/import/config";
import { tourAnchor } from "@/lib/tour/steps";

/**
 * Workout Plan Import & Review (Pitch 22) — the "Import existing plan" entry on
 * the Plan list (preview Screen 1). Server-resolved, three states:
 *   - Pro (capability granted) + kill switch ON: a quiet dashed card with an
 *     outline Button to /plan/import. It sits on its own, below the plan
 *     lists, not in the New mesocycle / Clone previous action bar.
 *   - Pro + kill switch OFF: a plain operational "temporarily unavailable" note.
 *   - Free (capability absent): ONE quiet locked note pointing at Pro, distinct
 *     in copy from the operational one.
 * Visibility is NOT the gate — the /plan/import route re-checks the capability
 * and kill switch server-side, so a direct visit never returns a Pro result.
 * This component renders no training content and takes the acting account only.
 */
export async function ImportEntry({ account }: { account: Account }) {
  const resolved = await resolveEntitlement(account);
  const isPro = can(resolved, "plan_import");

  if (!isPro) {
    return (
      <div className="flex items-start gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p className="flex-1">
          Importing a written plan is part of Pro.{" "}
          <Link
            href="/settings/billing"
            className="text-primary underline-offset-4 hover:underline"
          >
            See Pro
          </Link>
        </p>
      </div>
    );
  }

  if (!isPlanImportEnabled()) {
    return (
      <div className="flex items-start gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p className="flex-1">Plan import is temporarily unavailable.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <FileUp aria-hidden className="size-4" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            Already have a plan written down?
          </p>
          <p className="text-sm text-muted-foreground">
            Import it from text, a PDF, or photos. You review everything before
            it&apos;s saved.
          </p>
        </div>
      </div>
      <Button
        asChild
        variant="outline"
        className="h-10 w-full shrink-0 sm:w-auto"
        {...tourAnchor("plan-import")}
      >
        <Link href="/plan/import">
          <Upload aria-hidden className="size-4" />
          Import existing plan
        </Link>
      </Button>
    </div>
  );
}
