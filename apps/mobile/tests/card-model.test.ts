/**
 * Pitch 21e spec §11 "card-model": the card only wires the server's fields
 * into the shared rules. The server decides which history is trusted; the
 * phone offers a weight only when the server says "trusted".
 */
import type { ExerciseCardDto } from "@overload/shared/contracts/logging";
import {
  canFinish,
  cardActiveSet,
  cardContext,
  cardMode,
  cardOffer,
  initialExerciseIndex,
  parseRepsText,
  parseWeightText,
  summaryCounts,
  summaryCountsLabel,
  trustedWorkingWeight,
  unfinishedExercises,
} from "../src/workout/card-model";
import { card, referenceOnlyCard, rows, workout } from "./fixtures/workout";

const saved = (
  n: number,
  weightLbs: number | null,
  reps: number,
): ExerciseCardDto["sets"][number] => ({
  setNumber: n,
  loggedSetId: `set-${n}`,
  weightLbs,
  reps,
  rir: null,
  saved: true,
  extra: false,
});

describe("the weight offer follows the server's weight context (RD-8)", () => {
  it("trusted: the server's weight, captioned 'last time'", () => {
    expect(trustedWorkingWeight(card())).toBe(255);
    expect(cardOffer(card())).toEqual({
      weightLbs: 255,
      source: { kind: "working_weight", fromBaseline: false },
    });
  });

  it("reference only, none, and an unknown context offer nothing — even with a weight present", () => {
    for (const weightContext of ["reference_only", "none", "something_new"]) {
      const c = card({
        weightContext: weightContext as ExerciseCardDto["weightContext"],
        suggestedWeightLbs: 255,
      });
      expect([weightContext, trustedWorkingWeight(c), cardOffer(c)]).toEqual([
        weightContext,
        null,
        null,
      ]);
    }
    expect(cardOffer(referenceOnlyCard())).toBeNull();
  });

  it("after set 1 is saved, set 2 is offered set 1's weight — in any context", () => {
    for (const c of [card(), referenceOnlyCard()]) {
      const next = { ...c, sets: [saved(1, 230, 8), ...rows(3).slice(1)] };
      expect(cardOffer(next)).toEqual({
        weightLbs: 230,
        source: { kind: "previous_set", setNumber: 1 },
      });
      expect(cardActiveSet(next)).toBe(2);
    }
  });

  it("an unsaved row never sets the offer", () => {
    const c = card({
      weightContext: "none",
      suggestedWeightLbs: null,
      previousPerformance: null,
      sets: [{ ...rows(1)[0], weightLbs: 300, reps: 5, saved: false }],
    });
    expect(cardOffer(c)).toBeNull();
  });

  it("bodyweight is never offered a weight", () => {
    expect(
      cardOffer(
        card({ requiresExternalWeight: false, suggestedWeightLbs: null }),
      ),
    ).toBeNull();
  });
});

describe("the context lines are the shared wording", () => {
  it("trusted: 'Last time in Push'", () => {
    const { line, reference } = cardContext(card(), workout());
    expect(line).toBe("Last time in Push · Nov 7 · 255 × 5, 5, 4");
    expect(reference).toBeNull();
  });

  it("reference only: nothing logged in Upper, then the reference line", () => {
    const { line, reference } = cardContext(
      referenceOnlyCard(),
      workout({ sessionName: "Upper" }),
    );
    expect(line).toBe("Nothing logged in Upper at 6–8 reps yet.");
    expect(reference).toBe(
      "For reference: Push · 3–5 reps · Nov 7 · 255 × 5, 5, 4",
    );
  });

  it("none: first time", () => {
    const c = card({
      weightContext: "none",
      suggestedWeightLbs: null,
      previousPerformance: null,
    });
    expect(cardContext(c, workout()).line).toBe("First time logging this.");
  });
});

describe("typed numbers", () => {
  it("accepts a comma decimal mark and refuses anything else", () => {
    expect(parseWeightText("182,5")).toBe(182.5);
    expect(parseWeightText(" 185 ")).toBe(185);
    expect(parseWeightText("182.25")).toBe(182.25);
    for (const bad of ["", ".", "1.2.3", "abc", "-5"])
      expect(parseWeightText(bad)).toBeNaN();
    expect(parseRepsText("")).toBe(0);
    expect(parseRepsText("8")).toBe(8);
    expect(parseRepsText("8.5")).toBeNaN();
  });
});

describe("where the workout opens, and finishing", () => {
  it("opens on the first loggable card with an unlogged planned set", () => {
    const done = card({
      loggedExerciseId: "a",
      sets: [saved(1, 255, 5), saved(2, 255, 5), saved(3, 255, 4)],
    });
    const skipped = card({ loggedExerciseId: "b", skipped: true });
    const archived = card({ loggedExerciseId: "c", performedArchived: true });
    const todo = card({ loggedExerciseId: "d" });
    const w = workout({ exercises: [done, skipped, archived, todo] });
    expect(initialExerciseIndex(w)).toBe(3);
    expect(initialExerciseIndex(workout({ exercises: [done] }))).toBe(0);
    expect(cardMode(skipped)).toBe("not_done");
    expect(cardMode(archived)).toBe("unavailable");
  });

  it("lists unfinished exercises the way the web runner does", () => {
    const partly = card({
      loggedExerciseId: "a",
      performedExerciseName: "Lateral Raise",
      sets: [saved(1, 20, 12), ...rows(3).slice(1)],
    });
    const none = card({
      loggedExerciseId: "b",
      performedExerciseName: "Incline Press",
    });
    const skipped = card({ loggedExerciseId: "c", skipped: true });
    const w = workout({ exercises: [partly, none, skipped] });
    expect(unfinishedExercises(w)).toEqual([
      { name: "Lateral Raise", done: 1, planned: 3 },
      { name: "Incline Press", done: 0, planned: 3 },
    ]);
    expect(canFinish(w)).toBe(true);
    expect(canFinish(workout())).toBe(false);
  });

  it("summary counts exercises with a set and every saved set", () => {
    const counts = summaryCounts({
      loggedSessionId: "ls",
      sessionName: "Push",
      dateIso: "2026-11-14",
      dateLabel: "",
      gymName: null,
      exercises: [
        { sets: [{}, {}, {}] },
        { sets: [] },
        { sets: [{}, {}] },
      ] as never,
    });
    expect(counts).toEqual({ exercises: 2, sets: 5 });
    expect(summaryCountsLabel(counts)).toBe("2 exercises · 5 sets");
    expect(summaryCountsLabel({ exercises: 1, sets: 1 })).toBe(
      "1 exercise · 1 set",
    );
  });
});
