"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { acknowledgeGoalCompletionAction } from "@/app/(app)/goals/actions";
import { Button } from "@/components/ui/button";

/**
 * The one-time "Goal reached" acknowledgement (design Screen 6; R32–R36, R58).
 * A calm full-width card in the accent — no confetti, badge, streak, sound, or
 * animation beyond the stock fade. Both actions acknowledge it, so it is never
 * shown as a card again. "Set a new goal" opens a BLANK target form for the
 * same lift; Overload never proposes the number.
 */
export function GoalReachedCard({
  goalId,
  exerciseName,
  gymName,
  targetLabel,
  alreadyReached,
  newGoalHref,
}: {
  goalId: string;
  exerciseName: string;
  gymName: string | null;
  targetLabel: string;
  alreadyReached: boolean;
  newGoalHref: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [isPending, startTransition] = useTransition();

  function acknowledge(then?: () => void) {
    startTransition(async () => {
      const result = await acknowledgeGoalCompletionAction(goalId);
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      if (then) then();
      else setHidden(true);
    });
  }

  if (hidden) return null;

  return (
    <div
      role="status"
      className="animate-in fade-in space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5 duration-300"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleCheck aria-hidden className="size-5 text-primary" />
        Goal reached
      </p>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{exerciseName}</p>
        {gymName ? (
          <p className="text-xs text-muted-foreground">{gymName}</p>
        ) : null}
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {targetLabel}
        </p>
        {alreadyReached ? (
          <p className="pt-1 text-sm text-muted-foreground">
            Already reached — your best session meets this target.
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button
          className="h-11 flex-1"
          disabled={isPending}
          aria-label={`Set a new goal for ${exerciseName}`}
          onClick={() => acknowledge(() => router.push(newGoalHref))}
        >
          Set a new goal
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          disabled={isPending}
          onClick={() => acknowledge()}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
