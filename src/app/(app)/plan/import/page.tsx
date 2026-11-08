import Link from "next/link";
import { Lock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/data/account";
import { resolveEntitlement, can } from "@/lib/entitlements/resolve";
import { isPlanImportEnabled } from "@/lib/import/config";
import { SourceIntake } from "@/components/plan/import/source-intake";

export const metadata = { title: "Import plan · Overload" };

/**
 * Workout Plan Import & Review (Pitch 22) — the full-page import flow at
 * /plan/import (OVE-105 foundation: the Source intake step). The route enforces
 * the gate SERVER-SIDE (preview Screens 6/7): a Free account sees the quiet
 * locked card, kill-switch-off shows the operational unavailable card, and
 * neither ever reaches the intake UI. Hiding the entry on /plan is never the
 * gate; this re-check is. A direct visit returns no Pro result.
 */
export default async function PlanImportPage() {
  const account = await requireAccount();
  const resolved = await resolveEntitlement(account);

  if (!can(resolved, "plan_import")) {
    return (
      <GateCard
        icon="lock"
        title="Importing a plan is part of Pro"
        body="You can still build and edit plans by hand, log, see history, and export — all on Free."
        action={
          <Button asChild variant="outline">
            <Link href="/settings/billing">See Pro</Link>
          </Button>
        }
      />
    );
  }

  if (!isPlanImportEnabled()) {
    return (
      <GateCard
        icon="info"
        title="Plan import is temporarily unavailable"
        body="This feature is turned off right now. Nothing was processed and nothing was charged."
        action={
          <Button asChild variant="ghost">
            <Link href="/plan">Back to Plan</Link>
          </Button>
        }
      />
    );
  }

  return <SourceIntake />;
}

function GateCard({
  icon,
  title,
  body,
  action,
}: {
  icon: "lock" | "info";
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  const Icon = icon === "lock" ? Lock : Info;
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <Icon aria-hidden className="mx-auto size-7 text-muted-foreground" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
