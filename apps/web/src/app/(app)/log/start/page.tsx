import { notFound } from "next/navigation";
import { listActiveGyms } from "@/lib/gyms/queries";
import { GymPicker } from "@/components/logging/gym-picker";
import { requireAccount } from "@/lib/data/account";

export const metadata = { title: "Start workout · Overload" };

export default async function StartWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string; scheduledFor?: string }>;
}) {
  const account = await requireAccount();
  const { sessionId, scheduledFor } = await searchParams;
  if (!sessionId || !scheduledFor) notFound();

  const gyms = await listActiveGyms(account);

  return (
    <section className="space-y-4">
      <p className="font-medium">Where are you training?</p>
      <div className="rounded-lg border border-border bg-card p-4">
        <GymPicker
          mode="start"
          sessionId={sessionId}
          scheduledFor={scheduledFor}
          gyms={gyms.map((g) => ({ id: g.id, name: g.name }))}
        />
      </div>
    </section>
  );
}
