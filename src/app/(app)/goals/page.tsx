import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { GoalList } from "@/components/goals/goal-list";
import { listActiveGoals } from "@/lib/goals/queries";

export const metadata = { title: "Goals · Overload" };

/**
 * Goals overview (design Screen 1): every target being pursued and how close,
 * nothing else. Percentages are derived on this read; the list keeps the order
 * the goals were set in (R64).
 */
export default async function GoalsPage() {
  const goals = await listActiveGoals();

  return (
    <section className="space-y-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Goals</h1>
        <Button asChild variant="outline" className="hidden md:inline-flex">
          <Link href="/goals/new">
            <Plus aria-hidden />
            New goal
          </Link>
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          title="No goals yet."
          description="Set a weight × reps target for a lift to track it here."
        />
      ) : (
        <GoalList goals={goals} />
      )}

      {/* Thumb-reach primary action on phones, above the bottom nav. */}
      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Button asChild className="h-11 w-full">
          <Link href="/goals/new">
            <Plus aria-hidden />
            New goal
          </Link>
        </Button>
      </div>
    </section>
  );
}
