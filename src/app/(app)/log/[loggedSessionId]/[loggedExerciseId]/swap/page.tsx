import { notFound } from "next/navigation";
import { getSwapContext } from "@/lib/logging/queries";
import { SwapPicker } from "@/components/logging/swap-picker";
import { requireAccount } from "@/lib/data/account";

export const metadata = { title: "Swap exercise · Overload" };

export default async function SwapPage({
  params,
  searchParams,
}: {
  params: Promise<{ loggedSessionId: string; loggedExerciseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();
  const { loggedSessionId, loggedExerciseId } = await params;
  const { muscle } = await searchParams;
  // The muscle filter is URL state; anything unrecognized falls back to the
  // planned exercise's muscle group inside getSwapContext.
  const context = await getSwapContext(
    account,
    loggedExerciseId,
    typeof muscle === "string" ? muscle : null,
  );
  if (!context) notFound();

  return <SwapPicker context={context} loggedSessionId={loggedSessionId} />;
}
