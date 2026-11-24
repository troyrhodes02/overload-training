import "server-only";
import type { Account } from "@/lib/data/account";
import { DomainError, isUniqueViolation, isUuid } from "@/lib/actions/result";
import {
  acknowledgeGoalCompletion,
  archiveGoal,
  createGoal,
} from "@/lib/goals/goals";
import type {
  AcknowledgeGoalResponseDto,
  ArchiveGoalResponseDto,
  CreateGoalResponseDto,
} from "@overload/shared/contracts/goals";
import { readJsonObject } from "./body";
import { shapeError } from "./errors";
import { withIdempotency } from "./idempotency";
import { getGoalFormContextView } from "@/lib/views/goals";
import { requireIdempotencyKey } from "./resources";

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

/** A field the goal parser reads: a string or a number, or absent. */
function scalar(value: unknown, field: string): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number") return value;
  throw shapeError(field, "Send this field as a number or a string.");
}

/**
 * E4 `POST /goals` (with an `Idempotency-Key`): a goal with the web's fields
 * and every rule of `createGoal` (an active exercise with external weight; a
 * gym iff the lift is a machine or cable, and an active one; one active goal
 * per exercise, never replaced; a target history already meets completes at
 * creation). Claimed and created in one transaction, so a retry of the same
 * request answers with the first result and never makes a second goal. 201
 * with the goal's id and whether it is active or already reached.
 *
 * Two DIFFERENT requests for the same exercise racing past `createGoal`'s
 * check are settled by the database's one-active-goal index: the loser
 * answers the web's own duplicate conflict, with the winner's id.
 */
export async function createGoalFromRequest(
  account: Account,
  request: Request,
): Promise<Response> {
  const key = requireIdempotencyKey(request);
  const body = await readJsonObject(request, GOAL_BODY_LIMIT);
  if (typeof body.exerciseId !== "string") {
    throw shapeError("exerciseId", "Pick an active exercise.");
  }
  if (
    body.gymId !== undefined &&
    body.gymId !== null &&
    typeof body.gymId !== "string"
  ) {
    throw shapeError("gymId", "Send gymId as a string or null.");
  }
  const input = {
    exerciseId: body.exerciseId,
    gymId: (body.gymId as string | null | undefined) ?? null,
    targetWeightLbs: scalar(body.targetWeightLbs, "targetWeightLbs"),
    targetReps: scalar(body.targetReps, "targetReps"),
  };
  try {
    return await withIdempotency<CreateGoalResponseDto>(
      account,
      { key, scope: "POST /v1/goals", body: input },
      async (tx) => {
        const created = await createGoal(account, input, new Date(), tx);
        return { status: 201, body: created };
      },
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = isUuid(input.exerciseId)
      ? await account.db.goal.findFirst({
          where: { exerciseId: input.exerciseId, status: "active" },
          select: { id: true, exercise: { select: { name: true } } },
        })
      : null;
    if (!existing) throw error;
    throw new DomainError(
      "conflict",
      `${existing.exercise.name} already has an active goal. Archive it to set a different one.`,
      { existingGoalId: existing.id },
    );
  }
}

/**
 * E7 `GET /exercises/{exerciseId}/goal-form?gymId=`: the form's context — the
 * exercise, whether it is measured per gym, the active gyms, the gym to
 * preselect (the requested one while active, else the only one) — or why no
 * goal can be set (duplicate, no gyms, bodyweight, archived, not found).
 */
export function readGoalForm(
  account: Account,
  exerciseId: string,
  params: URLSearchParams,
) {
  const gymId = params.get("gymId");
  return getGoalFormContextView(
    account,
    exerciseId,
    gymId && gymId.length <= 64 ? gymId : null,
  );
}
