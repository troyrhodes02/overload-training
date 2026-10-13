import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";
import { computeGoalProgress } from "./progress";
import { goalPerformances } from "./queries";
import { parseGoalInput, type RawGoalInput } from "./validation";

/**
 * The Goal write module (Goals spec §11b–§11c) — the ONLY place Goal rows are
 * written.
 *
 * Invariants:
 *  - Goals never write logged history, gym baselines, the plan, exercises, or
 *    gyms. They read logged history through Pitch 5's read layer only.
 *  - No delete. A goal leaves the active list only by archiving; an archived
 *    goal never returns to active (no reopen, no undo).
 *  - Completion is ONE engine (`reconcileGoalCompletions`): a conditional
 *    `active → archived/completed` update, so it happens at most once.
 *  - Reconciliation never runs inside a LoggedSet transaction; logging callers
 *    use `reconcileGoalCompletionsSafely` after their write has committed.
 */

type Db = Prisma.TransactionClient;

function db(tx?: Db): Db {
  return tx ?? prisma;
}

const NOT_FOUND = "That goal doesn't exist.";

/**
 * Complete every active goal (or just `goalIds`) whose best qualifying session
 * e1RM now meets its target e1RM. Returns the ids that transitioned in THIS
 * call. Idempotent: a goal transitions at most once and `archivedAt` is never
 * rewritten (the update is conditional on `status = active`).
 */
export async function reconcileGoalCompletions(
  opts: { goalIds?: string[]; now?: Date } = {},
  tx?: Db,
): Promise<string[]> {
  const goals = await db(tx).goal.findMany({
    where: {
      status: "active",
      ...(opts.goalIds ? { id: { in: opts.goalIds } } : {}),
    },
    include: { exercise: { select: { equipmentType: true } } },
  });

  // Measure every candidate first (independent reads, in parallel — this runs
  // after each logged set, so it must stay quick), then transition the reached
  // ones one by one. Scope comes from the shared rule in queries.ts.
  const measured = await Promise.all(
    goals.map(async (goal) => ({
      goal,
      progress: computeGoalProgress(
        {
          targetWeightLbs: Number(goal.targetWeightLbs),
          targetReps: goal.targetReps,
        },
        await goalPerformances(goal, tx),
      ),
    })),
  );

  const now = opts.now ?? new Date();
  const completed: string[] = [];
  for (const { goal, progress } of measured) {
    if (!progress.reached) continue;
    const { count } = await db(tx).goal.updateMany({
      where: { id: goal.id, status: "active" },
      data: { status: "archived", archiveReason: "completed", archivedAt: now },
    });
    if (count === 1) completed.push(goal.id);
  }
  return completed;
}

/**
 * Best-effort reconciliation for boundaries that must never fail because of a
 * goal: after a LoggedSet / workout write has committed, and before a goal
 * page renders. Errors are logged and swallowed (spec R30, R54).
 */
export async function reconcileGoalCompletionsSafely(): Promise<string[]> {
  try {
    return await reconcileGoalCompletions();
  } catch (error) {
    console.error("Goal completion reconciliation failed", error);
    return [];
  }
}

export type CreateGoalResult = { id: string; outcome: "active" | "completed" };

/**
 * Create a goal (spec §11c). Validates input, requires an active exercise and
 * — iff the exercise is gym-variable — an active gym, blocks a second active
 * goal on the exercise (never replaces it), inserts, then runs the completion
 * engine for the new goal in the same transaction: a goal existing history
 * already satisfies completes immediately with `archivedAt = createdAt`.
 */
export async function createGoal(
  raw: RawGoalInput,
  now: Date = new Date(),
): Promise<CreateGoalResult> {
  const parsed = parseGoalInput(raw);
  if (!parsed.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      parsed.details,
    );
  }
  const input = parsed.value;

  try {
    return await prisma.$transaction(async (tx) => {
      const exercise = isUuid(input.exerciseId)
        ? await tx.exercise.findUnique({
            where: { id: input.exerciseId },
            select: {
              id: true,
              name: true,
              equipmentType: true,
              deletedAt: true,
            },
          })
        : null;
      if (!exercise || exercise.deletedAt) {
        throw new DomainError(
          "validation_error",
          "Check the highlighted fields.",
          { exerciseId: "Pick an active exercise." },
        );
      }
      // Goal progress is e1RM from weight × reps; a bodyweight lift logs no
      // external weight, so there is nothing valid to measure it against.
      if (!requiresExternalWeight(exercise)) {
        throw new DomainError(
          "validation_error",
          "Check the highlighted fields.",
          {
            exerciseId:
              "Goals need an external weight. Bodyweight-only lifts can't have one.",
          },
        );
      }

      if (isGymVariable(exercise)) {
        if (!input.gymId) {
          throw new DomainError(
            "validation_error",
            "Check the highlighted fields.",
            { gymId: "Choose the gym this goal is measured at." },
          );
        }
        const gym = isUuid(input.gymId)
          ? await tx.gym.findUnique({
              where: { id: input.gymId },
              select: { deletedAt: true },
            })
          : null;
        if (!gym) {
          throw new DomainError(
            "validation_error",
            "Check the highlighted fields.",
            { gymId: "Choose the gym this goal is measured at." },
          );
        }
        if (gym.deletedAt) {
          throw new DomainError(
            "validation_error",
            "Check the highlighted fields.",
            { gymId: "That gym is archived. Choose an active gym." },
          );
        }
      } else if (input.gymId) {
        throw new DomainError(
          "validation_error",
          "Check the highlighted fields.",
          { gymId: "This lift isn't measured per gym." },
        );
      }

      const existing = await tx.goal.findFirst({
        where: { exerciseId: exercise.id, status: "active" },
        select: { id: true },
      });
      if (existing) throw duplicate(exercise.name, existing.id);

      const goal = await tx.goal.create({
        data: {
          exerciseId: exercise.id,
          gymId: isGymVariable(exercise) ? input.gymId : null,
          targetWeightLbs: new Prisma.Decimal(input.targetWeightLbs),
          targetReps: input.targetReps,
          createdAt: now,
        },
        select: { id: true },
      });

      // Same transaction AND same `now`: an already-reached goal lands with
      // archivedAt === createdAt, which is how the read layer recognizes
      // "Already reached" (R57). Keep the shared timestamp if this changes.
      const completed = await reconcileGoalCompletions(
        { goalIds: [goal.id], now },
        tx,
      );
      return {
        id: goal.id,
        outcome: completed.includes(goal.id) ? "completed" : "active",
      };
    });
  } catch (error) {
    // A concurrent create racing past the pre-check hits the partial unique
    // index goals_one_active_per_exercise: same answer, never a replacement.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.goal.findFirst({
        where: { exerciseId: input.exerciseId, status: "active" },
        select: { id: true, exercise: { select: { name: true } } },
      });
      throw duplicate(existing?.exercise.name ?? "This lift", existing?.id);
    }
    throw error;
  }
}

function duplicate(exerciseName: string, existingGoalId?: string) {
  return new DomainError(
    "conflict",
    `${exerciseName} already has an active goal. Archive it to set a different one.`,
    existingGoalId ? { existingGoalId } : undefined,
  );
}

/** Manually retire an active goal (R9). No undo; the record is kept. */
export async function archiveGoal(
  input: { goalId: string },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const { count } = isUuid(input.goalId)
    ? await prisma.goal.updateMany({
        where: { id: input.goalId, status: "active" },
        data: { status: "archived", archiveReason: "manual", archivedAt: now },
      })
    : { count: 0 };
  if (count === 1) return { id: input.goalId };
  const exists = isUuid(input.goalId)
    ? await prisma.goal.findUnique({
        where: { id: input.goalId },
        select: { id: true },
      })
    : null;
  if (!exists) throw new DomainError("not_found", NOT_FOUND);
  throw new DomainError(
    "invalid_state_transition",
    "This goal is already in your goal history.",
  );
}

/**
 * Record that the one-time "Goal reached" card was seen (R34, R58). Idempotent:
 * an already-acknowledged completion succeeds without changing its timestamp.
 */
export async function acknowledgeGoalCompletion(
  input: { goalId: string },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const goal = isUuid(input.goalId)
    ? await prisma.goal.findUnique({
        where: { id: input.goalId },
        select: { archiveReason: true, completionAcknowledgedAt: true },
      })
    : null;
  if (!goal) throw new DomainError("not_found", NOT_FOUND);
  if (goal.archiveReason !== "completed") {
    throw new DomainError(
      "invalid_state_transition",
      "Only a reached goal can be acknowledged.",
    );
  }
  if (!goal.completionAcknowledgedAt) {
    await prisma.goal.updateMany({
      where: {
        id: input.goalId,
        archiveReason: "completed",
        completionAcknowledgedAt: null,
      },
      data: { completionAcknowledgedAt: now },
    });
  }
  return { id: input.goalId };
}
