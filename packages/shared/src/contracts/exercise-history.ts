/**
 * Pitch 21i (spec §6 E8): one exercise's history on the phone. `history` is
 * the web exercise page's own gated read (Exercise History & PR
 * Intelligence), serialized as-is: on a Free account the server has already
 * withheld the e1RM trend, the best e1RM, the rep records, the per-session
 * calls, and "Next time", and set `locked`. `goals` is the page's goals
 * section. Wire conventions: ./wire.ts.
 */
import type { ExerciseHistoryDto } from "../progression/history-types";
import type { ExerciseGoalsDto } from "./goals";

export type {
  ExerciseHistoryDto,
  ExerciseRecordsDto,
  HistoryNextDto,
  HistoryScopeDto,
  HistoryWorkoutNextDto,
  RecordSetDto,
  SessionCallKind,
  SessionRowDto,
  TrendDto,
  TrendPointDto,
} from "../progression/history-types";

/** `GET /exercises/{exerciseId}/history?scope=&sessions=all`. */
export type ExerciseHistoryViewDto = {
  history: ExerciseHistoryDto;
  goals: ExerciseGoalsDto;
};

/** `?sessions=` value that lists every session instead of the recent ten. */
export const ALL_SESSIONS_QUERY = "sessions=all";
