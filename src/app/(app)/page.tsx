import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPlanDate } from "@/lib/plan/calendar";
import {
  getTodayDashboard,
  type DashboardTodayDto,
} from "@/lib/logging/queries";

export const metadata = { title: "Today · Overload" };

function TodayBlock({ state }: { state: DashboardTodayDto }) {
  if (state.kind === "complete") {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">✓ {state.sessionName} complete</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.gymName ? `${state.gymName} · ` : ""}
          {state.exercises.length} exercises · {state.setsLogged} working sets
          logged
        </p>
        <div className="mt-4 flex items-center gap-4 text-sm">
          {state.loggedSessionId ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/history/${state.loggedSessionId}`}>
                View workout
              </Link>
            </Button>
          ) : null}
          <Link href="/history" className="text-muted-foreground">
            History →
          </Link>
        </div>
      </div>
    );
  }

  const resuming = state.kind === "in_progress";
  const href = resuming
    ? `/log/${state.loggedSessionId}`
    : `/log/start?sessionId=${state.sessionId}&scheduledFor=${state.scheduledFor}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">
          {state.sessionName}
          {state.gymName ? (
            <span className="text-muted-foreground"> · {state.gymName}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Week {state.week} ·{" "}
          {resuming
            ? `${state.exercises.filter((e) => e.done).length} of ${state.exercises.length} exercises logged`
            : `${state.exercises.length} exercises`}
        </p>
        <ul className="mt-3 space-y-1.5 tabular-nums">
          {state.exercises.map((e, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className={e.done ? "text-muted-foreground" : ""}>
                {e.done ? "✓ " : ""}
                {e.name}
              </span>
              <span className="text-muted-foreground">{e.scheme}</span>
            </li>
          ))}
        </ul>
      </div>
      <Button asChild size="lg" className="w-full">
        <Link href={href}>{resuming ? "Resume workout" : "Start workout"}</Link>
      </Button>
    </div>
  );
}

export default async function TodayPage() {
  const dash = await getTodayDashboard();
  const today = formatPlanDate(new Date().toISOString().slice(0, 10));

  if (dash.kind === "no_plan") {
    return (
      <section className="space-y-6">
        <p className="text-sm text-muted-foreground">Today · {today}</p>
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No active plan.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Build and activate a mesocycle to start training.{" "}
            <Link href="/plan" className="underline">
              Plan →
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (dash.kind === "rest") {
    return (
      <section className="space-y-6">
        <p className="text-sm text-muted-foreground">Today · {today}</p>
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No lifting planned today.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rest up.{" "}
            <Link href="/history" className="underline">
              History →
            </Link>
          </p>
        </div>
      </section>
    );
  }

  // Missed-day prompt UI arrives in OVE-24; until then surface today's state.
  const state = dash.kind === "missed_day" ? dash.below : dash;

  return (
    <section className="space-y-6">
      <p className="text-sm text-muted-foreground">Today · {today}</p>
      {state ? (
        <TodayBlock state={state} />
      ) : (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No lifting planned today.</p>
          <p className="mt-1 text-sm text-muted-foreground">Rest up.</p>
        </div>
      )}
    </section>
  );
}
