/**
 * Cardio occurrences (type and duration only). Built by
 * apps/web/src/lib/cardio/queries.ts (moved here in Pitch 21b, so the compiler
 * holds the server's output to the contract). Wire conventions: ./wire.ts.
 */
import type { CardioEntry } from "../cardio/schedule";

export type CardioOccurrenceDto = CardioEntry & {
  mesocycleId: string;
  /** "Tue, Oct 13" — the effective date. */
  dateLabel: string;
};
