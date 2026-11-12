import { buildImportDraft } from "@/lib/import/draft/build";
import { matchExercise, type MatchOutcome } from "@/lib/import/match/matcher";
import type { SourceTextPart } from "@/lib/import/draft/evidence";
import type { ImportDraft } from "@/lib/import/draft/types";
import type { GoldenExercise, GoldenFixture } from "./types";

/**
 * Workout Plan Import & Review (OVE-109, blueprint §7.3) — the golden-set eval
 * runner. It drives each fixture's observation through the SAME deterministic
 * parse + catalog match + draft build the product uses, then scores the resulting
 * draft against the fixture's human-annotated ground truth.
 *
 * It is PROVIDER-AGNOSTIC: in the default MOCKED run the fixture's observation IS
 * the stand-in for the model output (no network, no cost). A real-provider run
 * (owner-gated) would replace `observation` with the live model's output and keep
 * the SAME scoring. Mocked and real evidence are never mixed — the caller labels
 * which mode produced a report (see the test and the run report).
 *
 * Metrics (blueprint §7.3):
 *  - per-field precision/recall for day labels, exercise sets, rep ranges;
 *  - explicit-missing accuracy (the draft marks a genuinely-absent field as
 *    missing/needed, never guessed);
 *  - ambiguity recognition (a tie is surfaced, not resolved);
 *  - hallucination rate (a draft value with no stated source field);
 *  - catalog match accuracy (matched/ambiguous/unknown vs ground truth);
 *  - cost/latency per source kind (from the fixture's synthetic usage, mocked).
 */

export type Counts = { tp: number; fp: number; fn: number };

export type EvalReport = {
  mode: "mocked" | "real";
  fixtureCount: number;
  byKind: Record<string, number>;
  byHardCase: Record<string, number>;
  dayLabel: Counts;
  sets: Counts;
  repRange: Counts;
  catalog: { correct: number; total: number };
  ambiguityRecognized: { correct: number; total: number };
  explicitMissing: { correct: number; total: number };
  hallucinations: number;
  notAPlan: { correct: number; total: number };
  cost: {
    totalInputTokens: number;
    totalOutputTokens: number;
    avgLatencyMs: number;
    byKind: Record<string, { attempts: number; avgLatencyMs: number }>;
  };
};

function emptyCounts(): Counts {
  return { tp: 0, fp: 0, fn: 0 };
}

/** A matched/ambiguous/unknown outcome for one observed raw name. */
function matchFor(
  fixture: GoldenFixture,
  rawName: string | null,
): MatchOutcome {
  if (!rawName) return { kind: "unknown", raw: "" };
  return matchExercise(rawName, fixture.library);
}

/** Flatten a draft's exercises in document order. */
function draftExercises(draft: ImportDraft) {
  return draft.days.flatMap((d) => d.exercises);
}

/** Flatten a fixture's ground-truth exercises in document order. */
function expectedExercises(fixture: GoldenFixture): GoldenExercise[] {
  return fixture.expected.exercises;
}

function scoreField(
  counts: Counts,
  expected: number | null,
  actual: number | null,
): void {
  if (expected != null && actual != null) {
    if (expected === actual) counts.tp += 1;
    else {
      counts.fp += 1;
      counts.fn += 1;
    }
  } else if (expected != null && actual == null) {
    counts.fn += 1; // the source stated it; the draft missed it
  } else if (expected == null && actual != null) {
    counts.fp += 1; // the draft invented a value the source lacked (hallucination)
  }
  // expected == null && actual == null → correctly absent, not scored.
}

export function evaluate(
  fixtures: readonly GoldenFixture[],
  mode: "mocked" | "real" = "mocked",
): EvalReport {
  const report: EvalReport = {
    mode,
    fixtureCount: fixtures.length,
    byKind: {},
    byHardCase: {},
    dayLabel: emptyCounts(),
    sets: emptyCounts(),
    repRange: emptyCounts(),
    catalog: { correct: 0, total: 0 },
    ambiguityRecognized: { correct: 0, total: 0 },
    explicitMissing: { correct: 0, total: 0 },
    hallucinations: 0,
    notAPlan: { correct: 0, total: 0 },
    cost: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: 0,
      byKind: {},
    },
  };

  let latencySum = 0;
  const latencyByKind: Record<string, number[]> = {};

  for (const fx of fixtures) {
    report.byKind[fx.kind] = (report.byKind[fx.kind] ?? 0) + 1;
    for (const hc of fx.hardCases)
      report.byHardCase[hc] = (report.byHardCase[hc] ?? 0) + 1;

    // Cost/latency (synthetic in mocked mode).
    report.cost.totalInputTokens += fx.mockUsage.inputTokens;
    report.cost.totalOutputTokens += fx.mockUsage.outputTokens;
    latencySum += fx.mockUsage.latencyMs;
    (latencyByKind[fx.kind] ??= []).push(fx.mockUsage.latencyMs);

    // Build the draft the product would build.
    const rawNames = fx.observation.days.flatMap((d) =>
      d.exercises.map((e) => e.name.raw),
    );
    const matches = rawNames.map((n) => matchFor(fx, n));
    const parts: SourceTextPart[] = [{ index: 0, text: null }];
    const draft = buildImportDraft({
      observation: fx.observation,
      matches,
      parts,
    });

    // Not-a-plan accuracy.
    report.notAPlan.total += 1;
    const draftIsPlan = draft.days.length > 0;
    if (draftIsPlan === fx.expected.isWorkoutPlan) report.notAPlan.correct += 1;
    if (!fx.expected.isWorkoutPlan) {
      // A non-plan must yield no exercises at all; nothing else to score.
      continue;
    }

    // Day labels (precision/recall against the ground-truth label set).
    const actualLabels = draft.days.map((d) => String(d.label.value ?? ""));
    scoreStringSet(report.dayLabel, fx.expected.dayLabels, actualLabels);

    const actualEx = draftExercises(draft);
    const expectedEx = expectedExercises(fx);

    for (let i = 0; i < Math.max(actualEx.length, expectedEx.length); i++) {
      const a = actualEx[i];
      const e = expectedEx[i];
      if (!a || !e) {
        // Structural mismatch (an exercise invented or dropped). Count the sets &
        // reps as a miss/invention accordingly.
        if (a && !e) {
          if (a.sets.value != null) report.sets.fp += 1;
          if (a.repMin.value != null || a.repMax.value != null)
            report.repRange.fp += 1;
          report.hallucinations += 1;
        }
        if (e && !a) {
          if (e.sets != null) report.sets.fn += 1;
          if (e.repMin != null || e.repMax != null) report.repRange.fn += 1;
        }
        continue;
      }

      // Catalog accuracy.
      report.catalog.total += 1;
      if (a.match.kind === e.matchKind) {
        if (e.matchKind === "matched") {
          if (a.match.kind === "matched" && a.match.name === e.matchName)
            report.catalog.correct += 1;
        } else {
          report.catalog.correct += 1;
        }
      }

      // Ambiguity recognition.
      if (e.matchKind === "ambiguous") {
        report.ambiguityRecognized.total += 1;
        if (a.match.kind === "ambiguous")
          report.ambiguityRecognized.correct += 1;
      }

      // Sets + rep range (per-field precision/recall).
      scoreField(report.sets, e.sets, a.sets.value);
      scoreField(report.repRange, e.repMin, a.repMin.value);
      scoreField(report.repRange, e.repMax, a.repMax.value);

      // Hallucination: the draft produced a value where the source stated none.
      if (e.sets == null && a.sets.value != null) report.hallucinations += 1;
      if (e.repMin == null && a.repMin.value != null)
        report.hallucinations += 1;
      if (e.repMax == null && a.repMax.value != null)
        report.hallucinations += 1;
    }

    // Explicit-missing accuracy: a genuinely-absent field is marked missing/needed.
    for (const path of fx.expected.explicitlyMissing) {
      report.explicitMissing.total += 1;
      if (isMarkedMissing(draft, path)) report.explicitMissing.correct += 1;
    }
  }

  report.cost.avgLatencyMs =
    fixtures.length > 0 ? Math.round(latencySum / fixtures.length) : 0;
  for (const [kind, list] of Object.entries(latencyByKind)) {
    report.cost.byKind[kind] = {
      attempts: list.length,
      avgLatencyMs: Math.round(list.reduce((n, x) => n + x, 0) / list.length),
    };
  }
  return report;
}

/** Precision/recall over a multiset of strings. */
function scoreStringSet(
  counts: Counts,
  expected: string[],
  actual: string[],
): void {
  const remaining = [...expected];
  for (const a of actual) {
    const idx = remaining.indexOf(a);
    if (idx >= 0) {
      counts.tp += 1;
      remaining.splice(idx, 1);
    } else {
      counts.fp += 1;
    }
  }
  counts.fn += remaining.length;
}

/** Read a draft field by the ground-truth field path and check it is absent. */
function isMarkedMissing(draft: ImportDraft, path: string): boolean {
  // Paths look like /days/0/exercises/0/sets|repMin|repMax.
  const m = path.match(/\/days\/(\d+)\/exercises\/(\d+)\/(sets|repMin|repMax)/);
  if (!m) return false;
  const [, d, e, field] = m;
  const exercise = draft.days[Number(d)]?.exercises[Number(e)];
  if (!exercise) return false;
  const f = exercise[field as "sets" | "repMin" | "repMax"];
  // Missing means no value AND a missing/needed status (never a silent guess).
  return f.value == null && (f.status === "missing" || f.status === "needed");
}

export function precision(c: Counts): number {
  const denom = c.tp + c.fp;
  return denom === 0 ? 1 : c.tp / denom;
}
export function recall(c: Counts): number {
  const denom = c.tp + c.fn;
  return denom === 0 ? 1 : c.tp / denom;
}
