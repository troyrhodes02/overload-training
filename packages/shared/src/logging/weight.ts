/**
 * The one rule for a load in pounds (OVE-135 / audit F-D3), shared by logged
 * sets, set edits, goal targets, and the client forms that pre-check them.
 *
 * Every stored weight is `Decimal(6,2)`: above 0, at most 9,999.99, and at most
 * two decimal places. A value with more places used to pass validation and be
 * silently rounded by Postgres (185.125 stored as 185.13), which broke "stored
 * exactly as entered" and turned an identical retry into a conflict. Now it is
 * refused with a specific message instead.
 *
 * Pure: no database, framework, or server dependency (a shared-package
 * candidate for the mobile app).
 */

/** Largest storable weight in pounds (Decimal(6,2)). */
export const WEIGHT_LBS_MAX = 9999.99;
/** Most decimal places a stored weight keeps (Decimal(6,2)). */
export const WEIGHT_LBS_DECIMALS = 2;

export const WEIGHT_MESSAGES = {
  required: "Enter a weight above 0.",
  tooLarge: "Enter a weight of 9,999.99 lb or less.",
  tooPrecise: "Use at most two decimal places.",
} as const;

/** True when `value` has no more than `places` decimal places. */
export function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places;
  // Tolerate binary floating-point noise (185.1 * 100 = 18509.999999999996).
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Check a weight in pounds. Returns the number on success, or the specific
 * message to show for the field.
 */
export function checkWeightLbs(
  value: unknown,
): { ok: true; value: number } | { ok: false; message: string } {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return { ok: false, message: WEIGHT_MESSAGES.required };
  }
  if (value > WEIGHT_LBS_MAX) {
    return { ok: false, message: WEIGHT_MESSAGES.tooLarge };
  }
  if (!hasAtMostDecimals(value, WEIGHT_LBS_DECIMALS)) {
    return { ok: false, message: WEIGHT_MESSAGES.tooPrecise };
  }
  return { ok: true, value };
}

/**
 * The one way a weight in pounds is printed (Pitch 21b, mobile audit D-14):
 * 185 → "185", 182.5 → "182.5", 102.25 → "102.25", with float noise rounded
 * away (166.50000000000003 → "166.5"). Every stored weight and every engine
 * load has at most two decimals, and for those this prints exactly what the
 * four formatters it replaced printed (proved for every cent by
 * apps/web/tests/unit/weight-format-consolidation.test.ts).
 */
export function formatWeightLbs(lbs: number): string {
  return String(Math.round(lbs * 100) / 100);
}
