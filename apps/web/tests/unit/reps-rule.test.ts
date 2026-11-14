import fs from "node:fs";
import { GOAL_REPS_MAX } from "@overload/shared/goals/validation";
import {
  checkLoggedReps,
  LOGGED_REPS_MAX,
  REPS_MESSAGES,
} from "@overload/shared/logging/reps";
import { libFile, WEB_SRC } from "../support/code-roots";

/**
 * Pitch 21b (mobile audit D-13): the reps of a logged set follow one named
 * rule, the one the server always applied: a whole number from 1 to 1,000,
 * refused with "Enter reps above 0.".
 */
describe("one reps rule for a logged set", () => {
  it("accepts whole numbers from 1 to 1,000", () => {
    for (const reps of [1, 2, 8, 12, 100, 999, 1000]) {
      expect(checkLoggedReps(reps)).toEqual({ ok: true, value: reps });
    }
  });

  it("refuses everything else with the server's message", () => {
    for (const reps of [
      0,
      -1,
      1001,
      2.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "8",
      null,
      undefined,
    ]) {
      expect(checkLoggedReps(reps)).toEqual({
        ok: false,
        message: "Enter reps above 0.",
      });
    }
    expect(REPS_MESSAGES.required).toBe("Enter reps above 0.");
  });

  it("goal targets share the bound", () => {
    expect(LOGGED_REPS_MAX).toBe(1000);
    expect(GOAL_REPS_MAX).toBe(LOGGED_REPS_MAX);
  });

  it("the set write path and the logging card apply it, with no inline copy", () => {
    const code = (f: string) =>
      fs
        .readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const writePath = code(libFile("logging/logged-sets.ts"));
    expect(writePath).toMatch(/checkLoggedReps\(reps\)/);
    expect(writePath).not.toMatch(/\b1000\b/);
    const card = code(`${WEB_SRC}/components/logging/exercise-card.tsx`);
    expect(card).toMatch(/checkLoggedReps\(/);
    expect(card).not.toMatch(/"Enter reps above 0\."/);
  });
});
