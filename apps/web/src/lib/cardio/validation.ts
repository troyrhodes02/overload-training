/**
 * Cardio input validation (Cardio Logging spec §12, R5–R7, R21–R22, R53).
 *
 * A cardio item is exactly two facts: an activity (short human-readable text)
 * and whole minutes. The same rules apply to the plan (PlannedCardio) and the
 * record (CardioLog). Blank, whitespace-only, zero, negative, and fractional
 * input is rejected — never "fixed". The upper bounds are input-sanity limits,
 * not product rules.
 *
 * Pure module: the dialogs run the same checks before submitting.
 */
import { parseWholeNumber, type Parsed } from "@/lib/plan/validation";

export const CARDIO_TYPE_MAX = 40;
export const CARDIO_MINUTES_MAX = 600;

/** Convenience shortcuts for the activity field. Any text is accepted (R6). */
export const CARDIO_TYPE_SUGGESTIONS = [
  "Incline Walk",
  "Treadmill",
  "Stair Climber",
  "Bike",
  "Elliptical",
  "Rowing",
  "Outdoor Walk",
] as const;

export const CARDIO_TYPE_REQUIRED = "Enter the activity.";
export const CARDIO_TYPE_TOO_LONG = `Keep it to ${CARDIO_TYPE_MAX} characters or fewer.`;
export const CARDIO_MINUTES_INVALID = "Enter whole minutes, 1 or more.";
export const CARDIO_MINUTES_TOO_LONG = `Keep it to ${CARDIO_MINUTES_MAX} minutes or fewer.`;

/** The activity, trimmed. */
export function parseCardioType(raw: unknown): Parsed<string> {
  const type = typeof raw === "string" ? raw.trim() : "";
  if (type.length === 0)
    return { ok: false, details: { type: CARDIO_TYPE_REQUIRED } };
  if (type.length > CARDIO_TYPE_MAX)
    return { ok: false, details: { type: CARDIO_TYPE_TOO_LONG } };
  return { ok: true, value: type };
}

/** Whole minutes, 1–600: "20" or 20. */
export function parseCardioMinutes(raw: unknown): Parsed<number> {
  const minutes = parseWholeNumber(raw);
  if (minutes === null || minutes < 1)
    return { ok: false, details: { durationMin: CARDIO_MINUTES_INVALID } };
  if (minutes > CARDIO_MINUTES_MAX)
    return { ok: false, details: { durationMin: CARDIO_MINUTES_TOO_LONG } };
  return { ok: true, value: minutes };
}

/** Both fields at once, with every field error collected. */
export function parseCardioEntry(raw: {
  type?: unknown;
  durationMin?: unknown;
}): Parsed<{ type: string; durationMin: number }> {
  const type = parseCardioType(raw.type);
  const minutes = parseCardioMinutes(raw.durationMin);
  if (!type.ok || !minutes.ok) {
    return {
      ok: false,
      details: {
        ...(type.ok ? {} : type.details),
        ...(minutes.ok ? {} : minutes.details),
      },
    };
  }
  return { ok: true, value: { type: type.value, durationMin: minutes.value } };
}
