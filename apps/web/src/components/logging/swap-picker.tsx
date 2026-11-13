"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { swapExerciseAction } from "@/app/(app)/log/actions";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
} from "@overload/shared/exercises/taxonomy";
import type { SwapContextDto } from "@/lib/logging/queries";
import { cn } from "@/lib/utils";

/**
 * Exercise Swap picker (design Screen 5; Workout Logging Refinements design
 * Screen 3). Opens on the planned exercise's primary muscle and lists that
 * group's active exercises; the Muscle group select switches the list to any
 * group (RD-6 superseded the same-muscle-only rule). The filter is URL state
 * (`?muscle=`), so the server lists the group. Favorites decorate but never
 * gate eligibility. Selecting one records the substitute on this occurrence
 * only and returns to the runner. Client island; calls swapExerciseAction.
 */
export function SwapPicker({
  context,
  loggedSessionId,
}: {
  context: SwapContextDto;
  loggedSessionId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();
  // The group the lifter just chose, shown while the server lists it; once
  // the navigation settles (or fails) the server's group is the truth.
  const [pendingMuscle, setPendingMuscle] = useState<string | null>(null);
  const shownMuscle =
    loading && pendingMuscle ? pendingMuscle : context.selectedMuscle;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? context.candidates.filter((c) => c.name.toLowerCase().includes(q))
      : context.candidates;
  }, [query, context.candidates]);

  function changeMuscle(muscle: string) {
    setError(null);
    setPendingMuscle(muscle);
    const href =
      muscle === context.plannedMuscle
        ? pathname
        : `${pathname}?muscle=${encodeURIComponent(muscle)}`;
    startLoading(() => router.replace(href, { scroll: false }));
  }

  function select(newExerciseId: string) {
    setError(null);
    startTransition(async () => {
      const res = await swapExerciseAction({
        loggedExerciseId: context.loggedExerciseId,
        newExerciseId,
      });
      if (res.ok) router.push(`/log/${loggedSessionId}`);
      else setError(res.error.message);
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="font-medium">Swap: {context.plannedExerciseName}</p>
        <p className="text-sm text-muted-foreground">
          Planned: {context.primaryMuscleLabel}
        </p>
      </div>

      {context.swapLocked ? (
        <Alert role="alert">
          <AlertDescription>
            Sets are logged — this exercise is locked.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="swap-muscle">Muscle group</Label>
            <Select
              value={shownMuscle}
              onValueChange={changeMuscle}
              disabled={pending}
            >
              <SelectTrigger id="swap-muscle" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUSCLE_GROUPS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MUSCLE_GROUP_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={cn(
              "space-y-3 transition-opacity",
              loading && "opacity-60",
            )}
            aria-busy={loading}
          >
            {context.candidates.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm">
                  No active exercises for {context.selectedMuscleLabel}.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick another muscle group, or add one in the library.
                </p>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search exercises…"
                  aria-label="Search exercises"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11"
                />
                {error ? (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={pending || loading}
                        onClick={() => select(c.id)}
                        className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span className="w-4 text-muted-foreground">
                          {c.isFavorite ? <Star className="size-3.5" /> : null}
                        </span>
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
