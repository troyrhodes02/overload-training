import "server-only";
import type { Account } from "@/lib/data/account";
import { getThisWeek } from "@/lib/logging/this-week";
import {
  rescheduleWorkout,
  skipUpcomingWorkout,
} from "@/lib/logging/schedule-adjustments";
import type {
  OccurrenceRefDto,
  RescheduleWorkoutResponseDto,
  SkipUpcomingWorkoutResponseDto,
  ThisWeekResponseDto,
} from "@overload/shared/contracts/schedule";
import { readJsonObject } from "./body";
import { shapeError } from "./errors";

/**
 * Native Weekly Scheduling Parity's mobile adapters (OVE-241; chore spec §2).
 * Thin shells over the released OVE-240 modules, unchanged: the account is
 * the verified token's, the block's row lock serializes every change with
 * the others and with workout starts, a replay of a change already made
 * answers success and writes nothing, and a request built on a stale week is
 * a `conflict`. The adapters only check a request's SHAPE. Scheduling is
 * capture, so it is Free.
 */

/** A schedule change is a few short ids and dates. */
export const SCHEDULE_BODY_LIMIT = 4 * 1024;

/** S1 `GET /this-week`: the current block week, or null with none. */
export async function readThisWeek(
  account: Account,
): Promise<ThisWeekResponseDto> {
  return { week: await getThisWeek(account) };
}

function text(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    throw shapeError(field, `Send ${field} as a string.`);
  }
  return value;
}

/**
 * S2 `POST /mesocycles/{mesocycleId}/schedule/skip` with `{ sessionId,
 * scheduledFor }`: skip a workout before (or on) its day, recorded as the
 * existing skipped resolution (`skipUpcomingWorkout`). A retry succeeds and
 * writes nothing; a finished, started, or past workout is refused.
 */
export async function skipFromRequest(
  account: Account,
  mesocycleId: string,
  request: Request,
): Promise<SkipUpcomingWorkoutResponseDto> {
  const body = await readJsonObject(request, SCHEDULE_BODY_LIMIT);
  return skipUpcomingWorkout(account, {
    mesocycleId,
    sessionId: text(body, "sessionId"),
    scheduledFor: text(body, "scheduledFor"),
  });
}

/**
 * S3 `POST /mesocycles/{mesocycleId}/schedule/move` with `{ sessionId,
 * scheduledFor, from, to, occupant }`: "Train today", a swap with a rest day
 * (`occupant: null`), or a swap with the workout on `to`
 * (`rescheduleWorkout`). A retry answers `unchanged`; a stale week, `conflict`.
 */
export async function moveFromRequest(
  account: Account,
  mesocycleId: string,
  request: Request,
): Promise<RescheduleWorkoutResponseDto> {
  const body = await readJsonObject(request, SCHEDULE_BODY_LIMIT);
  let occupant: OccurrenceRefDto | null = null;
  if (body.occupant !== null && body.occupant !== undefined) {
    if (typeof body.occupant !== "object" || Array.isArray(body.occupant)) {
      throw shapeError("occupant", "Send occupant as an object or null.");
    }
    const o = body.occupant as Record<string, unknown>;
    occupant = {
      sessionId: text(o, "sessionId"),
      scheduledFor: text(o, "scheduledFor"),
    };
  }
  return rescheduleWorkout(account, {
    mesocycleId,
    sessionId: text(body, "sessionId"),
    scheduledFor: text(body, "scheduledFor"),
    from: text(body, "from"),
    to: text(body, "to"),
    occupant,
  });
}
