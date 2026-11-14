import { notFound, redirect } from "next/navigation";
import { listActiveGyms } from "@/lib/gyms/queries";
import { getWorkoutView } from "@/lib/views/workout";
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
  // The one workout composition (Pitch 21c): the workout plus each card's
  // gated call, with the entitlement resolved once.
  const view = await getWorkoutView(account, loggedSessionId);
  if (!view) notFound();
  const { workout } = view;
  // A finished workout is a historical record: never offer set entry or a
  // swap on it (OVE-129 / audit F-T1). Its sets are corrected from history.
  if (workout.status === "complete")
    redirect(`/history/${workout.loggedSessionId}`);

  // Derived per-occurrence progression for each card (OVE-28). Computed on read;
  // nothing is stored. Scheduled-deload weeks suppress the reactive tag here too.
  const byExercise = new Map(
    view.progression.map((p) => [p.loggedExerciseId, p.progression]),
  );
  const progression: Record<string, CardProgression> = Object.fromEntries(
    workout.exercises.map((e) => {
      const occ = byExercise.get(e.loggedExerciseId);
      const value: CardProgression = {
        tag: occ?.tag ?? null,
        recommendation: occ?.recommendation ?? null,
        scheduledDeloadWeek: occ?.scheduledDeloadWeek ?? false,
        historyHref: occ?.historyHref ?? null,
        locked: occ?.locked != null,
      };
      return [e.loggedExerciseId, value] as const;
    }),
  );

  const gyms = await listActiveGyms(account);

  return (
    <WorkoutRunner
      workout={workout}
      activeGyms={gyms.map((g) => ({ id: g.id, name: g.name }))}
      progression={progression}
    />
  );
}
