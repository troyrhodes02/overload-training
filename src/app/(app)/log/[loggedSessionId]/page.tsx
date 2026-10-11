import { notFound } from "next/navigation";
import { listActiveGyms } from "@/lib/gyms/queries";
import { getWorkout } from "@/lib/logging/queries";
import { WorkoutRunner } from "@/components/logging/workout-runner";

export const metadata = { title: "Workout · Overload" };

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ loggedSessionId: string }>;
}) {
  const { loggedSessionId } = await params;
  const workout = await getWorkout(loggedSessionId);
  if (!workout) notFound();

  const gyms = await listActiveGyms();

  return (
    <WorkoutRunner
      workout={workout}
      activeGyms={gyms.map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
