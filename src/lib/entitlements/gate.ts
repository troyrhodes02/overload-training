/**
 * Plans, Billing & Promo Codes — the Pro gate for read surfaces (spec RD-9).
 *
 * PURE functions that take a fully-computed progression/history DTO and return
 * a copy with the Pro fields WITHHELD (and a `locked` marker set) when the
 * account lacks the gating capability. Enforcement is in the query layer, not
 * the UI: a Free account calling the read path directly receives the withheld
 * DTO, never a Pro value. The UI reads `locked` only to render one upgrade note.
 */
import type { Capability } from "@/lib/billing/config";
import type {
  OccurrenceProgressionDto,
  PlannedProgressionDto,
  SessionProgressionSummaryDto,
} from "@/lib/progression/queries";
import type { ExerciseHistoryDto } from "@/lib/progression/history-types";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

const INSIGHTS: Capability = "progression_insights";

export function gatePlanned(
  dto: Omit<PlannedProgressionDto, "locked">,
  insights: boolean,
): PlannedProgressionDto {
  if (insights) return { ...dto, locked: null };
  return {
    ...dto,
    tag: null,
    rirEffect: null,
    suggestion: null,
    hasTrend: false,
    recommendation: null,
    locked: INSIGHTS,
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
    locked: INSIGHTS,
  };
}

export function gateSessionSummary(
  dto: Omit<SessionProgressionSummaryDto, "locked">,
  insights: boolean,
): SessionProgressionSummaryDto {
  if (insights) return { ...dto, locked: null };
  return {
    ...dto,
    locked: INSIGHTS,
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
 * The exercise-history page. Free keeps plain sessions, goals, the reps trend,
 * and the heaviest/best-set records; Pro adds the current call (`next`), the
 * e1RM estimate (`records.bestE1rm`), the e1RM/weight trends, and the per-session
 * calls. Each withheld group falls on its own capability; the single `locked`
 * marker (the first missing capability) drives one upgrade note on the page.
 */
export function gateHistory(
  dto: Omit<ExerciseHistoryDto, "locked">,
  resolved: ResolvedEntitlement,
): ExerciseHistoryDto {
  const insights = resolved.capabilities.has("progression_insights");
  const trends = resolved.capabilities.has("e1rm_trends");
  const intel = resolved.capabilities.has("exercise_history_intelligence");

  let locked: Capability | null = null;
  if (!insights) locked = "progression_insights";
  else if (!trends) locked = "e1rm_trends";
  else if (!intel) locked = "exercise_history_intelligence";

  let next = dto.next;
  if (!insights && next && next.kind === "call") {
    next = {
      kind: "call",
      tag: null,
      recommendation: null,
      insufficientNote: null,
    };
  }

  let records = dto.records;
  if (!trends && records && records.kind === "loaded") {
    records = { ...records, bestE1rm: null };
  }

  const trend = {
    e1rm: trends ? dto.trend.e1rm : null,
    weight: trends ? dto.trend.weight : null,
    reps: dto.trend.reps,
  };

  const sessions = intel
    ? dto.sessions
    : {
        ...dto.sessions,
        rows: dto.sessions.rows.map((r) => ({ ...r, call: "none" as const })),
      };

  return { ...dto, next, records, trend, sessions, locked };
}
