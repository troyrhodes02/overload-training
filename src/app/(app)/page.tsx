import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreatedToast } from "@/components/feedback/created-toast";
import { formatPlanDate } from "@/lib/plan/calendar";
import { MissedDayPrompt } from "@/components/logging/missed-day-prompt";
import {
  getTodayDashboard,
  type DashboardTodayDto,
} from "@/lib/logging/queries";
import {
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { ProgressTag } from "@/components/progression/progress-tag";
import { SuggestedLoad } from "@/components/progression/suggested-load";
import { ScheduledDeloadBanner } from "@/components/progression/scheduled-deload-banner";
import { DashboardGoals } from "@/components/goals/dashboard-goals";
import { SessionGoalRows } from "@/components/goals/session-goal-rows";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import { dashboardShowsGoals } from "@/lib/goals/dashboard";
import { CardioCards, CardioFocal } from "@/components/cardio/cardio-today";
import { accountToday, requireAccount } from "@/lib/data/account";

export const metadata = { title: "Today · Overload" };

/** Post-session progression summary on the day-complete state (OVE-28; R52). */
async function CompleteBlock({ state }: { state: DashboardTodayDto }) {
  const account = await requireAccount();
  const summary = state.loggedSessionId
    ? await getSessionProgressionSummary(account, state.loggedSessionId)
    : null;
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="font-medium">✓ {state.sessionName} complete</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {state.gymName ? `${state.gymName} · ` : ""}
        {state.exercises.length} exercises · {state.setsLogged} working sets
        logged
      </p>
      {summary?.scheduledDeloadWeek ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Deload week — recovery, not a verdict.
        </p>
      ) : summary && summary.exercises.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {summary.exercises.map((e) => (
            <li
              key={e.performedExerciseId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                {e.performedExerciseName}
                <ProgressTag state={e.tag} />
              </span>
              <span className="flex items-center gap-3">
                {e.tag === "progress" && e.suggestion ? (
                  <SuggestedLoad suggestion={e.suggestion} />
                ) : null}
                {e.hasTrend ? (
                  <Link
                    href={`/exercises/${e.performedExerciseId}`}
                    className="text-primary"
                  >
                    trend ›
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {state.loggedSessionId ? (
        <SessionGoalRows loggedSessionId={state.loggedSessionId} />
      ) : null}
      <div className="mt-4 flex items-center gap-4 text-sm">
        {state.loggedSessionId ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/history/${state.loggedSessionId}`}>View workout</Link>
          </Button>
        ) : null}
        <Link href="/history" className="text-muted-foreground">
          History →
        </Link>
      </div>
    </div>
  );
}

async function TodayBlock({ state }: { state: DashboardTodayDto }) {
  const account = await requireAccount();
  if (state.kind === "complete") {
    return (
      <div className="space-y-4">
        <CompleteBlock state={state} />
        <CardioCards entries={state.cardio} />
      </div>
    );
  }

  const resuming = state.kind === "in_progress";
  const href = resuming
    ? `/log/${state.loggedSessionId}`
    : `/log/start?sessionId=${state.sessionId}&scheduledFor=${state.scheduledFor}`;

  // Derived tags for the planned list (OVE-28). Free-weight exercises show their
  // global call now; gym-variable exercises defer until the workout gym is chosen
  // (R14/R15). During a scheduled-deload week reactive tags are suppressed and
  // the 90% load is shown instead (R37).
  const progression = await Promise.all(
    state.exercises.map((e) =>
      getPlannedProgression(account, e.exerciseId, {
        scheduledDeloadWeek: state.scheduledDeloadWeek,
      }),
    ),
  );

  return (
    <div className="space-y-4">
      {state.scheduledDeloadWeek ? <ScheduledDeloadBanner /> : null}
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
          {state.exercises.map((e, i) => {
            const p = progression[i];
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className={e.done ? "text-muted-foreground" : ""}>
                  {e.done ? "✓ " : ""}
                  {e.name}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {p.gymVariable ? (
                    <span className="text-xs">once gym is set</span>
                  ) : p.suggestion ? (
                    <SuggestedLoad suggestion={p.suggestion} />
                  ) : null}
                  <ProgressTag state={p.tag} />
                  {!p.tag && !p.gymVariable ? e.scheme : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <Button asChild size="lg" className="w-full">
        <Link href={href}>{resuming ? "Resume workout" : "Start workout"}</Link>
      </Button>
      {/* Cardio sits beneath the lifting workflow; lifting keeps the floor. */}
      <CardioCards entries={state.cardio} />
    </div>
  );
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `?notice=password-updated` comes from a completed password reset (Accounts). */
export default async function TodayPage({ searchParams }: PageProps) {
  const { notice } = await searchParams;
  return (
    <>
      <CreatedToast
        show={notice === "password-updated"}
        message="Password updated."
      />
      <TodayContent />
    </>
  );
}

async function TodayContent() {
  const account = await requireAccount();
  const dash = await getTodayDashboard(account);
  const today = formatPlanDate(accountToday(account));

  // Goals fill the dashboard ONLY when no training action is pending (Goals
  // R42, R43). Completion is reconciled first (spec §11b, R54) so a just-met
  // goal shows its card and the summary can say "Goal reached".
  const showGoals = dashboardShowsGoals(dash.kind);
  if (showGoals) await reconcileGoalCompletionsSafely(account);

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
        <DashboardGoals />
      </section>
    );
  }

  if (dash.kind === "rest" && dash.cardio.length > 0) {
    // Cardio-only day: a real training day, no fake workout (Cardio R16).
    return (
      <section className="space-y-6">
        <p className="text-sm text-muted-foreground">Today · {today}</p>
        <CardioFocal entries={dash.cardio} week={dash.week} />
        <DashboardGoals />
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
        <DashboardGoals />
      </section>
    );
  }

  if (dash.kind === "missed_day") {
    return (
      <section className="space-y-6">
        <p className="text-sm text-muted-foreground">Today · {today}</p>
        <MissedDayPrompt missed={dash.missed} />
        {dash.below ? (
          <div inert className="opacity-50">
            <TodayBlock state={dash.below} />
          </div>
        ) : dash.cardio.length > 0 ? (
          // Cardio never prompts; it waits, dimmed, until the lifting
          // missed day is resolved (Cardio R35, R67).
          <div inert className="opacity-50">
            <CardioCards entries={dash.cardio} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <p className="text-sm text-muted-foreground">Today · {today}</p>
      <TodayBlock state={dash} />
      {showGoals ? <DashboardGoals /> : null}
    </section>
  );
}
