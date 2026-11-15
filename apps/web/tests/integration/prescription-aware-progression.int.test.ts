import type { Account } from "@/lib/data/account";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import {
  getOccurrenceProgression,
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { createTestAccount, defaultAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  logWorkout,
  SAT,
  SAT_DELOAD,
  twoWorkoutBlock,
  WED,
  WED_DELOAD,
} from "./support/recurring-fixtures";

/**
 * Prescription-Aware Intelligence — progression on every surface (spec
 * §7.3–§7.5; scenarios C, G, I, J; RD-10..RD-12). Each recurring workout is
 * judged on its own comparable run by the unchanged engine; the card, the
 * finish summary, Today's planned list, and the exercise page agree; the
 * numbers come from the judged run; Free gets none of it.
 */
let account: Account;
const db = () => getTestPrisma();

beforeEach(async () => {
  account = await defaultAccount();
});

type Block = Awaited<ReturnType<typeof twoWorkoutBlock>>;

const TOP_SAT: [number, number][] = [
  [255, 5],
  [255, 5],
  [255, 5],
];
const SHORT_WED: [number, number][] = [
  [230, 8],
  [230, 7],
  [230, 7],
];
const TOP_WED: [number, number][] = [
  [230, 8],
  [230, 8],
  [230, 8],
];

function logger(acct: Account, b: Block) {
  return (sessionId: string, date: string, sets: [number, number][]) =>
    logWorkout(acct, {
      sessionId,
      date,
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets,
    });
}

async function start(acct: Account, b: Block, sessionId: string, date: string) {
  const { loggedSessionId } = await startOrResumeWorkout(acct, {
    sessionId,
    scheduledFor: date,
    gymId: b.gym.id,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId, exerciseId: b.exercise.id },
  });
  return { loggedSessionId, loggedExerciseId: le.id };
}

const occ = async (acct: Account, leId: string) =>
  (await getOccurrenceProgression(acct, leId))!;

/** Saturday hits the top twice; Wednesday falls short twice. */
async function divergent(acct: Account) {
  const b = await twoWorkoutBlock(acct);
  const log = logger(acct, b);
  await log(b.upper.id, WED[0], SHORT_WED);
  await log(b.push.id, SAT[0], TOP_SAT);
  await log(b.upper.id, WED[1], SHORT_WED);
  await log(b.push.id, SAT[1], TOP_SAT);
  return { b, log };
}

describe("Scenario C — independent calls, one voice per workout", () => {
  it("Saturday progresses from 255; Wednesday holds at 230 the same week", async () => {
    const { b } = await divergent(account);
    const wed = await start(account, b, b.upper.id, WED[2]);
    const sat = await start(account, b, b.push.id, SAT[2]);

    const satCall = await occ(account, sat.loggedExerciseId);
    expect(satCall.tag).toBe("progress");
    expect(satCall.suggestion).toEqual({
      lbs: 260,
      kind: "progress_increment",
    });

    const wedCall = await occ(account, wed.loggedExerciseId);
    expect(wedCall.tag).toBeNull();
    expect(wedCall.suggestion).toBeNull();
    // Wednesday's number is Wednesday's own weight, never Saturday's.
    expect(JSON.stringify(wedCall.recommendation)).toContain("230");
    expect(JSON.stringify(wedCall.recommendation)).not.toMatch(/255|260/);
  });

  it("the card, the planned list, the summary, and the exercise page agree", async () => {
    const { b } = await divergent(account);
    const sat = await start(account, b, b.push.id, SAT[2]);
    const card = await occ(account, sat.loggedExerciseId);
    const today = await getPlannedProgression(
      account,
      {
        exerciseId: b.exercise.id,
        sessionId: b.push.id,
        loggedSessionId: sat.loggedSessionId,
      },
      { scheduledDeloadWeek: false },
    );
    expect(today.tag).toBe(card.tag);
    expect(today.suggestion).toEqual(card.suggestion);
    expect(today.recommendation?.action).toBe(card.recommendation?.action);

    // Before the workout starts, the plan's range gives the same call.
    const pending = await getPlannedProgression(
      account,
      {
        exerciseId: b.exercise.id,
        sessionId: b.upper.id,
        loggedSessionId: null,
      },
      { scheduledDeloadWeek: false },
    );
    expect(pending.tag).toBeNull();
    expect(pending.suggestion).toBeNull();

    // The finish summary of the last Saturday says what its card said.
    const lastSat = await db().loggedSession.findFirstOrThrow({
      where: { sessionId: b.push.id, scheduledFor: new Date(SAT[1]) },
    });
    const summary = (await getSessionProgressionSummary(account, lastSat.id))!;
    expect(summary.exercises[0].tag).toBe("progress");
    expect(summary.exercises[0].suggestion?.lbs).toBe(260);

    // The exercise page: one line per workout, no exercise-wide call.
    const page = (await getExerciseHistory(account, b.exercise.id))!;
    expect(page.next).toBeNull();
    expect(
      page.nextByWorkout.map((w) => [
        w.sessionName,
        w.repRange,
        w.next.kind === "call" ? w.next.tag : "no_gym",
      ]),
    ).toEqual([
      ["Push", { min: 3, max: 5 }, "progress"],
      ["Upper", { min: 6, max: 8 }, null],
    ]);
    // Session rows name their workout; each call used its own run.
    const byDate = Object.fromEntries(
      page.sessions.rows.map((r) => [r.dateIso, r]),
    );
    expect(byDate[SAT[1]].sessionName).toBe("Push");
    expect(byDate[SAT[1]].call).toBe("progress");
    expect(byDate[WED[1]].sessionName).toBe("Upper");
    expect(byDate[WED[1]].call).toBe("hold");
  });

  it("Free sees neither workout's call — on the card, the planned list, or the exercise page", async () => {
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const { b } = await divergent(free);
    const sat = await start(free, b, b.push.id, SAT[2]);
    const card = await occ(free, sat.loggedExerciseId);
    expect(card.tag).toBeNull();
    expect(card.suggestion).toBeNull();
    expect(card.recommendation).toBeNull();
    expect(card.locked).toBe("progression_insights");

    const today = await getPlannedProgression(
      free,
      {
        exerciseId: b.exercise.id,
        sessionId: b.push.id,
        loggedSessionId: sat.loggedSessionId,
      },
      { scheduledDeloadWeek: false },
    );
    expect(today.tag).toBeNull();
    expect(today.suggestion).toBeNull();
    expect(today.locked).toBe("progression_insights");

    const page = (await getExerciseHistory(free, b.exercise.id))!;
    for (const w of page.nextByWorkout) {
      expect(w.next).toMatchObject({ tag: null, recommendation: null });
    }
    expect(page.locked).toBe("progression_insights");
  });
});

describe("Scenario G — a changed and then restored rep range starts over", () => {
  it("8–10 starts a new run; returning to 6–8 never resurrects the old streak", async () => {
    const b = await twoWorkoutBlock(account);
    const log = logger(account, b);
    await log(b.upper.id, WED[0], TOP_WED);
    await log(b.upper.id, WED[1], TOP_WED);
    const progress = await start(account, b, b.upper.id, WED[2]);
    expect((await occ(account, progress.loggedExerciseId)).tag).toBe(
      "progress",
    );
    // That started (empty) occurrence keeps its copied 6–8 (RD-13); the
    // plan change below applies to the next week's workout.
    const slot = await db().sessionExercise.findFirstOrThrow({
      where: { sessionId: b.upper.id },
    });
    await db().sessionExercise.update({
      where: { id: slot.id },
      data: { targetRepMin: 8, targetRepMax: 10 },
    });
    await log(b.upper.id, WED[3], [
      [205, 10],
      [205, 10],
      [205, 10],
    ]);
    const after = await db().loggedExercise.findFirstOrThrow({
      where: {
        exerciseId: b.exercise.id,
        loggedSession: { scheduledFor: new Date(WED[3]) },
      },
    });
    // One 8–10 workout: not enough history — never "progress" from the 6–8
    // run, and never a falling-e1RM "stalled" across the change.
    const changed = await occ(account, after.id);
    expect(changed.tag).toBeNull();
    expect(changed.recommendation).toBeNull();

    // Back to 6–8: the exercise page's Upper line starts from nothing again.
    await db().sessionExercise.update({
      where: { id: slot.id },
      data: { targetRepMin: 6, targetRepMax: 8 },
    });
    const page = (await getExerciseHistory(account, b.exercise.id))!;
    const upper = page.nextByWorkout.find((w) => w.sessionName === "Upper")!;
    expect(upper.repRange).toEqual({ min: 6, max: 8 });
    expect(upper.next).toMatchObject({ tag: null, recommendation: null });
    expect(
      upper.next.kind === "call" ? upper.next.insufficientNote : null,
    ).toMatch(/Not enough history yet/);
  });
});

describe("Scenario I — scheduled deload per recurring workout", () => {
  it("each workout's 90% comes from its own last normal week, and never compounds", async () => {
    const b = await twoWorkoutBlock(account);
    const log = logger(account, b);
    for (let i = 0; i < 4; i++) {
      await log(b.upper.id, WED[i], TOP_WED);
      await log(b.push.id, SAT[i], TOP_SAT);
    }
    const wed = await start(account, b, b.upper.id, WED_DELOAD);
    const wedCall = await occ(account, wed.loggedExerciseId);
    expect(wedCall.scheduledDeloadWeek).toBe(true);
    expect(wedCall.tag).toBeNull(); // reactive suppressed
    expect(wedCall.suggestion).toEqual({ lbs: 205, kind: "scheduled_deload" }); // 230 × 0.9 = 207 → 205

    // Log the deload week lighter; Saturday's deload still reads Saturday's
    // normal 255 (229.5 → 225), and Wednesday's base is still its normal 230.
    await log(b.upper.id, WED_DELOAD, [
      [205, 8],
      [205, 8],
      [205, 8],
    ]);
    const sat = await start(account, b, b.push.id, SAT_DELOAD);
    expect((await occ(account, sat.loggedExerciseId)).suggestion).toEqual({
      lbs: 225,
      kind: "scheduled_deload",
    });
    const wedAgain = await getPlannedProgression(
      account,
      {
        exerciseId: b.exercise.id,
        sessionId: b.upper.id,
        loggedSessionId: null,
      },
      { scheduledDeloadWeek: true },
    );
    expect(wedAgain.suggestion).toEqual({ lbs: 205, kind: "scheduled_deload" });
  });
});

describe("Scenario J — a corrected past set recomputes on read", () => {
  it("correcting Saturday's set turns its progress into a hold; Wednesday and lineage are untouched", async () => {
    const { b } = await divergent(account);
    const sat = await start(account, b, b.push.id, SAT[2]);
    const wed = await start(account, b, b.upper.id, WED[2]);
    expect((await occ(account, sat.loggedExerciseId)).tag).toBe("progress");
    const wedBefore = await occ(account, wed.loggedExerciseId);

    const lastSatSet = await db().loggedSet.findFirstOrThrow({
      where: {
        setNumber: 3,
        loggedExercise: {
          exerciseId: b.exercise.id,
          loggedSession: { scheduledFor: new Date(SAT[1]) },
        },
      },
    });
    const lineageBefore = (
      await db().session.findUniqueOrThrow({ where: { id: b.push.id } })
    ).lineageId;
    await editLoggedSet(account, {
      loggedSetId: lastSatSet.id,
      weightLbs: 255,
      reps: 4,
    });

    expect((await occ(account, sat.loggedExerciseId)).tag).toBeNull();
    expect(await occ(account, wed.loggedExerciseId)).toEqual(wedBefore);
    expect(
      (await db().session.findUniqueOrThrow({ where: { id: b.push.id } }))
        .lineageId,
    ).toBe(lineageBefore);
    // Barbell: no baseline row was ever written or replayed.
    expect(await db().gymExerciseBaseline.count()).toBe(0);
  });
});

describe("review of #227 — a past workout keeps its own evidence", () => {
  it("a completed workout's call survives a later rep-range change, and the page agrees", async () => {
    const b = await twoWorkoutBlock(account);
    const log = logger(account, b);
    await log(b.push.id, SAT[0], TOP_SAT);
    const done = await log(b.push.id, SAT[1], TOP_SAT);
    expect((await occ(account, done.loggedExerciseId)).tag).toBe("progress");

    // Push moves to 6–8 and is logged once at the new range.
    await db().sessionExercise.updateMany({
      where: { sessionId: b.push.id },
      data: { targetRepMin: 6, targetRepMax: 8 },
    });
    await log(b.push.id, SAT[2], [
      [235, 8],
      [235, 8],
      [235, 8],
    ]);

    // The earlier Saturday is still judged on the run that ended at it.
    expect((await occ(account, done.loggedExerciseId)).tag).toBe("progress");
    const page = (await getExerciseHistory(account, b.exercise.id))!;
    const row = page.sessions.rows.find((r) => r.dateIso === SAT[1])!;
    expect(row.call).toBe("progress");
  });

  it("a skipped workout at another rep range breaks the run on the card and the page alike", async () => {
    const b = await twoWorkoutBlock(account);
    const log = logger(account, b);
    await log(b.upper.id, WED[0], TOP_WED);
    await log(b.upper.id, WED[1], TOP_WED);
    // WED[2] planned at 8–10, started, and nothing logged (a skipped day).
    await db().sessionExercise.updateMany({
      where: { sessionId: b.upper.id },
      data: { targetRepMin: 8, targetRepMax: 10 },
    });
    await logWorkout(account, {
      sessionId: b.upper.id,
      date: WED[2],
      gymId: b.gym.id,
      exerciseId: b.exercise.id,
      sets: [],
      finish: false,
    });
    await db().sessionExercise.updateMany({
      where: { sessionId: b.upper.id },
      data: { targetRepMin: 6, targetRepMax: 8 },
    });
    const next = await start(account, b, b.upper.id, WED[3]);
    const card = await occ(account, next.loggedExerciseId);
    const page = (await getExerciseHistory(account, b.exercise.id))!;
    const upper = page.nextByWorkout.find((w) => w.sessionName === "Upper")!;
    // The 8–10 occurrence cut the 6–8 run: no call on either surface.
    expect(card.tag).toBeNull();
    expect(upper.next).toMatchObject({ tag: null, recommendation: null });
  });
});
