/**
 * This week's schedule on Today (OVE-240 on the web; OVE-241 on the iPhone).
 * Built by apps/web/src/lib/logging/this-week.ts from the effective schedule
 * (moved here so the compiler holds the server's output to the contract).
 * Wire conventions: ./wire.ts (dates are ISO yyyy-mm-dd strings).
 */

export type ThisWeekWorkoutState =
  "upcoming" | "in_progress" | "complete" | "skipped";

export type ThisWeekWorkout = {
  sessionId: string;
  /** The occurrence's identity: its authored date (LoggedSession.scheduledFor). */
  scheduledFor: string;
  sessionName: string;
  state: ThisWeekWorkoutState;
  loggedSessionId: string | null;
  /** Its planned day, when this week moved it ("Planned for Wed, Nov 25"). */
  movedFrom: string | null;
  /** Today or later, nothing started, no resolution: it can be skipped or moved. */
  adjustable: boolean;
  exercises: { name: string; scheme: string }[];
};

export type ThisWeekDay = {
  dateIso: string;
  /** "Mon" */
  weekday: string;
  /** "24" */
  dayOfMonth: string;
  /** "Mon, Nov 24" */
  dayLabel: string;
  isToday: boolean;
  isPast: boolean;
  /** The workout on this day this week (never a skipped one), or null for rest. */
  workout: ThisWeekWorkout | null;
  /** Workouts skipped on this day this week. */
  skipped: ThisWeekWorkout[];
};

export type ThisWeekDto = {
  mesocycleId: string;
  weekNumber: number;
  lengthWeeks: number;
  rangeLabel: string;
  scheduledDeloadWeek: boolean;
  today: string;
  days: ThisWeekDay[];
  /** Why nothing can move right now (a missed day waits for an answer), or null. */
  blockedReason: string | null;
};

/** `GET /this-week`: the current block week, or null with none. */
export type ThisWeekResponseDto = { week: ThisWeekDto | null };

/** `POST /mesocycles/{mesocycleId}/schedule/skip`. */
export type SkipUpcomingWorkoutRequest = {
  sessionId: string;
  /** The occurrence's identity: its authored date. */
  scheduledFor: string;
};
export type SkipUpcomingWorkoutResponseDto = {
  missedOn: string;
  outcome: "skipped";
};

/** An occurrence by identity, as the lifter saw it. */
export type OccurrenceRefDto = { sessionId: string; scheduledFor: string };

/**
 * `POST /mesocycles/{mesocycleId}/schedule/move`: move a workout to another
 * day of this week ("Train today", a swap with a rest day), or swap it with
 * the workout on that day. `from` and `occupant` say what the lifter saw.
 */
export type RescheduleWorkoutRequest = {
  sessionId: string;
  scheduledFor: string;
  from: string;
  to: string;
  occupant: OccurrenceRefDto | null;
};
export type RescheduleWorkoutResponseDto = { status: "moved" | "unchanged" };
