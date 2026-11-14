import "server-only";
import type { Account } from "@/lib/data/account";
import { accountToday } from "@/lib/data/account";
import { getTodayDashboard } from "@/lib/logging/queries";
import {
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { resolveRequestEntitlement } from "@/lib/entitlements/resolve";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import {
  countActiveGoals,
  getSessionGoalSummary,
  listActiveGoals,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import { dashboardShowsGoals } from "@overload/shared/goals/dashboard";
import { composeGreeting } from "@/lib/personalization/greeting";
import { getGreetingFacts } from "@/lib/personalization/greeting-facts";
import type {
  DashboardDto,
  DashboardTodayDto,
} from "@overload/shared/contracts/logging";
import type { TodayDto } from "@overload/shared/contracts/views";

/**
 * The Today view (Pitch 21c spec §9.2): the ONE composition of the Today
 * screen, read by the web's Today page and by `GET /api/mobile/v1/today`, so
 * the two never disagree about the greeting, the day's call per exercise, the
 * summary, or the goals.
 *
 * It reads only through the acting account's scoped client and the GATED
 * progression readers (a Free account gets `locked` and null Pro fields). Its
 * one write is the web's existing pre-render goal reconciliation, run only when
 * the dashboard shows goals (Goals R54) and never inside a set's transaction:
 * a conditional, idempotent completion of goals the logged history already met.
 *
 * Nothing about training is computed here; it only assembles the existing
 * reads in the order the page has always used.
 */

/** How many active goals Today surfaces before "All goals" (Goals R64). */
export const DASHBOARD_GOAL_LIMIT = 3;

/** The day whose planned list Today shows (and so needs calls for). */
function shownDay(dashboard: DashboardDto): DashboardTodayDto | null {
  if (dashboard.kind === "pending" || dashboard.kind === "in_progress") {
    return dashboard;
  }
  // The dimmed day beneath the missed-day prompt still shows its list.
  if (dashboard.kind === "missed_day") {
    return dashboard.below && dashboard.below.kind !== "complete"
      ? dashboard.below
      : null;
  }
  return null;
}

export async function getTodayView(
  account: Account,
  opts: { now?: Date } = {},
): Promise<TodayDto> {
  // One instant for the greeting's clock and the entitlement.
  const now = opts.now ?? new Date();
  const [dashboard, facts, entitlement] = await Promise.all([
    getTodayDashboard(account),
    getGreetingFacts(account, now),
    resolveRequestEntitlement(account, now),
  ]);

  // Deterministic per account + local date + situation.
  const greeting = composeGreeting({
    dashboard,
    firstName: facts.firstName,
    timeZone: facts.timeZoneValid ? account.timeZone : null,
    firstVisit: facts.firstVisit,
    accountKey: account.userId,
    now,
  });

  // Goals show ONLY when no training action is pending (Goals R42, R43), and
  // completion is reconciled first so a just-met goal shows its card (R54).
  const showGoals = dashboardShowsGoals(dashboard.kind);
  if (showGoals) await reconcileGoalCompletionsSafely(account);

  const day = shownDay(dashboard);
  // The finished day's summary and goal rows: today's, or the dimmed day under
  // a missed-day prompt when today is already done.
  const completedDay =
    dashboard.kind === "complete"
      ? dashboard
      : dashboard.kind === "missed_day" && dashboard.below?.kind === "complete"
        ? dashboard.below
        : null;
  const completedSessionId = completedDay?.loggedSessionId ?? null;

  // Independent reads, together (as the page's blocks once rendered them),
  // all after the reconciliation above.
  const [plannedProgression, sessionSummary, sessionGoals, goals] =
    await Promise.all([
      day
        ? Promise.all(
            day.exercises.map(async (e) => ({
              exerciseId: e.exerciseId,
              progression: await getPlannedProgression(account, e.exerciseId, {
                scheduledDeloadWeek: day.scheduledDeloadWeek,
                entitlement,
              }),
            })),
          )
        : Promise.resolve([]),
      completedSessionId
        ? getSessionProgressionSummary(account, completedSessionId, {
            entitlement,
          })
        : Promise.resolve(null),
      completedSessionId
        ? getSessionGoalSummary(account, completedSessionId)
        : Promise.resolve([]),
      showGoals
        ? Promise.all([
            listUnacknowledgedCompletions(account),
            listActiveGoals(account, { take: DASHBOARD_GOAL_LIMIT }),
            countActiveGoals(account),
          ]).then(([reached, active, activeTotal]) => ({
            reached,
            active,
            activeTotal,
          }))
        : Promise.resolve(null),
    ]);

  return {
    today: accountToday(account),
    greeting,
    dashboard,
    plannedProgression,
    sessionSummary,
    sessionGoals,
    goals,
  };
}
