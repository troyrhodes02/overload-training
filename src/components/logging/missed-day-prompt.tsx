"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resolveMissedDayAction } from "@/app/(app)/log/actions";
import { formatPlanDate } from "@/lib/plan/calendar";
import type { MissedDayInfo } from "@/lib/logging/queries";

/**
 * Missed-day prompt (design Screen 2; Resolved Decisions 31–39). Exactly three
 * one-tap outcomes for the OLDEST unresolved missed day. "Log it late" starts
 * the workout for the original missed occurrence; "Shift" and "Skip" persist a
 * dated resolution. No auto-resolution. Client island.
 */
export function MissedDayPrompt({ missed }: { missed: MissedDayInfo }) {
  const router = useRouter();
  const [confirmingShift, setConfirmingShift] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resolve(outcome: "shifted" | "skipped") {
    setError(null);
    startTransition(async () => {
      const res = await resolveMissedDayAction({
        mesocycleId: missed.mesocycleId,
        missedOn: missed.missedOn,
        outcome,
      });
      if (res.ok) {
        toast.info(
          outcome === "skipped"
            ? "Skipped. Past weeks stay as planned."
            : "This week shifted forward a day.",
        );
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  }

  function logLate() {
    router.push(
      `/log/start?sessionId=${missed.sessionId}&scheduledFor=${missed.missedOn}`,
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="font-medium">You missed a workout</p>
      <p className="mt-1 text-sm">
        {missed.sessionName} — {formatPlanDate(missed.missedOn)}{" "}
        <span className="text-muted-foreground">
          ({missed.daysAgo} {missed.daysAgo === 1 ? "day" : "days"} ago)
        </span>
      </p>

      {error ? (
        <Alert variant="destructive" role="alert" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {confirmingShift ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Remaining days this week each move forward one day. Next week is
            unchanged. A day pushed past the end of the week is dropped.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setConfirmingShift(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => resolve("shifted")}
              disabled={pending}
            >
              Confirm shift
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Button
            variant="secondary"
            className="h-auto w-full justify-start py-3 text-left"
            onClick={logLate}
            disabled={pending}
          >
            <span className="block">
              <span className="block text-sm font-medium">Log it late</span>
              <span className="block text-xs text-muted-foreground">
                Record the sets you did that day
              </span>
            </span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto w-full justify-start py-3 text-left"
            onClick={() => setConfirmingShift(true)}
            disabled={pending}
          >
            <span className="block">
              <span className="block text-sm font-medium">Shift the week</span>
              <span className="block text-xs text-muted-foreground">
                Move the rest of this week forward one day
              </span>
            </span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto w-full justify-start py-3 text-left"
            onClick={() => resolve("skipped")}
            disabled={pending}
          >
            <span className="block">
              <span className="block text-sm font-medium">Skip it</span>
              <span className="block text-xs text-muted-foreground">
                Mark it missed and move on
              </span>
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
