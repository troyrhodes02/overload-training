import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import {
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import type { Account } from "@/lib/data/account";
import { createTestAccount } from "./support/accounts";

/**
 * Plans, Billing & Promo Codes — server-enforced Pro access (AC-2, spec §14.3).
 * The ENFORCEMENT is in the query layer: a Free account that calls the read
 * path DIRECTLY receives the withheld DTO (Pro fields null + `locked`), never a
 * Pro value. A Pro account (open-ended comp) gets the real call. Identical
 * logged history both ways — only the entitlement differs — so the difference
 * is the gate, not the data.
 */

const TOP = [8, 8, 8];

async function progressScenario(account: Account) {
  const p = getTestPrisma();
  const meso = await createTestMesocycle({
    status: "active",
    userId: account.userId,
  });
  const ex = await createTestExercise({
    equipmentType: "barbell",
    userId: account.userId,
  });
  let done = { loggedSessionId: "", loggedExerciseId: "" };
  for (const [i, date] of ["2026-11-02", "2026-11-09"].entries()) {
    const ls = await p.loggedSession.create({
      data: {
        userId: account.userId,
        mesocycleId: meso.id,
        performedOn: new Date(`${date}T12:00:00Z`),
        scheduledFor: new Date(`${date}T00:00:00Z`),
        status: "complete",
      },
    });
    const le = await p.loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: ex.id,
        plannedExerciseId: ex.id,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });
    for (let n = 0; n < TOP.length; n++) {
      await p.loggedSet.create({
        data: {
          userId: account.userId,
          loggedExerciseId: le.id,
          setNumber: n + 1,
          weightLbs: 185,
          reps: TOP[n],
          createdAt: new Date(`2025${date.slice(4)}T12:0${n}:00Z`),
        },
      });
    }
    if (i === 1) done = { loggedSessionId: ls.id, loggedExerciseId: le.id };
  }
  return { exId: ex.id, done };
}

describe("a Pro account receives the real progression call", () => {
  let account: Account;
  beforeEach(async () => {
    account = await createTestAccount("UTC", undefined, { entitlement: "pro" });
  });

  it("planned list, session summary, and exercise history all carry the Pro result", async () => {
    const { exId, done } = await progressScenario(account);

    const planned = await getPlannedProgression(account, exId, {
      scheduledDeloadWeek: false,
    });
    expect(planned.tag).toBe("progress");
    expect(planned.recommendation).not.toBeNull();
    expect(planned.suggestion).not.toBeNull();
    expect(planned.locked).toBeNull();

    const summary = (await getSessionProgressionSummary(
      account,
      done.loggedSessionId,
    ))!;
    expect(summary.locked).toBeNull();
    expect(summary.exercises[0].tag).toBe("progress");
    expect(summary.exercises[0].recommendation).not.toBeNull();

    const history = (await getExerciseHistory(account, exId))!;
    expect(history.locked).toBeNull();
    expect(history.next?.kind).toBe("call");
    expect(
      history.records?.kind === "loaded" && history.records.bestE1rm,
    ).not.toBeNull();
    expect(history.trend.e1rm).not.toBeNull();
    expect(history.sessions.rows[0].call).not.toBe("none");
  });
});

describe("a Free account cannot obtain a Pro result through the read path", () => {
  let account: Account;
  beforeEach(async () => {
    account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
  });

  it("planned list withholds the call and marks it locked", async () => {
    const { exId } = await progressScenario(account);
    const planned = await getPlannedProgression(account, exId, {
      scheduledDeloadWeek: false,
    });
    expect(planned.tag).toBeNull();
    expect(planned.recommendation).toBeNull();
    expect(planned.suggestion).toBeNull();
    expect(planned.hasTrend).toBe(false);
    expect(planned.locked).toBe("progression_insights");
  });

  it("session summary withholds every exercise's call", async () => {
    const { done } = await progressScenario(account);
    const summary = (await getSessionProgressionSummary(
      account,
      done.loggedSessionId,
    ))!;
    expect(summary.locked).toBe("progression_insights");
    for (const e of summary.exercises) {
      expect(e.tag).toBeNull();
      expect(e.recommendation).toBeNull();
      expect(e.suggestion).toBeNull();
    }
  });

  it("exercise history withholds the call, e1RM estimate, trends, and per-session calls but keeps plain history", async () => {
    const { exId } = await progressScenario(account);
    const history = (await getExerciseHistory(account, exId))!;
    expect(history.locked).toBe("progression_insights");
    expect(
      history.next?.kind === "call" ? history.next.recommendation : "n/a",
    ).toBeNull();
    expect(
      history.records?.kind === "loaded" ? history.records.bestE1rm : "n/a",
    ).toBeNull();
    expect(history.trend.e1rm).toBeNull();
    expect(history.trend.weight).toBeNull();
    // Free keeps the plain session history and the best/heaviest set.
    expect(history.sessions.rows.length).toBeGreaterThan(0);
    expect(history.sessions.rows.every((r) => r.call === "none")).toBe(true);
    expect(
      history.records?.kind === "loaded"
        ? history.records.bestSet.weightLbs
        : 0,
    ).toBe(185);
  });
});
