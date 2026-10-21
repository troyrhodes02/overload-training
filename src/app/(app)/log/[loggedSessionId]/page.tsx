import { notFound } from "next/navigation";
import { listActiveGyms } from "@/lib/gyms/queries";
import { getWorkout } from "@/lib/logging/queries";
import { getOccurrenceProgression } from "@/lib/progression/queries";
import { WorkoutRunner } from "@/components/logging/workout-runner";
import type { CardProgression } from "@/components/logging/exercise-card";
import { requireAccount } from "@/lib/data/account";

export const metadata = { title: "Workout · Overload" };

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ loggedSessionId: string }>;
}) {
  const account = await requireAccount();
  const { loggedSessionId } = await params;
  const workout = await getWorkout(account, loggedSessionId);
  if (!workout) notFound();

  // Derived per-occurrence progression for each card (OVE-28). Computed on read;
  // nothing is stored. Scheduled-deload weeks suppress the reactive tag here too.
  const progressionEntries = await Promise.all(
    workout.exercises.map(async (e) => {
      const occ = await getOccurrenceProgression(account, e.loggedExerciseId);
      const value: CardProgression = {
        tag: occ?.tag ?? null,
        rirEffect: occ?.rirEffect ?? null,
        suggestion: occ?.suggestion ?? null,
        scheduledDeloadWeek: occ?.scheduledDeloadWeek ?? false,
        hasTrend: occ?.hasTrend ?? false,
      };
      return [e.loggedExerciseId, value] as const;
    }),
  );
  const progression: Record<string, CardProgression> =
    Object.fromEntries(progressionEntries);

  const gyms = await listActiveGyms(account);

  return (
    <WorkoutRunner
      workout={workout}
      activeGyms={gyms.map((g) => ({ id: g.id, name: g.name }))}
      progression={progression}
    />
  );
}
