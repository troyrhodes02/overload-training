import "server-only";
import type { Account } from "@/lib/data/account";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import {
  countGoalHistory,
  getGoalDetail,
  getGoalFormContext,
  listActiveGoals,
  listGoalHistory,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import type {
  GoalDetailDto,
  GoalFormContextDto,
  GoalHistoryListDto,
  GoalsOverviewDto,
} from "@overload/shared/contracts/goals";

/**
 * The goal reads the iPhone app gets (Pitch 21i spec §6, E1–E3, E7): the same
 * composition the web's goal pages render. Each runs the web's completion
 * check first (Goals R54), exactly as those pages do, so a target history has
 * met arrives as a reached goal, never as an active 100%. The check is the
 * one conditional engine (`reconcileGoalCompletions`): it writes a goal's
 * completion at most once, and only for a goal the account owns. Nothing else
 * here writes.
 */

/** E1 `GET /goals`: the reached cards, the active goals, the history count. */
export async function getGoalsOverview(
  account: Account,
): Promise<GoalsOverviewDto> {
  await reconcileGoalCompletionsSafely(account);
  const [reached, active, historyCount] = await Promise.all([
    listUnacknowledgedCompletions(account),
    listActiveGoals(account),
    countGoalHistory(account),
  ]);
  return { reached, active, historyCount };
}

/** E2 `GET /goals/history`: reached and archived goals, most recent first. */
export async function getGoalHistoryView(
  account: Account,
): Promise<GoalHistoryListDto> {
  await reconcileGoalCompletionsSafely(account);
  return { goals: await listGoalHistory(account) };
}

/** E3 `GET /goals/{goalId}`: one goal, or null (missing or another account's). */
export async function getGoalDetailView(
  account: Account,
  goalId: string,
): Promise<GoalDetailDto | null> {
  await reconcileGoalCompletionsSafely(account);
  return getGoalDetail(account, goalId);
}

/** E7 `GET /exercises/{exerciseId}/goal-form`: the target form's context. */
export async function getGoalFormContextView(
  account: Account,
  exerciseId: string,
  requestedGymId: string | null,
): Promise<GoalFormContextDto> {
  // A goal history already met must never read as the active goal that
  // blocks a new one (the web's new-goal pages reconcile first too).
  await reconcileGoalCompletionsSafely(account);
  return getGoalFormContext(account, exerciseId, requestedGymId);
}
