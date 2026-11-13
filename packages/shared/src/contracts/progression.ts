/**
 * Pro calls, gated on the server: each keeps `locked` (the capability that
 * withheld it, or null) exactly as the gate returns it. Built by
 * apps/web/src/lib/progression/queries.ts and history-queries.ts; the ungated
 * builders' types stay server-side (moved here in Pitch 21b, so the compiler
 * holds the server's output to the contract). Wire conventions: ./wire.ts.
 */
import type { Capability } from "../billing/plans";
import type {
  ProgressionTag,
  RecommendationDto,
  RirEffect,
  SuggestedLoadDto,
} from "../progression/types";

export type OccurrenceProgressionDto = {
  loggedExerciseId: string;
  scheduledDeloadWeek: boolean;
  tag: ProgressionTag | null;
  /** Null in a scheduled-deload week and whenever RIR didn't change the call. */
  rirEffect: RirEffect;
  suggestion: SuggestedLoadDto;
  /**
   * Where this exercise's history lives (Exercise History & PR Intelligence
   * R4): set once the occurrence's scope has a finished workout, any loading
   * mode; a machine/cable link opens on this occurrence's gym.
   */
  historyHref: string | null;
  /** Today's advice while the session is in progress, next time's once complete. */
  recommendation: RecommendationDto | null;
  /** Plans, Billing: the Pro capability withheld on a Free account (RD-9). */
  locked: Capability | null;
};

export type SessionProgressionSummaryDto = {
  loggedSessionId: string;
  scheduledDeloadWeek: boolean;
  /** Plans, Billing: the Pro capability withheld on a Free account (RD-9). */
  locked: Capability | null;
  exercises: {
    performedExerciseId: string;
    performedExerciseName: string;
    tag: ProgressionTag | null;
    rirEffect: RirEffect;
    suggestion: SuggestedLoadDto;
    historyHref: string | null;
    recommendation: RecommendationDto | null;
    /** The plan's set count for this occurrence (its preserved snapshot). */
    plannedSets: number;
    /**
     * Working sets actually logged (setNumber 1..plannedSets). When this is
     * below plannedSets the session is complete but fell short of the plan: it
     * feeds the strength trend and goals, but not the progress/hold/deload tag.
     */
    loggedWorkingSets: number;
  }[];
};

export type PlannedProgressionDto = {
  tag: ProgressionTag | null;
  /** Carried for consistency; the planned list renders only the recommendation's evidence. */
  rirEffect: RirEffect;
  gymVariable: boolean;
  suggestion: SuggestedLoadDto;
  hasTrend: boolean;
  /** Null for gym-variable exercises (no gym yet) and in a scheduled-deload week. */
  recommendation: RecommendationDto | null;
  /**
   * Plans, Billing: the Pro capability this result was withheld for on a Free
   * account (null for a Pro account). Non-null means the surface renders one
   * upgrade note in place of the withheld call. Set in the query layer, never
   * the UI (spec RD-9).
   */
  locked: Capability | null;
};

/** The exercise history page's DTOs (gated by `gateHistory` on the server). */
export type {
  ExerciseHistoryDto,
  ExerciseRecordsDto,
  HistoryNextDto,
  HistoryScopeDto,
  RecordSetDto,
  SessionRowDto,
  TrendDto,
  TrendPointDto,
} from "../progression/history-types";
