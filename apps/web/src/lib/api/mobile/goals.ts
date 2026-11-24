import "server-only";
import type { Account } from "@/lib/data/account";
import { DomainError, isUuid } from "@/lib/actions/result";
import { acknowledgeGoalCompletion, archiveGoal } from "@/lib/goals/goals";
import type {
  AcknowledgeGoalResponseDto,
  ArchiveGoalResponseDto,
} from "@overload/shared/contracts/goals";
import { shapeError } from "./errors";

/**
 * Goals & Exercise History's mobile adapters (Pitch 21i spec §6). Like the
 * earlier slices', each is a thin shell over the module the web uses,
 * unchanged: the account is the verified token's, every read and write runs
 * on its scoped client, and every rule stays in that module. The adapters
 * only check a request's SHAPE. Goals are Free; no progression reader is
 * called here.
 */

/** Goal writes are a few short fields. */
export const GOAL_BODY_LIMIT = 4 * 1024;

/**
 * E5 `PUT /goals/{goalId}/archived` with `{ archived: true }`: move an active
 * goal to the history (`archiveGoal`, no undo). An absolute value, so a retry
 * after a lost answer succeeds: a goal already in the history answers with
 * how it got there and changes nothing. There is no unarchive (Goals R9), so
 * `false` is refused. Another account's goal is a 404 like a missing one.
 */
export async function setGoalArchivedFromRequest(
  account: Account,
  goalId: string,
  body: Record<string, unknown>,
): Promise<ArchiveGoalResponseDto> {
  if (body.archived !== true) {
    throw shapeError(
      "archived",
      "Send archived as true. A goal in your history can't be reopened.",
    );
  }
  try {
    const { id } = await archiveGoal(account, { goalId });
    return { id, archived: true, outcome: "manual" };
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === "invalid_state_transition"
    ) {
      const goal = isUuid(goalId)
        ? await account.db.goal.findUnique({
            where: { id: goalId },
            select: { id: true, archiveReason: true },
          })
        : null;
      if (goal) {
        return {
          id: goal.id,
          archived: true,
          outcome: goal.archiveReason === "completed" ? "completed" : "manual",
        };
      }
    }
    throw error;
  }
}

/**
 * E6 `PUT /goals/{goalId}/acknowledged` with `{ acknowledged: true }`: dismiss
 * the one-time "Goal reached" card (`acknowledgeGoalCompletion`, idempotent).
 * Only a reached goal has one.
 */
export async function acknowledgeGoalFromRequest(
  account: Account,
  goalId: string,
  body: Record<string, unknown>,
): Promise<AcknowledgeGoalResponseDto> {
  if (body.acknowledged !== true) {
    throw shapeError("acknowledged", "Send acknowledged as true.");
  }
  const { id } = await acknowledgeGoalCompletion(account, { goalId });
  return { id, acknowledged: true };
}
