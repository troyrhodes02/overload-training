import { notFound } from "next/navigation";
import { getSwapContext } from "@/lib/logging/queries";
import { SwapPicker } from "@/components/logging/swap-picker";

export const metadata = { title: "Swap exercise · Overload" };

export default async function SwapPage({
  params,
}: {
  params: Promise<{ loggedSessionId: string; loggedExerciseId: string }>;
}) {
  const { loggedSessionId, loggedExerciseId } = await params;
  const context = await getSwapContext(loggedExerciseId);
  if (!context) notFound();

  return <SwapPicker context={context} loggedSessionId={loggedSessionId} />;
}
