/**
 * Pitch 21c (spec §9–§10): the shared views and the logging workflows, against
 * a real database.
 *
 * - getTodayView composes exactly what the Today page used to compose from the
 *   individual reads (parity), in every dashboard state the fixture can reach.
 * - Pro calls are withheld from a Free account (`locked`, null Pro fields).
 * - getWorkoutView equals the old per-card loop.
 * - getMeView applies the layout's one-dialog precedence and never offers a
 *   purchase.
 * - The workflows reconcile goals AFTER the write, and not at all when the
 *   write fails.
 * - Nothing here crosses accounts.
 */
import type { Account } from "@/lib/data/account";
import { getTodayView, DASHBOARD_GOAL_LIMIT } from "@/lib/views/today";
import { getWorkoutView } from "@/lib/views/workout";
import { getMeView } from "@/lib/views/me";
import { getTodayDashboard, getWorkout } from "@/lib/logging/queries";
import {
  getOccurrenceProgression,
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import {
  countActiveGoals,
  getSessionGoalSummary,
  listActiveGoals,
  listUnacknowledgedCompletions,
} from "@/lib/goals/queries";
import { getGreetingFacts } from "@/lib/personalization/greeting-facts";
import { composeGreeting } from "@/lib/personalization/greeting";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { createGoal } from "@/lib/goals/goals";
import { resolveRequestEntitlement } from "@/lib/entitlements/resolve";
import {
  completeWorkoutAndReconcile,
  editLoggedSetAndReconcile,
  logSetAndReconcile,
} from "@/lib/logging/workflows";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { addDays } from "@overload/shared/plan/calendar";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  activePlan,
  library,
  startToday,
  today,
  type Lib,
} from "./isolation/fixtures";

/** Resolve the fixture's one past occurrence so today is a plain pending day. */
async function clearMissedDays(account: Account) {
  const dash = await getTodayDashboard(account);
  if (dash.kind === "missed_day") {
    await resolveMissedDay(account, {
      mesocycleId: dash.missed.mesocycleId,
      missedOn: dash.missed.missedOn,
      outcome: "skipped",
    });
    return clearMissedDays(account);
  }
}

/** Log every planned working set of every exercise in today's workout. */
async function logEverything(
  account: Account,
  les: { id: string; plannedSets: number }[],
  weight: number,
  reps: number,
) {
  for (const le of les) {
    for (let n = 1; n <= le.plannedSets; n++) {
      await logSetAndReconcile(account, {
        loggedExerciseId: le.id,
        setNumber: n,
        weightLbs: weight,
        reps,
      });
    }
  }
}

/**
 * "Log it late": a past occurrence `weeksAgo` weeks back, every planned set at
 * the given load, finished — real history, and that missed day resolved.
 */
async function logWeeksAgo(
  account: Account,
  plan: Awaited<ReturnType<typeof activePlan>>,
  weeksAgo: number,
  weight: number,
  reps: number,
) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: plan.session.id,
    scheduledFor: addDays(today(), -7 * weeksAgo),
    gymId: plan.gym.id,
  });
  const les = await getTestPrisma().loggedExercise.findMany({
    where: { loggedSessionId },
  });
  await logEverything(account, les, weight, reps);
  await completeWorkoutAndReconcile(account, { loggedSessionId });
  return { loggedSessionId, les };
}

/** A block started two weeks ago with both past weeks logged: enough history for calls. */
async function planWithHistory(account: Account, label: string) {
  const plan = await activePlan(account, lib, label, { startWeeksAgo: 2 });
  await logWeeksAgo(account, plan, 2, 135, 5);
  await logWeeksAgo(account, plan, 1, 135, 5);
  return plan;
}

/** The fixture's one past week (a week ago), logged at the given load. */
const logLastWeek = (
  account: Account,
  plan: Awaited<ReturnType<typeof activePlan>>,
  weight: number,
  reps: number,
) => logWeeksAgo(account, plan, 1, weight, reps);

let lib: Lib;
beforeEach(async () => {
  lib = await library();
});

describe("getTodayView", () => {
  it("no plan: the goals block shows, nothing to call", async () => {
    const a = await createTestAccount();
    const view = await getTodayView(a);
    expect(view.dashboard).toEqual({ kind: "no_plan" });
    expect(view.today).toBe(today());
    expect(view.plannedProgression).toEqual([]);
    expect(view.sessionSummary).toBeNull();
    expect(view.sessionGoals).toEqual([]);
    expect(view.goals).toEqual({ reached: [], active: [], activeTotal: 0 });
  });

  it("missed day: the dimmed day below still gets its calls, and no goals show", async () => {
    const a = await createTestAccount();
    await activePlan(a, lib, "A");
    const view = await getTodayView(a);
    // The fixture's block started a week ago on today's weekday: that first
    // occurrence was never logged.
    expect(view.dashboard.kind).toBe("missed_day");
    if (view.dashboard.kind !== "missed_day") return;
    const below = view.dashboard.below!;
    expect(below.kind).toBe("pending");
    expect(view.plannedProgression.map((p) => p.exerciseId)).toEqual(
      below.exercises.map((e) => e.exerciseId),
    );
    expect(view.goals).toBeNull();
  });

  it("pending: the same dashboard, greeting, and per-exercise calls the page composed", async () => {
    const a = await createTestAccount();
    await planWithHistory(a, "A");
    const now = new Date();
    const view = await getTodayView(a, { now });

    const dash = await getTodayDashboard(a);
    expect(view.dashboard).toEqual(dash);
    expect(dash.kind).toBe("pending");
    if (dash.kind !== "pending") return;

    const facts = await getGreetingFacts(a, now);
    expect(view.greeting).toBe(
      composeGreeting({
        dashboard: dash,
        firstName: facts.firstName,
        timeZone: facts.timeZoneValid ? a.timeZone : null,
        firstVisit: facts.firstVisit,
        accountKey: a.userId,
        now,
      }),
    );

    const expected = await Promise.all(
      dash.exercises.map(async (e) => ({
        exerciseId: e.exerciseId,
        progression: await getPlannedProgression(a, e.exerciseId, {
          scheduledDeloadWeek: dash.scheduledDeloadWeek,
        }),
      })),
    );
    expect(view.plannedProgression).toEqual(expected);
    expect(view.plannedProgression).toHaveLength(2);
    for (const p of view.plannedProgression)
      expect(p.progression.locked).toBeNull();
    // Real history: the free-weight bench carries a Pro call for this account.
    const bench = view.plannedProgression.find(
      (p) => p.exerciseId === lib.bench.id,
    )!;
    expect(bench.progression.recommendation).not.toBeNull();
    expect(view.goals).toBeNull();
    expect(view.sessionSummary).toBeNull();
  });

  it("a Free account gets every planned call locked with its Pro fields withheld", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await planWithHistory(free, "F");
    const view = await getTodayView(free);
    expect(view.dashboard.kind).toBe("pending");
    expect(view.plannedProgression.length).toBeGreaterThan(0);
    for (const { progression } of view.plannedProgression) {
      expect(progression.locked).toBe("progression_insights");
      expect(progression.tag).toBeNull();
      expect(progression.suggestion).toBeNull();
      expect(progression.recommendation).toBeNull();
    }
  });

  it("complete: summary, the goal rows the workout moved, and the goals block — reconciled first", async () => {
    const a = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    await clearMissedDays(a);
    // A goal the workout will reach (bench 135 × 5 → target 100 × 5).
    const goal = await createGoal(a, {
      exerciseId: lib.bench.id,
      gymId: null,
      targetWeightLbs: "100",
      targetReps: "5",
    });
    const { loggedSessionId, les } = await startToday(a, plan);
    await logEverything(a, les, 135, 5);
    await completeWorkoutAndReconcile(a, { loggedSessionId });

    const view = await getTodayView(a);
    expect(view.dashboard.kind).toBe("complete");
    expect(view.sessionSummary).toEqual(
      await getSessionProgressionSummary(a, loggedSessionId),
    );
    expect(view.sessionGoals).toEqual(
      await getSessionGoalSummary(a, loggedSessionId),
    );
    expect(view.sessionGoals.some((r) => r.goalId === goal.id)).toBe(true);
    expect(view.goals).toEqual({
      reached: await listUnacknowledgedCompletions(a),
      active: await listActiveGoals(a, { take: DASHBOARD_GOAL_LIMIT }),
      activeTotal: await countActiveGoals(a),
    });
    expect(view.goals!.reached.map((r) => r.goalId)).toContain(goal.id);
  });

  it("is JSON-safe: the body crosses the wire unchanged", async () => {
    const a = await createTestAccount();
    await activePlan(a, lib, "A");
    const view = await getTodayView(a);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("dates are the account's own calendar date", async () => {
    // Pacific/Kiritimati is UTC+14: its "today" is usually a day ahead of UTC.
    const a = await createTestAccount("Pacific/Kiritimati");
    const view = await getTodayView(a);
    expect(view.today).toBe(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Pacific/Kiritimati",
      }).format(new Date()),
    );
  });

  it("never shows another account's plan, calls, or goals", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await activePlan(a, lib, "A");
    await createGoal(a, {
      exerciseId: lib.bench.id,
      gymId: null,
      targetWeightLbs: "315",
      targetReps: "1",
    });
    const view = await getTodayView(b);
    expect(view.dashboard).toEqual({ kind: "no_plan" });
    expect(view.goals).toEqual({ reached: [], active: [], activeTotal: 0 });
    expect(JSON.stringify(view)).not.toContain("A Push");
  });
});

describe("getWorkoutView", () => {
  it("equals the old per-card loop, with the entitlement resolved once", async () => {
    const a = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    await clearMissedDays(a);
    const { loggedSessionId } = await startToday(a, plan);
    const view = await getWorkoutView(a, loggedSessionId);
    const workout = await getWorkout(a, loggedSessionId);
    expect(view!.workout).toEqual(workout);
    const expected = await Promise.all(
      workout!.exercises.map(async (e) => ({
        loggedExerciseId: e.loggedExerciseId,
        progression: (await getOccurrenceProgression(a, e.loggedExerciseId))!,
      })),
    );
    expect(view!.progression).toEqual(expected);
  });

  it("a Free account's cards are locked", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const plan = await planWithHistory(free, "F");
    const { loggedSessionId } = await startToday(free, plan);
    const view = await getWorkoutView(free, loggedSessionId);
    expect(view!.progression.length).toBeGreaterThan(0);
    for (const { progression } of view!.progression) {
      expect(progression.locked).toBe("progression_insights");
      expect(progression.tag).toBeNull();
      expect(progression.recommendation).toBeNull();
    }
  });

  it("another account's workout, or a malformed id, is null", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    await clearMissedDays(a);
    const { loggedSessionId } = await startToday(a, plan);
    expect(await getWorkoutView(b, loggedSessionId)).toBeNull();
    expect(await getWorkoutView(a, "not-a-uuid")).toBeNull();
  });
});

describe("request entitlements are bound to their own account", () => {
  it("a Pro request entitlement handed to a Free account's reader is ignored", async () => {
    const pro = await createTestAccount();
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await planWithHistory(free, "F");
    const proEntitlement = await resolveRequestEntitlement(pro);
    const view = await getTodayView(free);
    for (const { exerciseId } of view.plannedProgression) {
      const p = await getPlannedProgression(free, exerciseId, {
        scheduledDeloadWeek: false,
        entitlement: proEntitlement,
      });
      expect(p.recommendation).toBeNull();
      expect(p.tag).toBeNull();
    }
    expect(
      view.plannedProgression.some(
        (p) => p.progression.locked === "progression_insights",
      ),
    ).toBe(true);
  });
});

describe("getWorkoutView for a finished workout", () => {
  it("skips the cards' calls when asked (the page redirects it)", async () => {
    const a = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    const { loggedSessionId } = await logLastWeek(a, plan, 135, 5);
    const skipped = await getWorkoutView(a, loggedSessionId, {
      skipProgressionWhenComplete: true,
    });
    expect(skipped!.workout.status).toBe("complete");
    expect(skipped!.progression).toEqual([]);
    const full = await getWorkoutView(a, loggedSessionId);
    expect(full!.progression.length).toBeGreaterThan(0);
  });
});

describe("getMeView", () => {
  it("is the acting account's profile, verification, and resolved plan", async () => {
    const a = await createTestAccount("America/Chicago");
    await getTestPrisma().profile.update({
      where: { userId: a.userId },
      data: { firstName: "Ana", lastName: "Lift", username: "analift" },
    });
    const me = await getMeView(a, "ana@example.test");
    expect(me.profile).toEqual({
      firstName: "Ana",
      lastName: "Lift",
      username: "analift",
      timeZone: "America/Chicago",
    });
    expect(me.email).toBe("ana@example.test");
    expect(me.emailVerified).toBe(false);
    expect(me.entitlement.plan).toBe("pro");
    expect(me.entitlement.capabilities).toEqual(
      [...me.entitlement.capabilities].sort(),
    );
    expect(me.entitlement.capabilities).toContain("progression_insights");
    expect(JSON.parse(JSON.stringify(me))).toEqual(me);
  });

  it("a Free account's plan grants no capability", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const me = await getMeView(free, "f@example.test");
    expect(me.entitlement).toMatchObject({
      plan: "free",
      capabilities: [],
      displayState: "free",
    });
  });

  it("a due tour comes first: no trial notice and no What's New with it", async () => {
    const a = await createTestAccount();
    await getTestPrisma().tourProgress.create({ data: { userId: a.userId } });
    const me = await getMeView(a, "a@example.test");
    expect(me.tour).toEqual({ autoStart: true });
    expect(me.trialNotice).toBeNull();
    expect(me.whatsNew).toBeNull();
  });

  it("a trial that has ended carries its notice, never purchasable", async () => {
    const a = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const started = new Date(Date.now() - 20 * 86_400_000);
    await getTestPrisma().entitlement.create({
      data: {
        userId: a.userId,
        source: "trial",
        plan: "pro",
        startedAt: started,
        endsAt: new Date(Date.now() - 6 * 86_400_000),
      },
    });
    const me = await getMeView(a, "a@example.test");
    expect(me.trialNotice).toMatchObject({
      phase: "ended",
      purchasable: false,
    });
  });
});

describe("logging workflows reconcile after the write", () => {
  it("correcting a past set so it meets a goal completes the goal", async () => {
    const a = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    const { les } = await logLastWeek(a, plan, 95, 5);
    const goal = await createGoal(a, {
      exerciseId: lib.bench.id,
      gymId: null,
      targetWeightLbs: "100",
      targetReps: "5",
    });
    const bench = les.find((le) => le.exerciseId === lib.bench.id)!;
    const set = await getTestPrisma().loggedSet.findFirstOrThrow({
      where: { loggedExerciseId: bench.id, setNumber: 1 },
    });
    expect(
      (await getTestPrisma().goal.findUniqueOrThrow({ where: { id: goal.id } }))
        .status,
    ).toBe("active");
    await editLoggedSetAndReconcile(a, {
      loggedSetId: set.id,
      weightLbs: 135,
      reps: 5,
    });
    const row = await getTestPrisma().goal.findUniqueOrThrow({
      where: { id: goal.id },
    });
    expect(row).toMatchObject({
      status: "archived",
      archiveReason: "completed",
    });
  });

  it("a write that fails reconciles nothing", async () => {
    const a = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    await logLastWeek(a, plan, 135, 5);
    // An active goal the finished history already meets, written directly so
    // nothing has reconciled it (createGoal would complete it on creation).
    const goal = await getTestPrisma().goal.create({
      data: {
        userId: a.userId,
        exerciseId: lib.bench.id,
        targetWeightLbs: 100,
        targetReps: 5,
        status: "active",
      },
    });
    const { les } = await startToday(a, plan);
    await expect(
      logSetAndReconcile(a, {
        loggedExerciseId: les[0].id,
        setNumber: 99,
        weightLbs: 500,
        reps: 5,
      }),
    ).rejects.toThrow();
    const row = await getTestPrisma().goal.findUniqueOrThrow({
      where: { id: goal.id },
    });
    expect(row.status).toBe("active");
  });

  it("finishing a workout that meets a goal completes it", async () => {
    const a = await createTestAccount();
    const plan = await activePlan(a, lib, "A");
    await clearMissedDays(a);
    const { loggedSessionId, les } = await startToday(a, plan);
    await logEverything(a, les, 135, 5);
    // Active goal written directly after the sets: logging an in-progress
    // workout doesn't qualify yet; finishing it does.
    const goal = await getTestPrisma().goal.create({
      data: {
        userId: a.userId,
        exerciseId: lib.bench.id,
        targetWeightLbs: 100,
        targetReps: 5,
        status: "active",
      },
    });
    await completeWorkoutAndReconcile(a, { loggedSessionId });
    const row = await getTestPrisma().goal.findUniqueOrThrow({
      where: { id: goal.id },
    });
    expect(row.status).toBe("archived");
  });
});
