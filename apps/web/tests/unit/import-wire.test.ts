import {
  WireObservationSchema,
  firstAlternative,
  wireToObservation,
  type WireObservation,
} from "@/lib/import/extraction/wire";
import { ExtractedPlanObservationSchema } from "@/lib/import/extraction/schema";
import { SYSTEM_PROMPT } from "@/lib/import/extraction/prompt";
import { buildImportDraft } from "@/lib/import/draft/build";
import { ISSUE_CODES } from "@/lib/import/parse/shorthand";
import type { MatchOutcome } from "@/lib/import/match/matcher";

/**
 * The compact wire format the model writes, and its expansion into the internal
 * observation. Mocked only; no provider call. Proves the format stays small
 * enough for long real plans, keeps only the first of listed alternates, and
 * still feeds evidence verification downstream.
 */

type WireExercise = WireObservation["days"][number]["exercises"][number];

const ex = (
  name: string | null,
  over: Partial<WireExercise> = {},
): WireExercise => ({
  name,
  part: null,
  page: null,
  sets: "2",
  reps: "8–12",
  load: null,
  rest: "60–90 seconds",
  tempo: null,
  notes: "0–1 RIR",
  group: null,
  ...over,
});

describe("firstAlternative", () => {
  it.each([
    [
      "Machine Shoulder Press or Smith Machine Shoulder Press",
      "Machine Shoulder Press",
    ],
    ["Weighted Dips or Machine Chest Dips", "Weighted Dips"],
    [
      "Neutral-Grip Pull-Up or Neutral-Grip Lat Pulldown",
      "Neutral-Grip Pull-Up",
    ],
    ["Seated or Lying Leg Curl", "Seated Leg Curl"],
    ["Hip Thrust OR Glute Bridge Machine", "Hip Thrust"],
    ["Barbell Bench Press", "Barbell Bench Press"],
    // "or" inside a word is not a separator.
    ["Floor Press", "Floor Press"],
    ["Rotator Cuff External Rotation", "Rotator Cuff External Rotation"],
  ])("%s → %s", (input, expected) => {
    expect(firstAlternative(input)).toBe(expected);
  });

  it("keeps null as null", () => {
    expect(firstAlternative(null)).toBeNull();
  });
});

describe("wire format", () => {
  const wire: WireObservation = {
    isWorkoutPlan: true,
    title: "Weekly Workout Split",
    days: [
      {
        label: "Monday — Push Strength",
        part: 0,
        page: 2,
        exercises: [
          ex("Barbell Bench Press", { reps: "4–6" }),
          ex("Machine Shoulder Press or Smith Machine Shoulder Press", {
            page: 3,
          }),
        ],
      },
    ],
    unreadable: [{ part: 0, page: 4, hint: "smudged line" }],
    contradictions: [
      { message: "Two set counts", part: 0, page: 2, quote: "2 sets" },
    ],
  };

  it("is strict: an invented field is rejected", () => {
    const bad = structuredClone(wire) as unknown as {
      days: { exercises: Record<string, unknown>[] }[];
    };
    bad.days[0].exercises[0].weightKg = 100;
    expect(() => WireObservationSchema.parse(bad)).toThrow();
  });

  it("expands into a valid internal observation", () => {
    const obs = ExtractedPlanObservationSchema.parse(wireToObservation(wire));
    const [bench, press] = obs.days[0].exercises;
    expect(bench.order).toBe(0);
    expect(bench.reps.raw).toBe("4–6");
    expect(bench.notes.raw).toBe("0–1 RIR");
    // The name is the evidence; location falls back to the day's.
    expect(bench.name.evidence).toEqual({
      partIndex: 0,
      page: 2,
      quote: "Barbell Bench Press",
      locationHint: null,
    });
    // Alternates: only the first is kept, and its own page wins.
    expect(press.name.raw).toBe("Machine Shoulder Press");
    expect(press.name.evidence?.page).toBe(3);
    expect(obs.days[0].label.evidence?.quote).toBe("Monday — Push Strength");
    expect(obs.unreadable[0]).toMatchObject({
      page: 4,
      locationHint: "smudged line",
    });
    expect(obs.contradictions[0].evidence[0].quote).toBe("2 sets");
  });

  it("feeds quote verification: the first alternate is found in the source", () => {
    const source =
      "Monday — Push Strength\n1. Barbell Bench Press\n2. Machine Shoulder Press or Smith Machine Shoulder Press";
    const textWire: WireObservation = {
      ...wire,
      days: [
        {
          ...wire.days[0],
          page: null,
          exercises: wire.days[0].exercises.map((e) => ({ ...e, page: null })),
        },
      ],
      unreadable: [],
      contradictions: [],
    };
    const matches: MatchOutcome[] = [
      { kind: "matched", exerciseId: "a", name: "Barbell Bench Press" },
      { kind: "matched", exerciseId: "b", name: "Machine Shoulder Press" },
    ] as MatchOutcome[];
    const draft = buildImportDraft({
      observation: wireToObservation(textWire),
      matches,
      parts: [{ index: 0, text: source }],
    });
    expect(
      draft.issues.filter((i) => i.code === ISSUE_CODES.EVIDENCE_NOT_FOUND),
    ).toEqual([]);
  });

  it("stays small for a long real plan: 6 days of 7 exercises", () => {
    const days = Array.from({ length: 6 }, (_, d) => ({
      label: `Day ${d + 1} — Push Hypertrophy + Abs`,
      part: 0,
      page: d + 1,
      exercises: Array.from({ length: 7 }, (_, i) =>
        ex(`Incline Barbell Bench Press or Smith Machine Incline Press ${i}`, {
          rest: "90 seconds–2 minutes",
        }),
      ),
    }));
    const json = JSON.stringify({
      ...wire,
      days,
      unreadable: [],
      contradictions: [],
    });
    // ~4 characters per token: 42 exercises in well under 4k tokens, against a
    // 20k cap. (The old per-field-evidence format needed ~19k for this plan.)
    expect(json.length / 4).toBeLessThan(4_000);
  });
});

describe("the prompt", () => {
  it("keeps only the first alternate and leaves out cardio and mobility", () => {
    expect(SYSTEM_PROMPT).toMatch(/report ONLY the first option/);
    expect(SYSTEM_PROMPT).toMatch(/cardio and conditioning/);
    expect(SYSTEM_PROMPT).toMatch(/mobility and stretching/);
  });
});
