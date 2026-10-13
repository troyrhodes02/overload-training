import { prisma } from "@/lib/db";
import { mesocycleWeekForDate, toIsoDate } from "@/lib/plan/calendar";
import { loadScheduleContext } from "@/lib/logging/schedule-context";
import { oldestUnresolvedMissedDay } from "@/lib/logging/schedule";
import { getExerciseProgression } from "@/lib/progression/queries";
import { listActiveGoals, listGoalHistory } from "@/lib/goals/queries";
import { resetScenarioData } from "./reset";
import { writeScenarioFacts } from "./write";
import { findScenario, SCENARIOS } from "./registry";
import type { VerifyContext } from "./scenario";

/**
 * Seeds one scenario (dev tooling only). Reset + write run in ONE transaction,
 * so a failed build leaves the previous data in place. Verification then runs
 * through the application's own read layer against the committed data — the
 * same functions the pages render from — and fails the run if any intended
 * state does not derive.
 *
 * Callers must have passed the target guard (./guard.ts) first; the CLI does.
 */

export type ScenarioReport = {
  scenario: string;
  anchorIso: string;
  activeMesocycle: { name: string; week: number | null } | null;
  completedWorkouts: number;
  historyRange: { from: string; to: string } | null;
  gyms: { name: string; archived: boolean }[];
  activeGoals: { label: string; percent: number | null }[];
  derived: string[];
  failures: string[];
  removed: Record<string, number>;
  /** Supabase auth accounts on the target (null where there is no auth schema). */
  authAccounts: number | null;
};

async function authAccountCount(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      "SELECT count(*)::int AS n FROM auth.users",
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null; // a throwaway test database has no auth schema
  }
}

export async function seedScenario(
  key: string,
  anchorIso: string,
  opts: { verify?: boolean } = {},
): Promise<ScenarioReport> {
  const scenario = findScenario(key);
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${key}". Choose one of: ${SCENARIOS.map((s) => s.key).join(", ")}.`,
    );
  }
  const facts = scenario.build(anchorIso);
  const authBefore = await authAccountCount();

  const { removed, ids } = await prisma.$transaction(
    async (tx) => {
      const removed = await resetScenarioData(tx);
      const ids = await writeScenarioFacts(tx, facts, {
        scenario: scenario.key,
        anchorIso,
      });
      return { removed, ids };
    },
    { timeout: 180_000, maxWait: 30_000 },
  );

  const failures: string[] = [];
  const derived: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) failures.push(message);
  };

  const authAfter = await authAccountCount();
  check(authBefore === authAfter, "Seeding must not change the auth accounts");

  // Shared expectations: one active block, no stray missed day as of the anchor.
  const active = await prisma.mesocycle.findMany({
    where: { status: "active" },
    include: { sessions: true },
  });
  check(
    active.length === 1,
    `Expected one active mesocycle; found ${active.length}`,
  );
  const meso = active[0];
  if (meso?.startDate) {
    const ctx = await loadScheduleContext(prisma, {
      id: meso.id,
      startDate: meso.startDate,
      lengthWeeks: meso.lengthWeeks,
      sessions: meso.sessions,
    });
    const missed = oldestUnresolvedMissedDay(ctx, anchorIso);
    check(
      missed === null,
      `No missed-day prompt should be pending on ${anchorIso}; found ${missed?.sessionName} on ${missed?.authoredIso}`,
    );
  }

  if (opts.verify !== false) {
    const vctx: VerifyContext = {
      anchorIso,
      facts,
      ids,
      check,
      note: (line) => derived.push(line),
      progression: async (ex, gymKey) => {
        const p = await getExerciseProgression(
          ids.exercises[ex],
          gymKey ? ids.gyms[gymKey] : undefined,
        );
        if (!p) throw new Error(`No progression read for ${ex}`);
        return p;
      },
      baseline: async (ex, gymKey) => {
        const row = await prisma.gymExerciseBaseline.findUnique({
          where: {
            gymId_exerciseId: {
              gymId: ids.gyms[gymKey],
              exerciseId: ids.exercises[ex],
            },
          },
        });
        return row ? Number(row.weightLbs) : null;
      },
      activeGoals: () => listActiveGoals(),
      goalHistory: () => listGoalHistory(),
    };
    await scenario.verify(vctx);
  }

  const sessions = await prisma.loggedSession.findMany({
    where: { status: "complete" },
    select: { scheduledFor: true },
    orderBy: { scheduledFor: "asc" },
  });
  const gyms = await prisma.gym.findMany({ orderBy: { name: "asc" } });
  const goals = await listActiveGoals();

  return {
    scenario: scenario.key,
    anchorIso,
    activeMesocycle: meso
      ? {
          name: meso.name,
          week: meso.startDate
            ? mesocycleWeekForDate(toIsoDate(meso.startDate), anchorIso)
            : null,
        }
      : null,
    completedWorkouts: sessions.length,
    historyRange: sessions.length
      ? {
          from: toIsoDate(sessions[0].scheduledFor),
          to: toIsoDate(sessions[sessions.length - 1].scheduledFor),
        }
      : null,
    gyms: gyms.map((g) => ({ name: g.name, archived: g.deletedAt !== null })),
    activeGoals: goals.map((g) => ({
      label: `${g.exerciseName}${g.gymName ? ` @ ${g.gymName}` : ""} ${g.targetLabel}`,
      percent: g.percent,
    })),
    derived,
    failures,
    removed,
    authAccounts: authAfter,
  };
}
