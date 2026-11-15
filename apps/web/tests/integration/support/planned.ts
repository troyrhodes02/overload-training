import type { Account } from "@/lib/data/account";
import type { PlannedOccurrence } from "@/lib/progression/queries";
import { getTestPrisma } from "./db";

/**
 * The planned occurrence Today asks about for an exercise (Prescription-Aware
 * Intelligence RD-11): the account's session that plans it — the active
 * block's first, else the newest — not yet started.
 *
 * Older suites seed logged history directly with no session (something the
 * app never writes: every started workout belongs to a planned session). When
 * no session plans the exercise yet, this models the real shape — that history
 * was logged in one planned workout — by creating that session in the block of
 * the exercise's latest logged workout and linking the exercise's session-less
 * workouts to it. Test database only.
 */
export async function plannedOccurrence(
  account: Account,
  exerciseId: string,
  loggedSessionId: string | null = null,
): Promise<PlannedOccurrence> {
  const db = getTestPrisma();
  const planned =
    (await db.sessionExercise.findFirst({
      where: {
        userId: account.userId,
        exerciseId,
        session: { mesocycle: { status: "active" } },
      },
      orderBy: { createdAt: "asc" },
    })) ??
    (await db.sessionExercise.findFirst({
      where: { userId: account.userId, exerciseId },
      orderBy: { createdAt: "desc" },
    }));
  if (planned) {
    return { exerciseId, sessionId: planned.sessionId, loggedSessionId };
  }

  const latest = await db.loggedExercise.findFirst({
    where: { userId: account.userId, exerciseId },
    orderBy: [
      { loggedSession: { scheduledFor: "desc" } },
      { createdAt: "desc" },
    ],
    include: { loggedSession: { select: { mesocycleId: true } } },
  });
  if (!latest?.loggedSession.mesocycleId) {
    // Nothing logged and nothing planned: an id that resolves to no session.
    return {
      exerciseId,
      sessionId: "00000000-0000-4000-8000-000000000000",
      loggedSessionId,
    };
  }
  const mesocycleId = latest.loggedSession.mesocycleId;
  const session = await db.session.create({
    data: {
      userId: account.userId,
      mesocycleId,
      name: "Planned workout",
      dayOfWeek: null,
      position: 99,
    },
  });
  await db.sessionExercise.create({
    data: {
      userId: account.userId,
      sessionId: session.id,
      exerciseId,
      plannedSets: latest.plannedSets,
      targetRepMin: latest.targetRepMin,
      targetRepMax: latest.targetRepMax,
    },
  });
  await db.loggedSession.updateMany({
    where: {
      userId: account.userId,
      mesocycleId,
      sessionId: null,
      loggedExercises: { some: { exerciseId } },
    },
    data: { sessionId: session.id },
  });
  return { exerciseId, sessionId: session.id, loggedSessionId };
}
