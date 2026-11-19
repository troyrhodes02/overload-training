import fs from "node:fs";
import path from "node:path";

/**
 * OVE-220: every function in the workout write modules that writes a
 * workout, one of its exercises, or one of its sets takes the workout lock
 * (lockWorkoutForUpdate) — so a check and the write that depends on it can't
 * be overtaken by another write to the same workout. A new write function
 * that forgets it fails here instead of reopening the race.
 *
 * The one exemption is listed with its reason.
 */
const MODULES = [
  "src/lib/logging/sessions.ts",
  "src/lib/logging/logged-sets.ts",
];

/** A write to a workout, one of its exercises, or one of its sets. */
const WRITE =
  /\btx\.(loggedSet|loggedExercise|loggedSession)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

const EXEMPT: Record<string, string> = {
  // Corrects a saved set's values only (weight, reps, RIR) — never its
  // exercise, gym, workout, or number — and is allowed on finished workouts.
  // Nothing it checks can be changed by another workout write.
  editLoggedSet: "values-only correction",
};

/** Top-level functions of a module, by name, with their source. */
function functions(file: string): { name: string; body: string }[] {
  const src = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
  const starts = [...src.matchAll(/^(?:export )?async function (\w+)/gm)];
  return starts.map((m, i) => ({
    name: m[1]!,
    body: src.slice(m.index, starts[i + 1]?.index ?? src.length),
  }));
}

describe("OVE-220: workout writes take the workout lock", () => {
  const all = MODULES.flatMap(functions);

  it("finds the write functions it guards", () => {
    const writers = all.filter((f) => WRITE.test(f.body)).map((f) => f.name);
    for (const name of [
      "startOrResumeWorkout",
      "changeGym",
      "swapExercise",
      "setExerciseSkipped",
      "editPlannedSets",
      "completeWorkout",
      "logSetInTx",
    ]) {
      expect(writers).toContain(name);
    }
  });

  it("every one of them locks the workout first (or is exempt with a reason)", () => {
    const missing = all
      .filter((f) => WRITE.test(f.body))
      .filter((f) => !(f.name in EXEMPT))
      .filter((f) => !/\blockWorkoutForUpdate\(/.test(f.body))
      .map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it("the lock comes before the function's first write", () => {
    const late = all
      .filter((f) => WRITE.test(f.body) && !(f.name in EXEMPT))
      // startOrResumeWorkout creates a NEW workout with no lock to take; its
      // resume branch locks before it moves the gym.
      .filter((f) => f.name !== "startOrResumeWorkout")
      .filter(
        (f) => f.body.search(/\blockWorkoutForUpdate\(/) > f.body.search(WRITE),
      )
      .map((f) => f.name);
    expect(late).toEqual([]);
  });
});
