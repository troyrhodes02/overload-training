import {
  GOAL_FIELD_ERRORS,
  goalInputFromFormData,
  parseGoalInput,
} from "@/lib/goals/validation";

const EX = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";

function errorsFor(raw: Parameters<typeof parseGoalInput>[0]) {
  const r = parseGoalInput(raw);
  return r.ok ? {} : r.details;
}

describe("goal target validation (spec §12)", () => {
  it("accepts an exercise, a positive weight, and whole reps", () => {
    expect(
      parseGoalInput({
        exerciseId: EX,
        targetWeightLbs: "315",
        targetReps: "1",
      }),
    ).toEqual({
      ok: true,
      value: {
        exerciseId: EX,
        gymId: null,
        targetWeightLbs: 315,
        targetReps: 1,
      },
    });
    const r = parseGoalInput({
      exerciseId: EX,
      gymId: "  ",
      targetWeightLbs: 102.5,
      targetReps: 8,
    });
    expect(r.ok && r.value).toMatchObject({
      gymId: null,
      targetWeightLbs: 102.5,
    });
  });

  it("rejects a missing exercise", () => {
    expect(
      errorsFor({ exerciseId: "", targetWeightLbs: "315", targetReps: "1" }),
    ).toEqual({ exerciseId: GOAL_FIELD_ERRORS.exerciseId });
  });

  it.each([
    ["missing", ""],
    ["zero", "0"],
    ["negative", "-5"],
    ["non-numeric", "abc"],
    ["above the column limit", "10000"],
    ["not a number type", null],
  ])("rejects a %s weight", (_label, weight) => {
    expect(
      errorsFor({ exerciseId: EX, targetWeightLbs: weight, targetReps: "1" }),
    ).toEqual({ targetWeightLbs: GOAL_FIELD_ERRORS.targetWeightLbs });
  });

  it.each([
    ["missing", ""],
    ["zero", "0"],
    ["negative", "-1"],
    ["non-whole", "2.5"],
    ["above the limit", "1001"],
    ["non-numeric", "five"],
  ])("rejects %s reps", (_label, reps) => {
    expect(
      errorsFor({ exerciseId: EX, targetWeightLbs: "315", targetReps: reps }),
    ).toEqual({ targetReps: GOAL_FIELD_ERRORS.targetReps });
  });

  it("reads only the four goal fields from a form — no date, note, or e1RM", () => {
    const fd = new FormData();
    fd.set("exerciseId", EX);
    fd.set("targetWeightLbs", "315");
    fd.set("targetReps", "1");
    fd.set("targetDate", "2027-01-01");
    fd.set("targetE1rm", "999");
    const raw = goalInputFromFormData(fd);
    expect(Object.keys(raw).sort()).toEqual(
      ["exerciseId", "gymId", "targetReps", "targetWeightLbs"].sort(),
    );
  });
});
