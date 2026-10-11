"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { swapExerciseAction } from "@/app/(app)/log/actions";
import type { SwapContextDto } from "@/lib/logging/queries";

/**
 * Exercise Swap picker (design Screen 5). Lists only active, same-primary-muscle
 * candidates (Resolved Decisions 25, 28, 29); Favorites decorate but never gate
 * eligibility. Selecting one records the substitute on this occurrence only and
 * returns to the runner. Client island; calls swapExerciseAction.
 */
export function SwapPicker({
  context,
  loggedSessionId,
}: {
  context: SwapContextDto;
  loggedSessionId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? context.candidates.filter((c) => c.name.toLowerCase().includes(q))
      : context.candidates;
  }, [query, context.candidates]);

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
          Same muscle: {context.primaryMuscleLabel}
        </p>
      </div>

      {context.swapLocked ? (
        <Alert role="alert">
          <AlertDescription>
            Sets are logged — this exercise is locked.
          </AlertDescription>
        </Alert>
      ) : context.candidates.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm">
            No active exercises share this muscle group (
            {context.primaryMuscleLabel}).
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add one in the library, or leave this exercise unresolved for now.
            Crossing muscle groups is never allowed.
          </p>
        </div>
      ) : (
        <>
          <Input
            placeholder="Search exercises…"
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
                  disabled={pending}
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
    </section>
  );
}
