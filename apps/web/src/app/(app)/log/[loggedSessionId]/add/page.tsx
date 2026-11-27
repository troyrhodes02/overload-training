import { notFound } from "next/navigation";
import { getAddExerciseContext } from "@/lib/logging/wing-it";
import { AddExercisePicker } from "@/components/logging/add-exercise-picker";
import { requireAccount } from "@/lib/data/account";

export const metadata = { title: "Add an exercise · Overload" };

/**
 * Pitch 25: add an exercise to a Wing-It workout. Another account's workout,
 * a planned one, or a missing one is not found. The muscle filter is URL
 * state; anything unrecognized lists every group.
 */
export default async function AddExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ loggedSessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();
  const { loggedSessionId } = await params;
  const { muscle } = await searchParams;
  const context = await getAddExerciseContext(
    account,
    loggedSessionId,
    typeof muscle === "string" ? muscle : null,
  );
  if (!context) notFound();
  return <AddExercisePicker context={context} />;
}
