/**
 * The lifter's real training plan (one-time production import; admin tooling).
 *
 * Plan structure only: gyms, two 6-week blocks (deload week 6), six sessions
 * with ordered exercises / planned sets / rep ranges, and required cardio
 * (type + minutes). Deliberately NOT here: RIR, rest periods, coaching or
 * progression notes, cardio speed / incline / miles / pace / intervals, the
 * optional Wednesday and Saturday cardio, working weights, gym baselines,
 * workout history, and goals — none of these are modeled, or they are
 * learned from real logging.
 */

export type LibraryRef = {
  kind: "library";
  /** Stable free-exercise-db id (the catalog import identity key). */
  sourceId: string;
  /** The production name the id should resolve to. */
  name: string;
  requested: string;
};

export type CustomRef = {
  kind: "custom";
  name: string;
  primaryMuscle: string;
  equipmentType: string;
  secondaryMuscles: string[];
  requested: string;
};

export type ExerciseRef = LibraryRef | CustomRef;

const lib = (
  requested: string,
  sourceId: string,
  name: string,
): LibraryRef => ({
  kind: "library",
  requested,
  sourceId,
  name,
});

export const CUSTOM = {
  cableLateral: {
    kind: "custom",
    requested: "Cable Lateral Raise / Leaning Cable Lateral Raise",
    name: "Cable Lateral Raise",
    primaryMuscle: "shoulders",
    equipmentType: "cable",
    secondaryMuscles: [],
  },
  machinePushdown: {
    kind: "custom",
    requested: "Machine Tricep Pushdown",
    name: "Machine Tricep Pushdown",
    primaryMuscle: "triceps",
    equipmentType: "machine",
    secondaryMuscles: [],
  },
  smithBulgarian: {
    kind: "custom",
    requested: "Bulgarian Split Squat",
    name: "Smith Machine Bulgarian Split Squat",
    primaryMuscle: "quads",
    equipmentType: "machine",
    secondaryMuscles: ["glutes"],
  },
} satisfies Record<string, CustomRef>;

export type SlotPlan = {
  ex: ExerciseRef;
  sets: number;
  repMin: number;
  repMax: number;
};
export type SessionPlan = {
  dayOfWeek: number;
  name: string;
  slots: SlotPlan[];
  cardio?: { type: string; durationMin: number };
};

const s = (
  ex: ExerciseRef,
  sets: number,
  repMin: number,
  repMax: number,
): SlotPlan => ({
  ex,
  sets,
  repMin,
  repMax,
});

export const GYMS = ["EOS DeSoto", "EOS Oak Cliff"] as const;

export const BLOCKS = [
  {
    name: "Fall 2026 — Block 1",
    startDate: "2026-10-12",
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
  },
  {
    name: "Winter 2026 — Block 2",
    startDate: "2026-11-23",
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
  },
] as const;

const INCLINE_WALK = { type: "Incline Treadmill Walk", durationMin: 15 };
const JOG = { type: "Jog Conditioning", durationMin: 25 };

export const SESSIONS: SessionPlan[] = [
  {
    dayOfWeek: 1,
    name: "Push Strength",
    slots: [
      s(
        lib(
          "Barbell Bench Press",
          "Barbell_Bench_Press_-_Medium_Grip",
          "Barbell Bench Press - Medium Grip",
        ),
        2,
        4,
        6,
      ),
      s(
        lib(
          "Incline Dumbbell Press",
          "Incline_Dumbbell_Press",
          "Incline Dumbbell Press",
        ),
        2,
        6,
        10,
      ),
      s(
        lib(
          "Machine Shoulder Press",
          "Machine_Shoulder_Military_Press",
          "Machine Shoulder (Military) Press",
        ),
        2,
        6,
        10,
      ),
      s(CUSTOM.cableLateral, 2, 10, 15),
      s(CUSTOM.machinePushdown, 2, 6, 10),
      s(
        lib(
          "Triceps Rope Pushdown",
          "Triceps_Pushdown_-_Rope_Attachment",
          "Triceps Pushdown - Rope Attachment",
        ),
        2,
        8,
        12,
      ),
    ],
    cardio: INCLINE_WALK,
  },
  {
    dayOfWeek: 2,
    name: "Pull Strength",
    slots: [
      s(lib("Wide-Grip Pull-Ups", "Pullups", "Pullups"), 2, 6, 12),
      s(
        lib("Barbell Row", "Bent_Over_Barbell_Row", "Bent Over Barbell Row"),
        2,
        5,
        8,
      ),
      s(
        lib("Chest-Supported Row", "Leverage_Iso_Row", "Leverage Iso Row"),
        2,
        6,
        10,
      ),
      s(
        lib(
          "Wide-Grip Lat Pulldown",
          "Wide-Grip_Lat_Pulldown",
          "Wide-Grip Lat Pulldown",
        ),
        2,
        8,
        12,
      ),
      s(
        lib(
          "Rear Delt Pec Deck",
          "Reverse_Machine_Flyes",
          "Reverse Machine Flyes",
        ),
        2,
        10,
        15,
      ),
      s(
        lib(
          "Incline Dumbbell Curl",
          "Incline_Dumbbell_Curl",
          "Incline Dumbbell Curl",
        ),
        2,
        8,
        12,
      ),
      s(lib("Hammer Curl", "Hammer_Curls", "Hammer Curls"), 2, 8, 12),
    ],
    cardio: JOG,
  },
  {
    dayOfWeek: 3,
    name: "Legs Strength + Abs",
    slots: [
      s(lib("Hack Squat", "Hack_Squat", "Hack Squat"), 2, 6, 8),
      s(
        lib(
          "Barbell Romanian Deadlift",
          "Romanian_Deadlift",
          "Romanian Deadlift",
        ),
        2,
        6,
        10,
      ),
      s(lib("Leg Press", "Leg_Press", "Leg Press"), 2, 8, 12),
      s(lib("Seated Leg Curl", "Seated_Leg_Curl", "Seated Leg Curl"), 2, 8, 12),
      s(
        lib(
          "Standing Calf Raise",
          "Standing_Calf_Raises",
          "Standing Calf Raises",
        ),
        3,
        8,
        12,
      ),
      s(lib("Sit-Ups", "Sit-Up", "Sit-Up"), 2, 12, 20),
      s(
        lib("Weighted Side Bend", "Dumbbell_Side_Bend", "Dumbbell Side Bend"),
        2,
        10,
        15,
      ),
    ],
  },
  {
    dayOfWeek: 4,
    name: "Push Hypertrophy + Abs",
    slots: [
      s(
        lib(
          "Smith Machine Incline Press",
          "Smith_Machine_Incline_Bench_Press",
          "Smith Machine Incline Bench Press",
        ),
        2,
        6,
        10,
      ),
      s(
        lib(
          "Plate-Loaded Chest Press",
          "Leverage_Chest_Press",
          "Leverage Chest Press",
        ),
        2,
        8,
        12,
      ),
      s(lib("Pec Deck", "Butterfly", "Butterfly"), 2, 10, 15),
      s(CUSTOM.cableLateral, 3, 10, 15),
      s(
        lib(
          "EZ-Bar Skull Crushers",
          "EZ-Bar_Skullcrusher",
          "EZ-Bar Skullcrusher",
        ),
        2,
        8,
        12,
      ),
      s(
        lib("Two-Arm Cable Pushdown", "Triceps_Pushdown", "Triceps Pushdown"),
        2,
        8,
        12,
      ),
      s(lib("Crunches", "Crunches", "Crunches"), 2, 12, 20),
      s(
        lib("Weighted Russian Twist", "Russian_Twist", "Russian Twist"),
        2,
        10,
        15,
      ),
    ],
    cardio: INCLINE_WALK,
  },
  {
    dayOfWeek: 5,
    name: "Pull Hypertrophy",
    slots: [
      s(
        lib("Neutral-Grip Lat Pulldown", "V-Bar_Pulldown", "V-Bar Pulldown"),
        2,
        6,
        10,
      ),
      s(
        lib(
          "One-Arm Dumbbell Row",
          "One-Arm_Dumbbell_Row",
          "One-Arm Dumbbell Row",
        ),
        2,
        8,
        12,
      ),
      s(
        lib("Seated Cable Row", "Seated_Cable_Rows", "Seated Cable Rows"),
        2,
        8,
        12,
      ),
      s(
        lib(
          "Straight-Arm Pulldown",
          "Straight-Arm_Pulldown",
          "Straight-Arm Pulldown",
        ),
        2,
        10,
        15,
      ),
      s(
        lib(
          "Rear Delt Cable Fly",
          "Cable_Rear_Delt_Fly",
          "Cable Rear Delt Fly",
        ),
        2,
        10,
        15,
      ),
      s(lib("Preacher Curl", "Preacher_Curl", "Preacher Curl"), 2, 8, 12),
      s(
        lib(
          "Cable Curl",
          "Standing_Biceps_Cable_Curl",
          "Standing Biceps Cable Curl",
        ),
        2,
        8,
        12,
      ),
    ],
    cardio: JOG,
  },
  {
    dayOfWeek: 6,
    name: "Legs Volume + Abs",
    slots: [
      s(lib("Hack Squat", "Hack_Squat", "Hack Squat"), 2, 8, 12),
      s(CUSTOM.smithBulgarian, 2, 8, 10),
      s(
        lib("Hip Thrust", "Barbell_Hip_Thrust", "Barbell Hip Thrust"),
        2,
        8,
        12,
      ),
      s(lib("Seated Leg Curl", "Seated_Leg_Curl", "Seated Leg Curl"), 2, 8, 12),
      s(lib("Leg Extension", "Leg_Extensions", "Leg Extensions"), 2, 10, 15),
      s(
        lib("Seated Calf Raise", "Seated_Calf_Raise", "Seated Calf Raise"),
        3,
        8,
        12,
      ),
      s(lib("Sit-Ups", "Sit-Up", "Sit-Up"), 2, 12, 20),
      s(
        lib("Weighted Russian Twist", "Russian_Twist", "Russian Twist"),
        2,
        10,
        15,
      ),
    ],
  },
];

/** Every distinct exercise the plan references. */
export function planExercises(): ExerciseRef[] {
  const seen = new Map<string, ExerciseRef>();
  for (const session of SESSIONS) {
    for (const slot of session.slots) {
      const key =
        slot.ex.kind === "library"
          ? `lib:${slot.ex.sourceId}`
          : `custom:${slot.ex.name}`;
      if (!seen.has(key)) seen.set(key, slot.ex);
    }
  }
  return [...seen.values()];
}

export const refKey = (ex: ExerciseRef) =>
  ex.kind === "library" ? `lib:${ex.sourceId}` : `custom:${ex.name}`;
