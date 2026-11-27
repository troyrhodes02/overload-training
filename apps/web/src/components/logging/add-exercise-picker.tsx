"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
import { addWingItExerciseAction } from "@/app/(app)/log/actions";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
} from "@overload/shared/exercises/taxonomy";
import {
  WING_IT_COPY,
  filterAddCandidates,
} from "@overload/shared/logging/wing-it";
import type { AddExerciseContextDto } from "@overload/shared/contracts/logging";
import { cn } from "@/lib/utils";

const ALL = "all";

/**
 * Add an exercise to a Wing-It workout (Pitch 25 design §6.8; preview.tsx
 * "picker"). The swap picker's layout: a muscle-group filter whose first
 * option, and default, is every group (URL state `?muscle=`, so the server
 * lists the group), a search over the listed exercises, favorites first.
 * Choosing one the workout already has opens its card and adds nothing (one
 * card per exercise, RD-22). Client island; calls addWingItExerciseAction.
 */
export function AddExercisePicker({
  context,
}: {
  context: AddExerciseContextDto;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();
  const [pendingMuscle, setPendingMuscle] = useState<string | null>(null);
  const shownMuscle =
    loading && pendingMuscle ? pendingMuscle : context.selectedMuscle;
  const runner = `/log/${context.loggedSessionId}`;

  const filtered = useMemo(
    () => filterAddCandidates(context.candidates, query),
    [query, context.candidates],
  );

  function changeMuscle(muscle: string) {
    setError(null);
    setPendingMuscle(muscle);
    const href =
      muscle === ALL
        ? pathname
        : `${pathname}?muscle=${encodeURIComponent(muscle)}`;
    startLoading(() => router.replace(href, { scroll: false }));
  }

  function select(exerciseId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addWingItExerciseAction({
        loggedSessionId: context.loggedSessionId,
        exerciseId,
      });
      if (res.ok)
        router.push(
          `${runner}?exercise=${encodeURIComponent(res.data.loggedExerciseId)}`,
        );
      else setError(res.error.message);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-medium">{WING_IT_COPY.pickerTitle}</h1>
        <Link href={runner} className="text-sm text-muted-foreground">
          Cancel
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="add-muscle">Muscle group</Label>
          <Select
            value={shownMuscle}
            onValueChange={changeMuscle}
            disabled={pending}
          >
            <SelectTrigger id="add-muscle" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{WING_IT_COPY.allMuscles}</SelectItem>
              {MUSCLE_GROUPS.map((m) => (
                <SelectItem key={m} value={m}>
                  {MUSCLE_GROUP_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-search">Search</Label>
          <Input
            id="add-search"
            placeholder="Search exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn("transition-opacity", loading && "opacity-60")}
        aria-busy={loading}
      >
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm">
              {context.candidates.length === 0
                ? `No active exercises for ${context.selectedMuscleLabel}.`
                : WING_IT_COPY.noMatch}
            </p>
          </div>
        ) : (
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
                    {c.isFavorite ? (
                      <Star className="size-3.5" aria-label="Favorite" />
                    ) : null}
                  </span>
                  <span className="flex-1">{c.name}</span>
                  {c.inWorkout ? (
                    <span className="text-xs text-muted-foreground">
                      {WING_IT_COPY.inWorkout}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
