/**
 * All-time history, one week at a time. Built by
 * apps/web/src/lib/logging/history-week.ts (moved here in Pitch 21b, so the
 * compiler holds the server's output to the contract). Wire conventions:
 * ./wire.ts.
 */
import type { CardioOccurrenceDto } from "./cardio";
import type { WeekDayDto } from "./logging";

/** A mesocycle a history week refers to. */
export type BlockRef = { mesocycleId: string; name: string; status: string };

export type LoggedHistoryDay = {
  dateIso: string;
  dayLabel: string;
  workouts: (BlockRef & {
    loggedSessionId: string;
    sessionName: string;
    state: "complete" | "in_progress";
  })[];
  cardio: (BlockRef & {
    cardioLogId: string;
    type: string;
    durationMin: number;
  })[];
};

export type EarlierBlock = BlockRef & {
  /** The week to open: the week of the block's first logged day. */
  weekStart: string;
  rangeLabel: string;
};

export type HistoryWeekView =
  | {
      kind: "active";
      blockName: string;
      weekNumber: number;
      lengthWeeks: number;
      days: WeekDayDto[];
      cardio: CardioOccurrenceDto[];
    }
  | {
      kind: "logged";
      /** The blocks whose logged work appears this week (none for a gap). */
      blocks: BlockRef[];
      days: LoggedHistoryDay[];
    };

export type HistoryWeekDto = {
  weekStart: string;
  weekEnd: string;
  rangeLabel: string;
  thisWeekStart: string;
  isThisWeek: boolean;
  prevWeekStart: string | null;
  nextWeekStart: string | null;
  view: HistoryWeekView;
  /** Blocks other than the active one that hold logged work, newest first. */
  earlierBlocks: EarlierBlock[];
  /** False when nothing has ever been logged and there is no active block. */
  hasAnyHistory: boolean;
};
