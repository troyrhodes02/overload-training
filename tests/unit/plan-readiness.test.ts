import {
  evaluateReadiness,
  readinessIssueHref,
  readinessIssueMessage,
  type ReadinessInput,
  type ReadinessSession,
} from "@/lib/plan/readiness";

const slot = (id: string, name: string, extra = {}) => ({
  id,
  exerciseName: name,
  isArchived: false,
  plannedSets: 3,
  targetRepMin: 6,
  targetRepMax: 8,
  ...extra,
});

const session = (
  id: string,
  name: string,
  dayOfWeek: number | null,
  exercises = [slot(`${id}-a`, "Barbell Bench Press")],
): ReadinessSession => ({ id, name, dayOfWeek, exercises });

const ready = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  name: "Strength Block",
  startDate: "2026-11-02",
  lengthWeeks: 5,
  deloadWeek: 5,
  sessions: [session("s1", "Push Day 1", 1)],
  ...over,
});

describe("mesocycle readiness (spec D3)", () => {
  it("a complete plan is ready; rest days are valid", () => {
    expect(evaluateReadiness(ready())).toEqual({ ready: true, issues: [] });
  });

  it("needs a start date", () => {
    const r = evaluateReadiness(ready({ startDate: null }));
    expect(r.issues.map((i) => i.code)).toEqual(["start_date_missing"]);
  });

  it("needs a deload week inside the block, and a valid length", () => {
    expect(
      evaluateReadiness(ready({ lengthWeeks: 4, deloadWeek: 5 })).issues,
    ).toEqual([{ code: "deload_out_of_range", deloadWeek: 5, lengthWeeks: 4 }]);
    expect(
      evaluateReadiness(ready({ lengthWeeks: 0 })).issues.map((i) => i.code),
    ).toEqual(["length_invalid"]);
    expect(evaluateReadiness(ready({ deloadWeek: 1 })).ready).toBe(true);
  });

  it("needs at least one scheduled session", () => {
    expect(evaluateReadiness(ready({ sessions: [] })).issues).toEqual([
      { code: "nothing_scheduled" },
    ]);
    const onlyUnscheduled = evaluateReadiness(
      ready({ sessions: [session("u", "Upper A", null)] }),
    );
    expect(onlyUnscheduled.issues.map((i) => i.code)).toEqual([
      "nothing_scheduled",
    ]);
  });

  it("an empty scheduled session blocks; an empty unscheduled one does not", () => {
    const r = evaluateReadiness(
      ready({
        sessions: [
          session("s1", "Push Day 1", 1),
          session("s3", "Leg Day 1", 3, []),
          session("u", "Upper A", null, []),
        ],
      }),
    );
    expect(r.issues).toEqual([
      {
        code: "session_empty",
        sessionId: "s3",
        sessionName: "Leg Day 1",
        dayOfWeek: 3,
      },
    ]);
  });

  it("an archived exercise blocks wherever it is, scheduled or not", () => {
    const r = evaluateReadiness(
      ready({
        sessions: [
          session("u", "Upper A", null, [
            slot("x9", "Cable Fly", { isArchived: true }),
          ]),
          session("s2", "Pull Day 1", 2, [
            slot("x1", "Lat Pulldown"),
            slot("x2", "Barbell Row", { isArchived: true }),
          ]),
        ],
      }),
    );
    expect(r.issues.map((i) => readinessIssueMessage(i))).toEqual([
      "Barbell Row in Pull Day 1 is archived. Replace or remove it.",
      "Cable Fly in Upper A is archived. Replace or remove it.",
    ]);
  });

  it("flags an invalid slot (defense behind the DB CHECKs)", () => {
    const r = evaluateReadiness(
      ready({
        sessions: [
          session("s1", "Push Day 1", 1, [
            slot("x1", "Cable Fly", { targetRepMin: 10, targetRepMax: 8 }),
          ]),
        ],
      }),
    );
    expect(r.issues.map((i) => i.code)).toEqual(["exercise_plan_invalid"]);
  });

  it("orders issues: config, schedule, empty sessions Mon→Sun, archived slots", () => {
    const r = evaluateReadiness(
      ready({
        startDate: null,
        sessions: [
          session("s3", "Leg Day 1", 3, []),
          session("s1", "Push Day 1", 1, [
            slot("x3", "Cable Fly", { isArchived: true }),
          ]),
        ],
      }),
    );
    expect(r.issues.map((i) => readinessIssueMessage(i))).toEqual([
      "Add a start date.",
      "Leg Day 1 (Wed) has no exercises.",
      "Cable Fly in Push Day 1 is archived. Replace or remove it.",
    ]);
  });

  it("links each issue to its fix", () => {
    const id = "m1";
    expect(readinessIssueHref(id, { code: "start_date_missing" })).toBe(
      "/plan/m1/details",
    );
    expect(
      readinessIssueHref(id, {
        code: "exercise_archived",
        sessionId: "s1",
        sessionName: "Push Day 1",
        sessionExerciseId: "x3",
        exerciseName: "Cable Fly",
      }),
    ).toBe("/plan/m1/sessions/s1#slot-x3");
  });
});
