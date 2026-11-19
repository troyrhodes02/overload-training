import type { Account } from "@/lib/data/account";
import { lockWorkoutForUpdate } from "@/lib/data/locks";
import { createTestAccount, defaultAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { createGym } from "@/lib/gyms/gyms";
import { logSet } from "@/lib/logging/logged-sets";
import {
  changeGym,
  completeWorkout,
  editPlannedSets,
  setExerciseSkipped,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";

/**
 * OVE-220 (Pitch 21f review, finding 2): writes to one workout that check its
 * state and then depend on it are serialized by the workout's row lock.
 *
 * Each case holds one write's transaction OPEN, then sends the competing write
 * from a second connection. Before the lock, the second write read the first
 * one's uncommitted state ("no sets yet", "not skipped", "in progress") and
 * succeeded, leaving a set attached to an exercise, gym, or workout state it
 * was never performed in. With the lock, the second write waits for the first
 * to commit, then sees it and answers as if they had arrived one after the
 * other.
 */

let account: Account;
let today: string;
let sessionId: string;
let substituteId: string;
let gymId: string;
let otherGymId: string;

beforeEach(async () => {
  account = await defaultAccount();
  today = todayIso(account.timeZone);
  const start = addDays(today, -14);
  const exercise = await createTestExercise({ equipmentType: "barbell" });
  substituteId = (
    await createTestExercise({ equipmentType: "barbell", name: "Floor Press" })
  ).id;
  const meso = await createTestMesocycle({
    status: "active",
    startDate: new Date(`${start}T00:00:00.000Z`),
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
  });
  const session = await createTestSession(meso.id, {
    dayOfWeek: isoWeekday(start),
  });
  sessionId = session.id;
  await createTestSessionExercise(session.id, exercise.id, { plannedSets: 3 });
  gymId = (await createGym(account, { name: "Home" })).id;
  otherGymId = (await createGym(account, { name: "Away" })).id;
});

async function startToday() {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId,
    scheduledFor: today,
    gymId,
  });
  const le = await getTestPrisma().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
  return { loggedSessionId, le };
}

const firstSet = (loggedExerciseId: string) => ({
  loggedExerciseId,
  setNumber: 1,
  weightLbs: 135,
  reps: 8,
});

/** Is any connection to this test database waiting on a lock right now? */
async function someoneWaitsOnALock(): Promise<boolean> {
  const rows = await getTestPrisma().$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Run `first` inside a transaction that stays open while `second` is sent.
 * It is released as soon as `second` either settles (it didn't wait: no
 * serialization) or is SEEN waiting on a lock in Postgres (it did), or after
 * 10 s. Returns how `second` settled, whether it was seen waiting on a lock,
 * and whether it settled while `first` was still open.
 */
async function overlap(
  first: (
    tx: Parameters<Parameters<Account["db"]["$transaction"]>[0]>[0],
  ) => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  let ready!: () => void;
  const firstDone = new Promise<void>((r) => {
    ready = r;
  });
  const firstTx = account.db.$transaction(
    async (tx) => {
      try {
        await first(tx);
      } finally {
        // Even if `first` throws, so its error surfaces below.
        ready();
      }
      await held;
    },
    { timeout: 30_000 },
  );
  await firstDone;
  let settled = false;
  const outcome = second().then(
    () => {
      settled = true;
      return { ok: true as const };
    },
    (error: unknown) => {
      settled = true;
      return { ok: false as const, error };
    },
  );
  let waited = false;
  const deadline = Date.now() + 10_000;
  while (!settled && !waited && Date.now() < deadline) {
    waited = await someoneWaitsOnALock();
    if (!waited) await new Promise((r) => setTimeout(r, 25));
  }
  const settledWhileOpen = settled;
  release();
  await firstTx;
  return { ...(await outcome), waited, settledWhileOpen };
}

const code = (r: { ok: boolean; error?: unknown }) =>
  r.ok ? "ok" : (r.error as { code?: string }).code;

describe("OVE-220: one workout's writes run one after the other", () => {
  it("a swap sent while the first set is saving waits, then is refused; the set keeps its exercise", async () => {
    const { le } = await startToday();
    const r = await overlap(
      (tx) => logSet(account, firstSet(le.id), tx),
      () =>
        swapExercise(account, {
          loggedExerciseId: le.id,
          newExerciseId: substituteId,
        }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "invalid_state_transition",
    ]);
    const after = await getTestPrisma().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
      include: { sets: true },
    });
    expect(after.exerciseId).toBe(le.exerciseId);
    expect(after.sets.map((s) => s.setNumber)).toEqual([1]);
  });

  it("a first set sent while a swap is saving waits, then is stored against the substitute it was performed as", async () => {
    const { le } = await startToday();
    const r = await overlap(
      (tx) =>
        swapExercise(
          account,
          { loggedExerciseId: le.id, newExerciseId: substituteId },
          tx,
        ),
      () => logSet(account, firstSet(le.id)),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "ok",
    ]);
    const after = await getTestPrisma().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
      include: { sets: true },
    });
    expect([after.exerciseId, after.sets.length]).toEqual([substituteId, 1]);
  });

  it("a set sent while the exercise is being marked not done waits, then is refused", async () => {
    const { le } = await startToday();
    const r = await overlap(
      (tx) =>
        setExerciseSkipped(
          account,
          { loggedExerciseId: le.id, skipped: true },
          tx,
        ),
      () => logSet(account, firstSet(le.id)),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "invalid_state_transition",
    ]);
    expect(
      await getTestPrisma().loggedSet.count({
        where: { loggedExerciseId: le.id },
      }),
    ).toBe(0);
  });

  it("marking not done while the first set is saving waits, then is refused", async () => {
    const { le } = await startToday();
    const r = await overlap(
      (tx) => logSet(account, firstSet(le.id), tx),
      () =>
        setExerciseSkipped(account, { loggedExerciseId: le.id, skipped: true }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "invalid_state_transition",
    ]);
    const after = await getTestPrisma().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
    });
    expect(after.skippedAt).toBeNull();
  });

  it("a gym change while the first set is saving waits, then is refused; the set stays at its gym", async () => {
    const { loggedSessionId, le } = await startToday();
    const r = await overlap(
      (tx) => logSet(account, firstSet(le.id), tx),
      () => changeGym(account, { loggedSessionId, gymId: otherGymId }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "invalid_state_transition",
    ]);
    const after = await getTestPrisma().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
    });
    expect(after.gymId).toBe(gymId);
  });

  it("a set sent while the workout is being finished waits, then is refused", async () => {
    const { loggedSessionId, le } = await startToday();
    await logSet(account, firstSet(le.id));
    const r = await overlap(
      (tx) => completeWorkout(account, { loggedSessionId }, tx),
      () => logSet(account, { ...firstSet(le.id), setNumber: 2 }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "invalid_state_transition",
    ]);
    expect(
      await getTestPrisma().loggedSet.count({
        where: { loggedExerciseId: le.id },
      }),
    ).toBe(1);
  });

  it("a resume at another gym while the first set is saving waits, then leaves the gym alone", async () => {
    const { le } = await startToday();
    const r = await overlap(
      (tx) => logSet(account, firstSet(le.id), tx),
      () =>
        startOrResumeWorkout(account, {
          sessionId,
          scheduledFor: today,
          gymId: otherGymId,
        }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "ok",
    ]);
    const after = await getTestPrisma().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
    });
    expect(after.gymId).toBe(gymId);
  });

  it("lowering the planned sets while a set is saving waits for it", async () => {
    const { le } = await startToday();
    await logSet(account, firstSet(le.id));
    await logSet(account, { ...firstSet(le.id), setNumber: 2 });
    const r = await overlap(
      (tx) => logSet(account, { ...firstSet(le.id), setNumber: 3 }, tx),
      () =>
        editPlannedSets(account, { loggedExerciseId: le.id, plannedSets: 2 }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      true,
      false,
      "ok",
    ]);
    const after = await getTestPrisma().loggedExercise.findUniqueOrThrow({
      where: { id: le.id },
      include: { sets: true },
    });
    expect([after.plannedSets, after.sets.length]).toEqual([2, 3]);
  });

  it("two sets of one workout still both save (the lock only orders them)", async () => {
    const { le } = await startToday();
    const r = await overlap(
      (tx) => logSet(account, firstSet(le.id), tx),
      () => logSet(account, { ...firstSet(le.id), setNumber: 2 }),
    );
    expect(code(r)).toBe("ok");
    expect(
      await getTestPrisma().loggedSet.count({
        where: { loggedExerciseId: le.id },
      }),
    ).toBe(2);
  });

  it("another account's workout doesn't wait on this one's lock, and can't take it", async () => {
    const { loggedSessionId, le } = await startToday();
    const other = await createTestAccount();
    // Held by this account; the other account's lock call finds nothing and
    // returns at once instead of waiting.
    const r = await overlap(
      (tx) => logSet(account, firstSet(le.id), tx),
      () =>
        other.db.$transaction(async (tx) => {
          const bySession = await lockWorkoutForUpdate(other, tx, {
            loggedSessionId,
          });
          const byExercise = await lockWorkoutForUpdate(other, tx, {
            loggedExerciseId: le.id,
          });
          if (bySession || byExercise)
            throw new Error("locked another account's workout");
        }),
    );
    expect([r.waited, r.settledWhileOpen, code(r)]).toEqual([
      false,
      true,
      "ok",
    ]);
    // And the other account's swap of this exercise is not found, as before.
    await expect(
      swapExercise(other, {
        loggedExerciseId: le.id,
        newExerciseId: substituteId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("a malformed or unknown id takes no lock and the write answers not_found", async () => {
    await account.db.$transaction(async (tx) => {
      expect(
        await lockWorkoutForUpdate(account, tx, { loggedSessionId: "nope" }),
      ).toBe(false);
      expect(
        await lockWorkoutForUpdate(account, tx, {
          loggedExerciseId: "00000000-0000-4000-8000-000000000000",
        }),
      ).toBe(false);
    });
    await expect(
      logSet(account, firstSet("00000000-0000-4000-8000-000000000000")),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
