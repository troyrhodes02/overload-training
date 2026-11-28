import "server-only";
import type { Account } from "@/lib/data/account";
import { accountToday } from "@/lib/data/account";
import { isUuid } from "@/lib/actions/result";
import { isGymVariable } from "@overload/shared/exercises/gym-variable";
import { requiresExternalWeight } from "@overload/shared/exercises/loading-mode";
import { formatMonthDay } from "@overload/shared/plan/calendar";
import { byDate } from "@overload/shared/progression/engine";
import {
  callsBySession,
  computeRecords,
  e1rmPoints,
  latestValue,
  projectedE1rmPoints,
  RECENT_SESSIONS,
  repsPoints,
  weightPoints,
  type HistoryRow,
  type JudgedHistoryRow,
  type RecordSet,
  type TrendPoint,
} from "@overload/shared/progression/history";
import { formatSetLine } from "@overload/shared/progression/history-format";
import {
  describeScope,
  gatherRows,
  gatherWingItRows,
  type PerformanceRow,
  type StrengthRow,
} from "./queries";
import {
  anchorOfRow,
  rowSegmentEndingAt,
  segmentRows,
  type RowAnchor,
} from "./recurring";
import { prescriptionOf } from "@overload/shared/progression/recurring";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { gateHistory } from "@/lib/entitlements/gate";
import type {
  ExerciseHistoryDto,
  ExerciseRecordsDto,
  HistoryNextDto,
  HistoryScopeDto,
  HistoryWorkoutNextDto,
  RecordSetDto,
  TrendDto,
} from "@overload/shared/progression/history-types";

/**
 * Exercise History & PR Intelligence — the page's one read (spec §11.2).
 *
 * Gathers the exercise's performances ONCE through the account-scoped layer,
 * picks one scope (every gym for a gym-consistent exercise; one gym — or the
 * legacy "no gym recorded" rows — for a machine or cable), and projects only
 * that scope's rows: the current call through `describeScope` (the same
 * description the progression section has always shown), and records, the
 * call each session led to, and trend points through the pure history module.
 * Read-only: no write, no transaction, no goal reconciliation. Nothing it
 * returns is stored anywhere.
 */

export type {
  ExerciseHistoryDto,
  ExerciseRecordsDto,
  HistoryNextDto,
  HistoryScopeDto,
  RecordSetDto,
  SessionCallKind,
  SessionRowDto,
  TrendDto,
  TrendPointDto,
} from "@overload/shared/progression/history-types";

const GLOBAL = "global";
const NO_GYM = "none";

type Scope = HistoryScopeDto & {
  gymId: string | null;
  latestIso: string;
  latestFinishedIso: string | null;
};

/** Machine/cable scopes: one per gym with history, plus legacy no-gym rows (R5). */
function machineScopes(rows: StrengthRow[]): Scope[] {
  const byKey = new Map<string, Scope>();
  for (const r of rows) {
    const key = r.perf.gymId ?? NO_GYM;
    const scope = byKey.get(key) ?? {
      key,
      label:
        r.perf.gymId === null
          ? "No gym recorded"
          : `${r.gymName ?? "Gym"}${r.gymArchived ? " (archived)" : ""}`,
      archived: r.perf.gymId !== null && r.gymArchived,
      gymId: r.perf.gymId,
      latestIso: "",
      latestFinishedIso: null,
    };
    if (r.perf.dateIso > scope.latestIso) scope.latestIso = r.perf.dateIso;
    if (
      r.finished &&
      (scope.latestFinishedIso === null ||
        r.perf.dateIso > scope.latestFinishedIso)
    ) {
      scope.latestFinishedIso = r.perf.dateIso;
    }
    byKey.set(key, scope);
  }
  return [...byKey.values()].sort((a, b) => {
    if ((a.gymId === null) !== (b.gymId === null))
      return a.gymId === null ? 1 : -1;
    if (a.latestIso !== b.latestIso) return a.latestIso > b.latestIso ? -1 : 1;
    return a.label < b.label ? -1 : 1;
  });
}

/**
 * The requested scope when it is one of this exercise's (R25: anything else —
 * another account's gym id included — is ignored, never an error); otherwise
 * the gym trained at most recently in a finished workout, else the most
 * recent at all (R5).
 */
function pickScope(
  scopes: Scope[],
  requested: string | null | undefined,
): Scope | null {
  if (requested) {
    const hit = scopes.find(
      (s) => s.key === requested && (requested === NO_GYM || isUuid(requested)),
    );
    if (hit) return hit;
  }
  const gyms = scopes.filter((s) => s.gymId !== null);
  const finished = gyms
    .filter((s) => s.latestFinishedIso !== null)
    .sort((a, b) =>
      (a.latestFinishedIso as string) > (b.latestFinishedIso as string)
        ? -1
        : 1,
    );
  return finished[0] ?? gyms[0] ?? scopes[0] ?? null;
}

/**
 * The recurring workouts "Next time" speaks for (RD-12): every session of the
 * active block that plans this exercise, in the block's order, anchored on
 * the plan's rep range; with none, the workout of the scope's most recent
 * performance, anchored on its copied range.
 */
async function workoutAnchors(
  account: Account,
  exerciseId: string,
  scopeRows: PerformanceRow[],
  opts: { gymVariable: boolean; gymId: string | null },
): Promise<{ sessionName: string; anchor: RowAnchor }[]> {
  const planned = await account.db.sessionExercise.findMany({
    where: { exerciseId, session: { mesocycle: { status: "active" } } },
    select: {
      targetRepMin: true,
      targetRepMax: true,
      session: { select: { name: true, lineageId: true, position: true } },
    },
  });
  if (planned.length > 0) {
    return planned
      .slice()
      .sort((a, b) => a.session.position - b.session.position)
      .map((se) => ({
        sessionName: se.session.name,
        anchor: {
          key: {
            lineageId: se.session.lineageId,
            exerciseId,
            gymId: opts.gymId,
          },
          prescription: prescriptionOf(se),
          gymVariable: opts.gymVariable,
        },
      }));
  }
  const newest = scopeRows.slice().sort((a, b) => byDate(b.perf, a.perf))[0];
  if (!newest) return [];
  return [
    {
      sessionName: newest.sessionName ?? "Workout",
      anchor: anchorOfRow(newest, exerciseId, opts.gymVariable),
    },
  ];
}

const toHistoryRow = (r: StrengthRow): HistoryRow => ({
  perf: r.perf,
  finished: r.finished,
  extraSets: r.extraSets,
});
const toJudgedRow = (r: PerformanceRow): JudgedHistoryRow => ({
  perf: r.perf,
  finished: r.finished,
  extraSets: r.extraSets,
});

export async function getExerciseHistory(
  account: Account,
  exerciseId: string,
  opts: { scope?: string | null; allSessions?: boolean } = {},
): Promise<ExerciseHistoryDto | null> {
  const dto = await computeExerciseHistory(account, exerciseId, opts);
  if (!dto) return null;
  const resolved = await resolveEntitlement(account);
  return gateHistory(dto, resolved);
}

async function computeExerciseHistory(
  account: Account,
  exerciseId: string,
  opts: { scope?: string | null; allSessions?: boolean } = {},
): Promise<Omit<ExerciseHistoryDto, "locked"> | null> {
  if (!isUuid(exerciseId)) return null;
  const exercise = await account.db.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true, name: true, equipmentType: true, deletedAt: true },
  });
  if (!exercise) return null;

  const gymVariable = isGymVariable(exercise);
  const externalLoad = requiresExternalWeight(exercise);
  // Every gathered row feeds the current call (exactly as the progression
  // section reads it); only rows with a logged set are sessions on this page.
  // Wing-It performances (Pitch 25) are sessions, records, and trend points
  // too, but never feed a call: the engine's rows stay planned (RD-25).
  const [allRows, wingItRows] = await Promise.all([
    gatherRows(account, exerciseId),
    gatherWingItRows(account, exerciseId),
  ]);
  const hasSets = (r: StrengthRow) =>
    r.perf.workingSets.length + r.extraSets.length > 0;
  const rows: StrengthRow[] = [
    ...allRows.filter(hasSets),
    ...wingItRows.filter(hasSets),
  ];

  const scopes = gymVariable ? machineScopes(rows) : [];
  const selected: Scope | null = gymVariable
    ? pickScope(scopes, opts.scope)
    : rows.length > 0
      ? {
          key: GLOBAL,
          label: "",
          archived: false,
          gymId: null,
          latestIso: "",
          latestFinishedIso: null,
        }
      : null;
  const noGymScope = gymVariable && selected?.key === NO_GYM;
  const scopeRows = !selected
    ? []
    : gymVariable
      ? rows.filter((r) => (r.perf.gymId ?? NO_GYM) === selected.key)
      : rows;
  const historyRows = scopeRows.map(toHistoryRow);
  // The rows the engine may judge: planned performances in scope.
  const plannedScopeRows = scopeRows.filter(
    (r): r is PerformanceRow => r.wingIt !== true,
  );
  // Segments are cut over EVERY gathered row in scope (review of #227),
  // exactly as the card, Today, and the summary cut them — a skipped
  // occurrence with no sets still breaks a run — so the page and the card
  // never judge one occurrence on different evidence.
  const segmentScope = !selected
    ? []
    : gymVariable
      ? allRows.filter((r) => (r.perf.gymId ?? NO_GYM) === selected.key)
      : allRows;

  const today = accountToday(account);
  const label = (iso: string) => formatMonthDay(iso, today);

  // "Next time" per recurring workout (Prescription-Aware Intelligence
  // §7.5; RD-12): the call each workout's card would give next, judged on its
  // own comparable run within this scope.
  let next: HistoryNextDto | null = null;
  let nextByWorkout: HistoryWorkoutNextDto[] = [];
  if (selected && noGymScope) {
    next = { kind: "no_gym" };
  } else if (selected && plannedScopeRows.length > 0) {
    const gym =
      gymVariable && selected.gymId
        ? { id: selected.gymId, name: scopeRows[0]?.gymName ?? "Gym" }
        : null;
    const entries = await workoutAnchors(
      account,
      exercise.id,
      plannedScopeRows,
      {
        gymVariable,
        gymId: gymVariable ? selected.gymId : null,
      },
    );
    nextByWorkout = await Promise.all(
      entries.map(async (e) => {
        const d = await describeScope(
          account,
          exercise,
          segmentRows(segmentScope, exercise.id, e.anchor),
          gym,
          "next",
        );
        return {
          sessionName: e.sessionName,
          repRange: {
            min: e.anchor.prescription.repMin,
            max: e.anchor.prescription.repMax,
          },
          next: {
            kind: "call" as const,
            tag: d.tag,
            recommendation: d.recommendation,
            insufficientNote: d.insufficientNote,
          },
        };
      }),
    );
    next = nextByWorkout.length === 1 ? nextByWorkout[0].next : null;
  }

  const recordDto = (s: RecordSet): RecordSetDto => ({
    weightLbs: s.weightLbs as number,
    reps: s.reps,
    dateIso: s.dateIso,
    dateLabel: label(s.dateIso),
  });
  const rec = computeRecords(historyRows, externalLoad);
  const records: ExerciseRecordsDto | null = !rec
    ? null
    : rec.kind === "bodyweight"
      ? {
          kind: "bodyweight",
          mostReps: {
            reps: rec.mostReps.reps,
            dateIso: rec.mostReps.dateIso,
            dateLabel: label(rec.mostReps.dateIso),
          },
        }
      : {
          kind: "loaded",
          bestSet: recordDto(rec.bestSet),
          bestE1rm: Math.round(rec.bestE1rm),
          heaviest: recordDto(rec.heaviest),
          repRecords: rec.repRecords.map(recordDto),
        };

  // Projected-capacity overlay for the e1RM view (OVE-80): a speculative point
  // per session that had a projectable set, keyed by its loggedExerciseId so it
  // attaches to the concrete e1RM point for the same session. Never alters the
  // concrete `value` or `latest`.
  const projectedByExercise = new Map(
    projectedE1rmPoints(historyRows).map((p) => [p.loggedExerciseId, p.value]),
  );

  const trendOf = (
    pts: TrendPoint[],
    opts?: { projected?: boolean },
  ): TrendDto => ({
    points: pts.map((p) => ({
      dateIso: p.dateIso,
      dateLabel: label(p.dateIso),
      value: p.value,
      scheduledDeload: p.scheduledDeload,
      setsLabel: formatSetLine(
        { workingSets: p.workingSets, extraSets: [] },
        externalLoad,
      ),
      ...(opts?.projected
        ? { projected: projectedByExercise.get(p.loggedExerciseId) ?? null }
        : {}),
    })),
    latest: latestValue(pts),
  });

  // Each session's call is judged on its own recurring workout's comparable
  // run ending at it — the same evidence its card used (§7.5).
  const performanceById = new Map(
    segmentScope.map((r) => [r.perf.loggedExerciseId, r]),
  );
  const calls = callsBySession(plannedScopeRows.map(toJudgedRow), {
    externalLoad,
    noGymScope,
    segmentEndingAt: (hr) => {
      const target = performanceById.get(hr.perf.loggedExerciseId);
      return target
        ? rowSegmentEndingAt(
            segmentScope,
            exercise.id,
            target,
            gymVariable,
          ).map(toJudgedRow)
        : [];
    },
  });
  const newestFirst = scopeRows.slice().sort((a, b) => byDate(b.perf, a.perf));
  const shown = opts.allSessions
    ? newestFirst
    : newestFirst.slice(0, RECENT_SESSIONS);

  return {
    exerciseId: exercise.id,
    gymVariable,
    externalLoad,
    hasHistory: rows.length > 0,
    scopes: scopes.map(({ key, label: l, archived }) => ({
      key,
      label: l,
      archived,
    })),
    selectedScope: selected
      ? {
          key: selected.key,
          label: selected.label,
          archived: selected.archived,
        }
      : null,
    next,
    nextByWorkout,
    records,
    trend: {
      e1rm:
        externalLoad && selected
          ? trendOf(e1rmPoints(historyRows), { projected: true })
          : null,
      weight:
        externalLoad && selected ? trendOf(weightPoints(historyRows)) : null,
      reps: !externalLoad && selected ? trendOf(repsPoints(historyRows)) : null,
    },
    sessions: {
      rows: shown.map((r) => ({
        loggedExerciseId: r.perf.loggedExerciseId,
        loggedSessionId: r.loggedSessionId,
        dateIso: r.perf.dateIso,
        dateLabel: label(r.perf.dateIso),
        gymName: gymVariable ? null : r.gymName,
        gymArchived: gymVariable ? false : r.gymArchived,
        workingSets: r.perf.workingSets
          .slice()
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => ({ weightLbs: s.weightLbs, reps: s.reps, rir: s.rir })),
        extraSets: r.extraSets.map((s) => ({
          weightLbs: s.weightLbs,
          reps: s.reps,
        })),
        plannedSets: r.plannedSets,
        swappedFromName:
          r.plannedExerciseId !== exercise.id ? r.plannedExerciseName : null,
        sessionName: r.sessionName,
        // A Wing-It session is never judged (RD-25): "none" once finished,
        // "in_progress" while open — as an open planned session reads.
        call:
          calls.get(r.perf.loggedExerciseId) ??
          (r.finished ? "none" : "in_progress"),
      })),
      total: newestFirst.length,
      showingAll: !!opts.allSessions || newestFirst.length <= RECENT_SESSIONS,
    },
  };
}
