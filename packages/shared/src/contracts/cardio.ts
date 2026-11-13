/**
 * Cardio occurrences (type and duration only). Built by
 * apps/web/src/lib/cardio/queries.ts (moved here in Pitch 21b, so the compiler
 * holds the server's output to the contract). Wire conventions: ./wire.ts.
 */
import type { CardioEntry } from "../cardio/schedule";

/**
 * Cardio reads for the dashboard and history (Cardio Logging spec §13). Facts
 * and the effective-schedule view only — nothing here is derived performance:
 * no trend, total, streak, or comparison beyond "differs from plan".
 */

export type CardioOccurrenceDto = CardioEntry & {
  mesocycleId: string;
  /** "Tue, Oct 13" — the effective date. */
  dateLabel: string;
};
