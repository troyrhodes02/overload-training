import { day, ex, observation, SYN_LIBRARY } from "./builders";
import type { GoldenExercise, GoldenFixture } from "./types";

/**
 * Workout Plan Import & Review (OVE-109, blueprint §7.3) — the synthetic
 * golden-set: >=50 ground-truth fixtures across all five source kinds plus
 * tables, multi-column, mixed units, supersets, handwriting, illegibility,
 * non-plans and injection. NO real client/customer data: every name and plan is
 * invented for the test. Expected drafts are the human annotation the eval scores
 * against; the observation is what a correct model would report.
 */

const usage = (inputTokens = 1200, outputTokens = 400, latencyMs = 900) => ({
  inputTokens,
  outputTokens,
  latencyMs,
});

/** matched-exercise ground-truth helper. */
function m(
  matchName: string,
  sets: number | null,
  repMin: number | null,
  repMax: number | null,
): GoldenExercise {
  return { matchName, matchKind: "matched", sets, repMin, repMax };
}

const fixtures: GoldenFixture[] = [];

/* ------------------------------------------------------------------ */
/* 1) PASTED TEXT — clean, the bread-and-butter path (10 fixtures).    */
/* ------------------------------------------------------------------ */

fixtures.push({
  id: "text-ppl-push",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "PPL", [
    day("Push", [
      ex("Barbell Bench Press", "3", "6-8", { load: "185 lb", rest: "2 min" }),
      ex("Overhead Press", "4", "8-10"),
      ex("Triceps Pushdown", "3", "12-15"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Push"],
    exercises: [
      m("Barbell Bench Press", 3, 6, 8),
      m("Overhead Press", 4, 8, 10),
      m("Triceps Pushdown", 3, 12, 15),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-ppl-pull",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "Pull Day", [
    day("Pull", [
      ex("Barbell Deadlift", "1", "5"),
      ex("Barbell Row", "4", "8"),
      ex("Lat Pulldown", "3", "10-12"),
      ex("Dumbbell Biceps Curl", "3", "12"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Pull"],
    exercises: [
      m("Barbell Deadlift", 1, 5, 5),
      m("Barbell Row", 4, 8, 8),
      m("Lat Pulldown", 3, 10, 12),
      m("Dumbbell Biceps Curl", 3, 12, 12),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-legs",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "Leg Day", [
    day("Legs", [
      ex("Barbell Back Squat", "5", "5"),
      ex("Romanian Deadlift", "3", "8-10"),
      ex("Leg Press", "3", "12"),
      ex("Lying Leg Curl", "3", "12-15"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Legs"],
    exercises: [
      m("Barbell Back Squat", 5, 5, 5),
      m("Romanian Deadlift", 3, 8, 10),
      m("Leg Press", 3, 12, 12),
      m("Lying Leg Curl", 3, 12, 15),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-abbreviations",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "Upper", [
    day("Upper", [
      ex("OHP", "3", "5"),
      ex("Bench", "3", "5"),
      ex("Row", "3", "8"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Upper"],
    exercises: [
      m("Overhead Press", 3, 5, 5),
      m("Barbell Bench Press", 3, 5, 5),
      m("Barbell Row", 3, 8, 8),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-missing-reps",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "A", [
    day("Chest", [ex("Barbell Bench Press", "3", null)]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Chest"],
    exercises: [
      {
        matchName: "Barbell Bench Press",
        matchKind: "matched",
        sets: 3,
        repMin: null,
        repMax: null,
      },
    ],
    explicitlyMissing: [
      "/days/0/exercises/0/repMin",
      "/days/0/exercises/0/repMax",
    ],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-missing-sets",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "B", [
    day("Back", [ex("Lat Pulldown", null, "10-12")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Back"],
    exercises: [
      {
        matchName: "Lat Pulldown",
        matchKind: "matched",
        sets: null,
        repMin: 10,
        repMax: 12,
      },
    ],
    explicitlyMissing: ["/days/0/exercises/0/sets"],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-amrap",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "C", [
    day("Full", [ex("Pull-Up", "3", "AMRAP")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Full"],
    // AMRAP derives a floor of 1 rep (traceable to the source word) but states no
    // numeric ceiling: repMax stays unstated and is a review issue, never guessed.
    exercises: [
      {
        matchName: "Pull-Up",
        matchKind: "matched",
        sets: 3,
        repMin: 1,
        repMax: null,
      },
    ],
    explicitlyMissing: ["/days/0/exercises/0/repMax"],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-x-notation",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "D", [
    day("Push", [ex("Incline Barbell Bench Press", "4", "6")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Push"],
    exercises: [m("Incline Barbell Bench Press", 4, 6, 6)],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-two-days",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "Split", [
    day("Day A", [ex("Barbell Back Squat", "3", "5")]),
    day("Day B", [ex("Barbell Bench Press", "3", "5")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Day A", "Day B"],
    exercises: [
      m("Barbell Back Squat", 3, 5, 5),
      m("Barbell Bench Press", 3, 5, 5),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

fixtures.push({
  id: "text-rpe-context",
  kind: "pasted_text",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "E", [
    day("Squat", [
      ex("Barbell Back Squat", "4", "6", { notes: "RPE 8", rest: "3 min" }),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Squat"],
    exercises: [m("Barbell Back Squat", 4, 6, 6)],
    explicitlyMissing: [],
  },
  mockUsage: usage(),
});

/* ------------------------------------------------------------------ */
/* 2) TEXT PDF — same structure, page-cited (8 fixtures).              */
/* ------------------------------------------------------------------ */

for (let i = 0; i < 8; i++) {
  const names = [
    ["Barbell Bench Press", "Overhead Press"],
    ["Barbell Back Squat", "Leg Press"],
    ["Barbell Deadlift", "Barbell Row"],
    ["Lat Pulldown", "Dumbbell Biceps Curl"],
    ["Incline Barbell Bench Press", "Triceps Pushdown"],
    ["Romanian Deadlift", "Lying Leg Curl"],
    ["Pull-Up", "Dumbbell Lateral Raise"],
    ["Barbell Front Squat", "Leg Press"],
  ][i];
  fixtures.push({
    id: `textpdf-${i}`,
    kind: "text_pdf",
    hardCases: ["clean"],
    library: SYN_LIBRARY,
    observation: observation(true, `Program ${i + 1}`, [
      day(`Day ${i + 1}`, [
        ex(names[0], "3", "8-10"),
        ex(names[1], "3", "10-12"),
      ]),
    ]),
    expected: {
      isWorkoutPlan: true,
      dayLabels: [`Day ${i + 1}`],
      exercises: [m(names[0], 3, 8, 10), m(names[1], 3, 10, 12)],
      explicitlyMissing: [],
    },
    mockUsage: usage(1800, 500, 1500),
  });
}

/* ------------------------------------------------------------------ */
/* 3) SCANNED PDF — vision path, some illegibility (6 fixtures).       */
/* ------------------------------------------------------------------ */

fixtures.push({
  id: "scanpdf-clean",
  kind: "scanned_pdf",
  hardCases: ["clean"],
  library: SYN_LIBRARY,
  observation: observation(true, "Scanned", [
    day("Push", [
      ex("Barbell Bench Press", "3", "8"),
      ex("Overhead Press", "3", "10"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Push"],
    exercises: [
      m("Barbell Bench Press", 3, 8, 8),
      m("Overhead Press", 3, 10, 10),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(2400, 500, 2100),
});

fixtures.push({
  id: "scanpdf-illegible-reps",
  kind: "scanned_pdf",
  hardCases: ["illegibility"],
  library: SYN_LIBRARY,
  observation: observation(
    true,
    "Scanned",
    [day("Legs", [ex("Barbell Back Squat", "5", null, { legibleName: true })])],
    {
      unreadable: [
        { partIndex: 0, page: 1, quote: null, locationHint: "rep column" },
      ],
    },
  ),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Legs"],
    exercises: [
      {
        matchName: "Barbell Back Squat",
        matchKind: "matched",
        sets: 5,
        repMin: null,
        repMax: null,
      },
    ],
    explicitlyMissing: [
      "/days/0/exercises/0/repMin",
      "/days/0/exercises/0/repMax",
    ],
  },
  mockUsage: usage(2400, 500, 2200),
});

for (let i = 0; i < 4; i++) {
  const pair = [
    ["Barbell Row", "Lat Pulldown"],
    ["Leg Press", "Lying Leg Curl"],
    ["Romanian Deadlift", "Barbell Deadlift"],
    ["Incline Barbell Bench Press", "Triceps Pushdown"],
  ][i];
  fixtures.push({
    id: `scanpdf-${i}`,
    kind: "scanned_pdf",
    hardCases: ["clean"],
    library: SYN_LIBRARY,
    observation: observation(true, `Scan ${i}`, [
      day(`Session ${i + 1}`, [
        ex(pair[0], "4", "6-8"),
        ex(pair[1], "3", "12"),
      ]),
    ]),
    expected: {
      isWorkoutPlan: true,
      dayLabels: [`Session ${i + 1}`],
      exercises: [m(pair[0], 4, 6, 8), m(pair[1], 3, 12, 12)],
      explicitlyMissing: [],
    },
    mockUsage: usage(2400, 500, 2000),
  });
}

/* ------------------------------------------------------------------ */
/* 4) SCREENSHOTS — tables / multi-column (8 fixtures).                */
/* ------------------------------------------------------------------ */

fixtures.push({
  id: "shot-table",
  kind: "screenshot",
  hardCases: ["table"],
  library: SYN_LIBRARY,
  observation: observation(true, "Week 1", [
    day("Mon", [
      ex("Barbell Bench Press", "3", "5"),
      ex("Barbell Row", "3", "5"),
    ]),
    day("Wed", [
      ex("Barbell Back Squat", "3", "5"),
      ex("Overhead Press", "3", "5"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Mon", "Wed"],
    exercises: [
      m("Barbell Bench Press", 3, 5, 5),
      m("Barbell Row", 3, 5, 5),
      m("Barbell Back Squat", 3, 5, 5),
      m("Overhead Press", 3, 5, 5),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(1600, 600, 1700),
});

fixtures.push({
  id: "shot-multicolumn",
  kind: "screenshot",
  hardCases: ["multi_column"],
  library: SYN_LIBRARY,
  observation: observation(true, "Two Column", [
    day("A", [ex("Barbell Front Squat", "4", "8")]),
    day("B", [ex("Romanian Deadlift", "4", "8")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["A", "B"],
    exercises: [
      m("Barbell Front Squat", 4, 8, 8),
      m("Romanian Deadlift", 4, 8, 8),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(1600, 600, 1700),
});

fixtures.push({
  id: "shot-superset",
  kind: "screenshot",
  hardCases: ["supersets"],
  library: SYN_LIBRARY,
  observation: observation(true, "Superset Day", [
    day("Arms", [
      ex("Dumbbell Biceps Curl", "3", "12", { groupLabel: "A1" }),
      ex("Triceps Pushdown", "3", "12", { groupLabel: "A2" }),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Arms"],
    exercises: [
      m("Dumbbell Biceps Curl", 3, 12, 12),
      m("Triceps Pushdown", 3, 12, 12),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(1600, 600, 1700),
});

fixtures.push({
  id: "shot-mixed-units",
  kind: "screenshot",
  hardCases: ["mixed_units"],
  library: SYN_LIBRARY,
  observation: observation(true, "Mixed", [
    day("Full", [
      ex("Barbell Bench Press", "3", "5", { load: "100 kg" }),
      ex("Dumbbell Biceps Curl", "3", "12", { load: "30 lb" }),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Full"],
    // Units are never converted; both exercises still resolve.
    exercises: [
      m("Barbell Bench Press", 3, 5, 5),
      m("Dumbbell Biceps Curl", 3, 12, 12),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(1600, 600, 1700),
});

for (let i = 0; i < 4; i++) {
  const pair = [
    ["Lat Pulldown", "Dumbbell Lateral Raise"],
    ["Leg Press", "Lying Leg Curl"],
    ["Pull-Up", "Barbell Row"],
    ["Overhead Press", "Triceps Pushdown"],
  ][i];
  fixtures.push({
    id: `shot-${i}`,
    kind: "screenshot",
    hardCases: ["table"],
    library: SYN_LIBRARY,
    observation: observation(true, `Shot ${i}`, [
      day(`Day ${i + 1}`, [ex(pair[0], "3", "10-12"), ex(pair[1], "3", "15")]),
    ]),
    expected: {
      isWorkoutPlan: true,
      dayLabels: [`Day ${i + 1}`],
      exercises: [m(pair[0], 3, 10, 12), m(pair[1], 3, 15, 15)],
      explicitlyMissing: [],
    },
    mockUsage: usage(1600, 600, 1700),
  });
}

/* ------------------------------------------------------------------ */
/* 5) PHOTO / HANDWRITING — ambiguity & illegibility (8 fixtures).     */
/* ------------------------------------------------------------------ */

fixtures.push({
  id: "hand-clean",
  kind: "photo_handwriting",
  hardCases: ["handwriting"],
  library: SYN_LIBRARY,
  observation: observation(true, "Notebook", [
    day("Push", [
      ex("Barbell Bench Press", "3", "8"),
      ex("Overhead Press", "3", "10"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Push"],
    exercises: [
      m("Barbell Bench Press", 3, 8, 8),
      m("Overhead Press", 3, 10, 10),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(2000, 700, 2600),
});

fixtures.push({
  id: "hand-illegible-name",
  kind: "photo_handwriting",
  hardCases: ["handwriting", "illegibility"],
  library: SYN_LIBRARY,
  observation: observation(true, "Scrawl", [
    day("Legs", [
      ex(null, "4", "8", { legibleName: false }),
      ex("Leg Press", "3", "12"),
    ]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Legs"],
    // An illegible name resolves to UNKNOWN, never a guess.
    exercises: [
      { matchName: null, matchKind: "unknown", sets: 4, repMin: 8, repMax: 8 },
      m("Leg Press", 3, 12, 12),
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(2000, 700, 2800),
});

fixtures.push({
  id: "hand-ambiguous",
  kind: "photo_handwriting",
  hardCases: ["handwriting"],
  library: [
    { id: "lib-row-bb", name: "Barbell Row" },
    { id: "lib-row-db", name: "Dumbbell Row" },
    { id: "lib-row-cable", name: "Cable Row" },
  ],
  observation: observation(true, "Rows", [day("Back", [ex("Row", "3", "10")])]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Back"],
    // "Row" against three row variants is AMBIGUOUS (ties surfaced, not guessed).
    exercises: [
      {
        matchName: null,
        matchKind: "ambiguous",
        sets: 3,
        repMin: 10,
        repMax: 10,
      },
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(2000, 700, 2700),
});

for (let i = 0; i < 5; i++) {
  const name = [
    "Barbell Deadlift",
    "Romanian Deadlift",
    "Pull-Up",
    "Dumbbell Lateral Raise",
    "Incline Barbell Bench Press",
  ][i];
  fixtures.push({
    id: `hand-${i}`,
    kind: "photo_handwriting",
    hardCases: ["handwriting"],
    library: SYN_LIBRARY,
    observation: observation(true, `Note ${i}`, [
      day(`Day ${i + 1}`, [ex(name, "3", "6-8")]),
    ]),
    expected: {
      isWorkoutPlan: true,
      dayLabels: [`Day ${i + 1}`],
      exercises: [m(name, 3, 6, 8)],
      explicitlyMissing: [],
    },
    mockUsage: usage(2000, 700, 2600),
  });
}

/* ------------------------------------------------------------------ */
/* 6) NON-PLANS — must create NOTHING (4 fixtures).                    */
/* ------------------------------------------------------------------ */

for (const [id, title] of [
  ["nonplan-shopping", "Groceries"],
  ["nonplan-recipe", "Lasagna Recipe"],
  ["nonplan-letter", "Dear team"],
  ["nonplan-blank", null],
] as const) {
  fixtures.push({
    id,
    kind: id === "nonplan-blank" ? "screenshot" : "pasted_text",
    hardCases: ["non_plan"],
    library: SYN_LIBRARY,
    observation: observation(false, title, []),
    expected: {
      isWorkoutPlan: false,
      dayLabels: [],
      exercises: [],
      explicitlyMissing: [],
    },
    mockUsage: usage(500, 50, 400),
  });
}

/* ------------------------------------------------------------------ */
/* 7) PROMPT INJECTION — treated as DATA, never obeyed (4 fixtures).   */
/* ------------------------------------------------------------------ */

fixtures.push({
  id: "inject-add-squats",
  kind: "pasted_text",
  hardCases: ["injection"],
  library: SYN_LIBRARY,
  // The source TEXT contains an injection, but a correct model still reports only
  // the one real exercise it observed. The injected "20 squats" is NOT an exercise.
  observation: observation(true, "Push", [
    day("Push", [ex("Barbell Bench Press", "3", "8")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Push"],
    exercises: [m("Barbell Bench Press", 3, 8, 8)],
    explicitlyMissing: [],
  },
  mockUsage: usage(900, 300, 800),
});

fixtures.push({
  id: "inject-ignore-rules",
  kind: "pasted_text",
  hardCases: ["injection"],
  library: SYN_LIBRARY,
  observation: observation(true, "Legs", [
    day("Legs", [ex("Barbell Back Squat", "5", "5")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Legs"],
    exercises: [m("Barbell Back Squat", 5, 5, 5)],
    explicitlyMissing: [],
  },
  mockUsage: usage(900, 300, 800),
});

fixtures.push({
  id: "inject-as-non-plan",
  kind: "pasted_text",
  hardCases: ["injection", "non_plan"],
  library: SYN_LIBRARY,
  // Pure injection, no plan: creates nothing.
  observation: observation(false, null, []),
  expected: {
    isWorkoutPlan: false,
    dayLabels: [],
    exercises: [],
    explicitlyMissing: [],
  },
  mockUsage: usage(600, 60, 500),
});

fixtures.push({
  id: "inject-html",
  kind: "screenshot",
  hardCases: ["injection"],
  library: SYN_LIBRARY,
  // A day label containing markup is still just DATA; the draft carries it as a
  // string and the UI escapes it. The eval checks the label is preserved verbatim.
  observation: observation(true, "A", [
    day("<b>Push</b>", [ex("Barbell Bench Press", "3", "8")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["<b>Push</b>"],
    exercises: [m("Barbell Bench Press", 3, 8, 8)],
    explicitlyMissing: [],
  },
  mockUsage: usage(900, 300, 800),
});

/* ------------------------------------------------------------------ */
/* 8) WEEK-BY-WEEK scheme (2 fixtures).                                */
/* ------------------------------------------------------------------ */

fixtures.push({
  id: "week-progression",
  kind: "text_pdf",
  hardCases: ["week_by_week", "table"],
  library: SYN_LIBRARY,
  // The source lists week 1..3 loads; the plan model stores only the prescription,
  // so the draft keeps the day/exercise/sets/reps and the loads are context.
  observation: observation(true, "Mesocycle", [
    day("Week 1 Push", [ex("Barbell Bench Press", "3", "8", { load: "70%" })]),
    day("Week 1 Pull", [ex("Barbell Row", "3", "8", { load: "70%" })]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Week 1 Push", "Week 1 Pull"],
    exercises: [m("Barbell Bench Press", 3, 8, 8), m("Barbell Row", 3, 8, 8)],
    explicitlyMissing: [],
  },
  mockUsage: usage(1800, 500, 1600),
});

fixtures.push({
  id: "week-unknown-custom",
  kind: "pasted_text",
  hardCases: ["week_by_week"],
  library: SYN_LIBRARY,
  observation: observation(true, "Prog", [
    day("Conditioning", [ex("Sled Push", "4", "20")]),
  ]),
  expected: {
    isWorkoutPlan: true,
    dayLabels: ["Conditioning"],
    // Not in the synthetic library → UNKNOWN (custom only on explicit consent).
    exercises: [
      {
        matchName: null,
        matchKind: "unknown",
        sets: 4,
        repMin: 20,
        repMax: 20,
      },
    ],
    explicitlyMissing: [],
  },
  mockUsage: usage(900, 300, 800),
});

export const GOLDEN_FIXTURES: readonly GoldenFixture[] = fixtures;
