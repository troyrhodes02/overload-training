/**
 * Plans, Billing & Promo Codes — the Pro gate for read surfaces (spec RD-9).
 *
 * PURE functions that take a fully-computed progression/history DTO and return
 * a copy with the Pro fields WITHHELD (and a `locked` marker set) when the
 * account lacks the gating capability. Enforcement is in the query layer, not
 * the UI: a Free account calling the read path directly receives the withheld
 * DTO, never a Pro value. The UI reads `locked` only to render one upgrade note.
 *
 * `locked` is set only when a Pro result was actually withheld (Entitlement
 * Audit). A Free account with no history, or not enough of it for a call, has
 * nothing withheld: the surface shows the same empty or not-enough-history
 * state a Pro account sees, never an upgrade prompt standing in for missing
 * data. Whether something was withheld is derived from the lifter's own
 * history, so it reveals nothing beyond what they logged.
 */
import type { Capability } from "@/lib/billing/config";
import type {
  OccurrenceProgressionDto,
  PlannedProgressionDto,
  SessionProgressionSummaryDto,
} from "@/lib/progression/queries";
import type {
  ExerciseHistoryDto,
  SessionCallKind,
} from "@/lib/progression/history-types";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

const INSIGHTS: Capability = "progression_insights";

/** The per-session labels that interpret performance (Pro). */
const INTERPRETING_CALLS = new Set<SessionCallKind>([
  "progress",
  "deload",
  "stalled",
  "hold",
]);

type CallFields = {
  tag: unknown;
  rirEffect: unknown;
  suggestion: unknown;
  recommendation: unknown;
};

/**
 * True when a progression call carries anything Pro would show. The bare
 * scheduled-deload line ("Deload week", no load) is planned recovery the
 * lifter wrote into the mesocycle, not an interpretation; a deload week only
 * withholds something when it carries the 90% load (`suggestion`).
 */
function hasCall(c: CallFields): boolean {
  const rec = c.recommendation as { kind?: string } | null;
  return (
    c.tag !== null ||
    c.rirEffect !== null ||
    c.suggestion !== null ||
    (rec !== null && rec.kind !== "scheduled_deload")
  );
}

export function gatePlanned(
  dto: Omit<PlannedProgressionDto, "locked">,
  insights: boolean,
): PlannedProgressionDto {
  if (insights) return { ...dto, locked: null };
  // A gym-variable lift's call waits for the gym, so its finished history
  // (`hasTrend`) counts as withheld; a free-weight lift's call is already in
  // `hasCall`, and its trend alone (not enough history) withholds nothing.
  const withheld = hasCall(dto) || (dto.gymVariable && dto.hasTrend);
  return {
    ...dto,
    // On Free no call follows once the gym is set, so the planned list must
    // not promise one ("once gym is set"); the lift reads like any other.
    gymVariable: false,
    tag: null,
    rirEffect: null,
    suggestion: null,
    hasTrend: false,
    recommendation: null,
    locked: withheld ? INSIGHTS : null,
  };
}

export function gateOccurrence(
  dto: Omit<OccurrenceProgressionDto, "locked">,
  insights: boolean,
): OccurrenceProgressionDto {
  if (insights) return { ...dto, locked: null };
  return {
    ...dto,
    tag: null,
    rirEffect: null,
    suggestion: null,
    recommendation: null,
    locked: hasCall(dto) ? INSIGHTS : null,
  };
}

export function gateSessionSummary(
  dto: Omit<SessionProgressionSummaryDto, "locked">,
  insights: boolean,
): SessionProgressionSummaryDto {
  if (insights) return { ...dto, locked: null };
  return {
    ...dto,
    locked: dto.exercises.some(hasCall) ? INSIGHTS : null,
    exercises: dto.exercises.map((e) => ({
      ...e,
      tag: null,
      rirEffect: null,
      suggestion: null,
      recommendation: null,
    })),
  };
}

/**
 * The exercise-history page (spec section 9). Free keeps plain sessions,
 * goals, the reps trend, the heaviest/best-set records, and the
 * not-enough-history line (a statement about the logged data, not a call).
 * Pro adds the current call (`next`), the e1RM estimate (`records.bestE1rm`),
 * the e1RM/weight trends (with the projected-RIR overlay riding on the e1RM
 * trend), the rep-record frontier, and the per-session calls. Each withheld
 * group falls on its own capability; the single `locked` marker (the first
 * missing capability whose result was withheld) drives one upgrade note.
 */
export function gateHistory(
  dto: Omit<ExerciseHistoryDto, "locked">,
  resolved: ResolvedEntitlement,
): ExerciseHistoryDto {
  const insights = resolved.capabilities.has("progression_insights");
  const trends = resolved.capabilities.has("e1rm_trends");
  const intel = resolved.capabilities.has("exercise_history_intelligence");

  const withheld = new Set<Capability>();

  let next = dto.next;
  // "Calls for machines are made per gym" describes calls Free never gets.
  if (!insights && next?.kind === "no_gym") next = null;
  if (!insights && next && next.kind === "call") {
    if (next.tag !== null || next.recommendation !== null) {
      withheld.add("progression_insights");
    }
    next = {
      kind: "call",
      tag: null,
      recommendation: null,
      insufficientNote: next.insufficientNote,
    };
  }

  let records = dto.records;
  if (records && records.kind === "loaded") {
    if (!trends && records.bestE1rm !== null) {
      withheld.add("e1rm_trends");
      records = { ...records, bestE1rm: null };
    }
    if (!intel && records.repRecords !== null) {
      if (records.repRecords.length > 0) {
        withheld.add("exercise_history_intelligence");
      }
      records = { ...records, repRecords: null };
    }
  }

  const hasPoints = (t: ExerciseHistoryDto["trend"]["e1rm"]) =>
    t !== null && t.points.length > 0;
  if (!trends && (hasPoints(dto.trend.e1rm) || hasPoints(dto.trend.weight))) {
    withheld.add("e1rm_trends");
  }
  const trend = {
    e1rm: trends ? dto.trend.e1rm : null,
    weight: trends ? dto.trend.weight : null,
    reps: dto.trend.reps,
  };

  let sessions = dto.sessions;
  if (!intel) {
    // Every per-session label is blanked on Free (spec section 9), but only
    // an interpreting call counts as withheld: "not enough history", a deload
    // week, or an in-progress row is a data state, not a Pro result.
    if (sessions.rows.some((r) => INTERPRETING_CALLS.has(r.call))) {
      withheld.add("exercise_history_intelligence");
    }
    sessions = {
      ...sessions,
      rows: sessions.rows.map((r) => ({ ...r, call: "none" as const })),
    };
  }

  const order: Capability[] = [
    "progression_insights",
    "e1rm_trends",
    "exercise_history_intelligence",
  ];
  const locked = order.find((c) => withheld.has(c)) ?? null;

  return { ...dto, next, records, trend, sessions, locked };
}
