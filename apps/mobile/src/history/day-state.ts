import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
import type { WeekDayState } from "@overload/shared/contracts/logging";
import type { ChipTone } from "../ui/Surface";

/**
 * The server's day states, worded as on the web's History page. One wording
 * for History and the plan week (Pitch 21h RD-3).
 */
export const STATE_LABEL: Record<WeekDayState, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  complete: "Done",
  skipped: "Skipped",
  shifted: "Shifted",
};

export const STATE_TONE: Record<WeekDayState, ChipTone> = {
  upcoming: "muted",
  in_progress: "primary",
  complete: "progress",
  skipped: "muted",
  shifted: "muted",
};

/** A cardio occurrence's state, worded as History shows it. */
export const CARDIO_LABEL: Record<CardioOccurrenceDto["state"], string> = {
  complete: "Done",
  pending: "Today",
  upcoming: "Upcoming",
  missed: "Missed",
};
