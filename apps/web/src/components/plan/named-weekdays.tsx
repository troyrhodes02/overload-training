"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { moveSessionAction } from "@/app/(app)/plan/actions";
import { dayName } from "@overload/shared/plan/calendar";
import type { NamedWeekday } from "@overload/shared/plan/weekday-names";

/**
 * A quiet offer on a draft plan whose session names lead with weekdays (as an
 * imported "Monday — Workout A" does): place them on those days. It uses the
 * existing move-session action per session, so every plan rule still applies.
 * It never sets a start date and never activates the plan.
 */
export function NamedWeekdays({
  namedDays,
}: {
  namedDays: (NamedWeekday & { name: string })[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (namedDays.length === 0) return null;

  async function apply() {
    setBusy(true);
    setError(null);
    for (const s of namedDays) {
      const res = await moveSessionAction({
        sessionId: s.sessionId,
        dayOfWeek: s.dayOfWeek,
      });
      if (!res.ok) {
        setError(res.error.message);
        break;
      }
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium">Use the days from your plan?</p>
      <p className="text-sm text-muted-foreground">
        Your sessions are named for{" "}
        {namedDays.map((s) => dayName(s.dayOfWeek)).join(", ")}. Put them on
        those days. You&rsquo;ll still choose a start date before activating.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="sm" disabled={busy} onClick={apply}>
        Use those days
      </Button>
    </div>
  );
}
