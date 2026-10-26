import "server-only";
import type { Account } from "@/lib/data/account";
import { accountToday } from "@/lib/data/account";
import { isUuid } from "@/lib/actions/result";
import { isGymVariable } from "@/lib/exercises/gym-variable";
import { requiresExternalWeight } from "@/lib/exercises/loading-mode";
import { formatMonthDay } from "@/lib/plan/calendar";
import { byDate } from "./engine";
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
  type RecordSet,
  type TrendPoint,
} from "./history";
import { formatSetLine } from "./history-format";
import { describeScope, gatherRows, type PerformanceRow } from "./queries";
import type {
  ExerciseHistoryDto,
  ExerciseRecordsDto,
  HistoryNextDto,
  HistoryScopeDto,
  RecordSetDto,
  TrendDto,
} from "./history-types";

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
} from "./history-types";

const GLOBAL = "global";
const NO_GYM = "none";

type Scope = HistoryScopeDto & {
  gymId: string | null;
  latestIso: string;
  latestFinishedIso: string | null;
};

/** Machine/cable scopes: one per gym with history, plus legacy no-gym rows (R5). */
function machineScopes(rows: PerformanceRow[]): Scope[] {
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

const toHistoryRow = (r: PerformanceRow): HistoryRow => ({
  perf: r.perf,
  finished: r.finished,
  extraSets: r.extraSets,
});

export async function getExerciseHistory(
  account: Account,
  exerciseId: string,
  opts: { scope?: string | null; allSessions?: boolean } = {},
): Promise<ExerciseHistoryDto | null> {
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
  const allRows = await gatherRows(account, exerciseId);
  const rows = allRows.filter(
    (r) => r.perf.workingSets.length + r.extraSets.length > 0,
  );

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

  const today = accountToday(account);
  const label = (iso: string) => formatMonthDay(iso, today);

  let next: HistoryNextDto | null = null;
  if (selected && noGymScope) {
    next = { kind: "no_gym" };
  } else if (selected) {
    const d = await describeScope(
      account,
      exercise,
      allRows,
      gymVariable && selected.gymId
        ? { id: selected.gymId, name: scopeRows[0]?.gymName ?? "Gym" }
        : null,
      "next",
    );
    next = {
      kind: "call",
      tag: d.tag,
      recommendation: d.recommendation,
      insufficientNote: d.insufficientNote,
    };
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

  const calls = callsBySession(historyRows, { externalLoad, noGymScope });
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
        call: calls.get(r.perf.loggedExerciseId) ?? "none",
      })),
      total: newestFirst.length,
      showingAll: !!opts.allSessions || newestFirst.length <= RECENT_SESSIONS,
    },
  };
}
