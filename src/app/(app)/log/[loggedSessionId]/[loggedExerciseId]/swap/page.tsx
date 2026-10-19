import { notFound } from "next/navigation";
import { getSwapContext } from "@/lib/logging/queries";
import { SwapPicker } from "@/components/logging/swap-picker";
import { requireAccount } from "@/lib/data/account";

export const metadata = { title: "Swap exercise · Overload" };

export default async function SwapPage({
  params,
}: {
  params: Promise<{ loggedSessionId: string; loggedExerciseId: string }>;
}) {
  const account = await requireAccount();
  const { loggedSessionId, loggedExerciseId } = await params;
  const context = await getSwapContext(account, loggedExerciseId);
  if (!context) notFound();

  return <SwapPicker context={context} loggedSessionId={loggedSessionId} />;
}
