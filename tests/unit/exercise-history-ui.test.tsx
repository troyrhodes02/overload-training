import { renderToStaticMarkup } from "react-dom/server";
import { ExerciseRecords } from "@/components/exercises/history/exercise-records";
import { SessionHistoryList } from "@/components/exercises/history/session-history-list";
import { ExerciseGoals } from "@/components/exercises/history/exercise-goals";
import { ExerciseTrend } from "@/components/exercises/history/exercise-trend";
import type { SessionRowDto, TrendDto } from "@/lib/progression/history-types";
import type { ExerciseGoalsDto } from "@/lib/goals/queries";

/**
 * Exercise History & PR Intelligence — rendering (design doc §4–§7; preview
 * §01–§06). Records read as records (labels, values, dates; no badge, icon,
 * or colour), an estimate says so, Hold is a muted word, every call state has
 * its words, and reps-only lifts never show a load.
 */

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const set = (weightLbs: number, reps: number, dateLabel: string) => ({
  weightLbs,
  reps,
  dateIso: "2026-10-09",
  dateLabel,
});

describe("ExerciseRecords", () => {
  const html = renderToStaticMarkup(
    <ExerciseRecords
      scopeName={null}
      records={{
        kind: "loaded",
        bestSet: set(185, 10, "Oct 9"),
        bestE1rm: 247,
        heaviest: set(205, 5, "Aug 28"),
        repRecords: [
          set(205, 5, "Aug 28"),
          set(195, 6, "Aug 25"),
          set(185, 10, "Oct 9"),
        ],
      }}
    />,
  );

  it("labels the actual set, the estimate (in words), heaviest, and rep records", () => {
    const t = text(html);
    expect(t).toContain("Best set 185 × 10 lb Oct 9");
    expect(t).toContain("Best e1RM · estimate 247 lb from 185 × 10");
    expect(t).toContain("Heaviest weight 205 × 5 Aug 28");
    expect(t).toContain(
      "Rep records · most reps at this weight or heavier Weight Reps Date 205 lb 5 Aug 28 195 lb 6 Aug 25 185 lb 10 Oct 9",
    );
    expect(t).toContain(
      "Working sets of finished workouts. Deload weeks don't count.",
    );
    expect(html).toContain('<th scope="col"');
  });

  it("is a record, not a reward: no tag colours, badges, icons, or 'new'", () => {
    expect(html).not.toMatch(
      /text-progress|text-deload|bg-progress|<svg|badge/i,
    );
    expect(text(html)).not.toMatch(/new|!|PR\b/);
  });

  it("names the gym for a machine", () => {
    const m = renderToStaticMarkup(
      <ExerciseRecords
        scopeName="Downtown Gym"
        records={{
          kind: "loaded",
          bestSet: set(150, 10, "Sep 28"),
          bestE1rm: 200,
          heaviest: set(150, 10, "Sep 28"),
          repRecords: [set(150, 10, "Sep 28")],
        }}
      />,
    );
    expect(text(m)).toMatch(/^Records · Downtown Gym/);
  });

  it("bodyweight: most reps only — no load, no e1RM", () => {
    const b = text(
      renderToStaticMarkup(
        <ExerciseRecords
          scopeName={null}
          records={{
            kind: "bodyweight",
            mostReps: { reps: 20, dateIso: "2026-10-06", dateLabel: "Oct 6" },
          }}
        />,
      ),
    );
    expect(b).toContain("Most reps in a set 20 reps Oct 6");
    expect(b).not.toMatch(/\blb\b|e1RM/);
  });
});

function sessionRow(over: Partial<SessionRowDto>): SessionRowDto {
  return {
    loggedExerciseId: "le",
    loggedSessionId: "ls-1",
    dateIso: "2026-10-20",
    dateLabel: "Oct 20",
    gymName: "Downtown Gym",
    gymArchived: false,
    workingSets: [
      { weightLbs: 185, reps: 10, rir: 2 },
      { weightLbs: 185, reps: 10, rir: 1 },
      { weightLbs: 185, reps: 10, rir: null },
    ],
    extraSets: [],
    plannedSets: 3,
    swappedFromName: null,
    call: "progress",
    ...over,
  };
}

describe("SessionHistoryList", () => {
  const rows: SessionRowDto[] = [
    sessionRow({ loggedExerciseId: "a" }),
    sessionRow({ loggedExerciseId: "b", call: "hold", dateLabel: "Oct 16" }),
    sessionRow({ loggedExerciseId: "c", call: "deload_week" }),
    sessionRow({
      loggedExerciseId: "d",
      call: "not_counted",
      workingSets: [{ weightLbs: 185, reps: 9, rir: null }],
    }),
    sessionRow({ loggedExerciseId: "e", call: "in_progress" }),
    sessionRow({ loggedExerciseId: "f", call: "insufficient" }),
    sessionRow({ loggedExerciseId: "g", call: "stalled" }),
    sessionRow({ loggedExerciseId: "h", call: "deload" }),
    sessionRow({
      loggedExerciseId: "i",
      call: "hold",
      swappedFromName: "Incline Dumbbell Press",
      extraSets: [{ weightLbs: 135, reps: 15 }],
      gymArchived: true,
    }),
  ];
  const html = renderToStaticMarkup(
    <SessionHistoryList
      rows={rows}
      total={14}
      showingAll={false}
      externalLoad
      noGymScope={false}
      viewAllHref="/exercises/x?sessions=all"
      recentOnlyHref="/exercises/x"
      scopeName={null}
    />,
  );
  const t = text(html);

  it("prints the sets as logged, RIR when recorded, and a dated link to the workout", () => {
    expect(t).toContain(
      "Oct 20 · Downtown Gym Progress 185 × 10 · 10 · 10 RIR 2 · 1 · –",
    );
    expect(html).toContain('href="/history/ls-1"');
    expect(t).toContain("185 × 10 · 10 · 10 + 135 × 15");
    expect(t).toContain("Downtown Gym (archived)");
    expect(t).toContain("In place of Incline Dumbbell Press");
  });

  it("every call state has its words; Hold is a muted word, never a badge", () => {
    for (const w of [
      "Hold",
      "Deload week",
      "Not counted",
      "1 of 3 planned sets",
      "In progress",
      "Not enough history",
      "Hold — trend flat",
      "Deload",
    ]) {
      expect(t).toContain(w);
    }
    expect(html).toMatch(
      /<span class="shrink-0 text-xs text-muted-foreground">Hold<\/span>/,
    );
  });

  it("offers every session when only the recent ones are shown", () => {
    expect(t).toContain("View all 14 sessions");
    expect(html).toContain('href="/exercises/x?sessions=all"');
  });

  it("the no-gym scope says why there are no calls", () => {
    const n = text(
      renderToStaticMarkup(
        <SessionHistoryList
          rows={[sessionRow({ call: "none", gymName: null })]}
          total={1}
          showingAll
          externalLoad
          noGymScope
          viewAllHref=""
          recentOnlyHref=""
          scopeName="No gym recorded"
        />,
      ),
    );
    expect(n).toContain(
      "Machine calls are made per gym, so these sessions have none.",
    );
    expect(n).not.toMatch(/Progress|Hold|View all/);
  });

  it("reps-only rows never print a load", () => {
    const b = text(
      renderToStaticMarkup(
        <SessionHistoryList
          rows={[
            sessionRow({
              workingSets: [
                { weightLbs: null, reps: 20, rir: null },
                { weightLbs: null, reps: 20, rir: null },
              ],
              plannedSets: 2,
            }),
          ]}
          total={1}
          showingAll
          externalLoad={false}
          noGymScope={false}
          viewAllHref=""
          recentOnlyHref=""
          scopeName={null}
        />,
      ),
    );
    expect(b).toContain("20 · 20 reps");
    expect(b).not.toMatch(/\blb\b|×/);
  });
});

describe("ExerciseGoals", () => {
  const goals: ExerciseGoalsDto = {
    active: {
      goalId: "g1",
      exerciseId: "ex",
      exerciseName: "Barbell Bench Press",
      exerciseArchived: false,
      gymId: null,
      gymName: null,
      gymArchived: false,
      targetWeightLbs: 225,
      targetReps: 5,
      targetLabel: "225 lb × 5",
      createdAtIso: "2026-09-01T00:00:00.000Z",
      createdLabel: "Sep 1, 2026",
      percent: 93,
      targetE1rm: 263,
      best: {
        e1rm: 247,
        weightLbs: 185,
        reps: 10,
        dateIso: "2026-10-09",
        dateLabel: "Fri, Oct 9",
      },
    },
    past: [
      {
        goalId: "g0",
        exerciseId: "ex",
        exerciseName: "Barbell Bench Press",
        exerciseArchived: false,
        gymId: null,
        gymName: null,
        gymArchived: false,
        targetWeightLbs: 205,
        targetReps: 5,
        targetLabel: "205 lb × 5",
        createdAtIso: "2026-08-01T00:00:00.000Z",
        createdLabel: "Aug 1, 2026",
        outcome: "completed",
        archivedAtIso: "2026-08-28T00:00:00.000Z",
        archivedLabel: "Aug 28, 2026",
      },
    ],
    newGoalEligible: false,
    bodyweight: false,
  };

  it("the active goal with the Goals numbers, then past goals; rows open the goal", () => {
    const html = renderToStaticMarkup(
      <ExerciseGoals goals={goals} newGoalHref={null} />,
    );
    const t = text(html);
    expect(t).toContain("225 lb × 5 93% Best 185 × 10 · Fri, Oct 9");
    expect(t).toContain("Past 205 lb × 5 · Reached Aug 28, 2026");
    expect(html).toContain('href="/goals/g1"');
    expect(html).toContain('href="/goals/g0"');
    expect(t).not.toContain("Set a goal");
  });

  it("no goal: offers the existing form only when eligible", () => {
    const none = { ...goals, active: null, past: [], newGoalEligible: true };
    const html = renderToStaticMarkup(
      <ExerciseGoals goals={none} newGoalHref="/goals/new/ex?gymId=g" />,
    );
    expect(text(html)).toBe("Goals No goal on this lift. Set a goal");
    expect(html).toContain('href="/goals/new/ex?gymId=g"');
  });

  it("bodyweight says why there are none", () => {
    const html = renderToStaticMarkup(
      <ExerciseGoals
        goals={{
          active: null,
          past: [],
          newGoalEligible: false,
          bodyweight: true,
        }}
        newGoalHref={null}
      />,
    );
    expect(text(html)).toBe(
      "Goals Goals use a weight × reps target, so reps-only lifts don't have them.",
    );
  });
});

describe("ExerciseTrend", () => {
  const point = (value: number, scheduledDeload = false) => ({
    dateIso: "2026-10-20",
    dateLabel: "Oct 20",
    value,
    scheduledDeload,
    setsLabel: "185 × 10 · 10 · 10",
  });
  const trend = (values: number[]): TrendDto => ({
    points: values.map((v) => point(v)),
    latest: values.at(-1) ?? null,
  });

  it("loaded: e1RM and Weight tabs; one point is a sentence, never a chart", () => {
    const html = renderToStaticMarkup(
      <ExerciseTrend
        e1rm={trend([234])}
        weight={trend([185])}
        reps={null}
        scopeName={null}
      />,
    );
    const t = text(html);
    expect(t).toContain("e1RM");
    expect(t).toContain("Weight");
    expect(t).toContain(
      "One session so far: e1RM 234 lb. The trend starts at two.",
    );
    expect(html).not.toContain("<svg");
  });

  it("two or more points: the latest value and the footnote", () => {
    const t = text(
      renderToStaticMarkup(
        <ExerciseTrend
          e1rm={trend([240, 247])}
          weight={trend([185, 185])}
          reps={null}
          scopeName="Downtown Gym"
        />,
      ),
    );
    expect(t).toContain("Trend · Downtown Gym");
    expect(t).toContain("Current 247 lb");
    expect(t).toContain("2 sessions at Downtown Gym · Epley estimate");
  });

  it("the no-gym scope's footnote doesn't put the label in a sentence", () => {
    const t = text(
      renderToStaticMarkup(
        <ExerciseTrend
          e1rm={trend([240, 247])}
          weight={null}
          reps={null}
          scopeName="No gym recorded"
          noGymScope
        />,
      ),
    );
    expect(t).toContain("2 sessions with no gym recorded · Epley estimate");
    expect(t).not.toContain("at No gym recorded");
  });

  it("bodyweight: one Reps view, no tabs, no load", () => {
    const html = renderToStaticMarkup(
      <ExerciseTrend
        e1rm={null}
        weight={null}
        reps={trend([18, 20])}
        scopeName={null}
      />,
    );
    expect(html).not.toContain('role="tablist"');
    const t = text(html);
    expect(t).toContain("Last 20 reps");
    expect(t).toContain("2 sessions · most reps in a working set");
    expect(t).not.toMatch(/\blb\b|e1RM/);
  });
});
