import Link from "next/link";
import { notFound } from "next/navigation";
import { listActiveGyms } from "@/lib/gyms/queries";
import { listUnfinishedWorkouts } from "@/lib/logging/queries";
import { GymPicker } from "@/components/logging/gym-picker";
import { Button } from "@/components/ui/button";
import { accountToday, requireAccount } from "@/lib/data/account";
import { startWhileUnfinished } from "@overload/shared/logging/unfinished";
import { movedDayOf } from "@/lib/logging/this-week";

export const metadata = { title: "Start workout · Overload" };

export default async function StartWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    sessionId?: string;
    scheduledFor?: string;
    /** "1" once the lifter chose to start despite an unfinished workout. */
    continue?: string;
  }>;
}) {
  const account = await requireAccount();
  const { sessionId, scheduledFor, continue: proceed } = await searchParams;
  if (!sessionId || !scheduledFor) notFound();

  // Pitch 21g (OVE-228): warn, never forbid. Before another workout starts
  // while an earlier one is unfinished, say so once, with Resume as the
  // first choice; "Start today's anyway" carries on to the gym choice.
  if (proceed !== "1") {
    const unfinished = await listUnfinishedWorkouts(account);
    const latest = unfinished[0];
    if (latest) {
      // A workout moved this week (OVE-240) starts on its new day: name
      // that day ("today's workout" after Train today), not its planned one.
      const movedDay = await movedDayOf(account, sessionId, scheduledFor);
      const copy = startWhileUnfinished(latest, {
        scheduledFor: movedDay ?? scheduledFor,
        today: accountToday(account),
      });
      const onward = `/log/start?${new URLSearchParams({
        sessionId,
        scheduledFor,
        continue: "1",
      })}`;
      return (
        <section className="space-y-4">
          <div
            role="alertdialog"
            aria-labelledby="unfinished-warning"
            aria-describedby="unfinished-warning-text"
            className="rounded-lg border border-attention bg-card p-6"
          >
            <p id="unfinished-warning" className="font-medium">
              {copy.title}
            </p>
            <p
              id="unfinished-warning-text"
              className="mt-1 text-sm text-muted-foreground"
            >
              {copy.message}
              {unfinished.length > 1
                ? ` ${unfinished.length - 1} more ${unfinished.length === 2 ? "is" : "are"} listed on Today.`
                : ""}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="h-11">
                <Link href={`/log/${latest.loggedSessionId}`}>
                  {copy.resume}
                </Link>
              </Button>
              <Button asChild variant="secondary" className="h-11">
                <Link href={onward}>{copy.startAnyway}</Link>
              </Button>
            </div>
          </div>
        </section>
      );
    }
  }

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
