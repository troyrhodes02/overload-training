import {
  formatGoalTarget,
  formatGoalTargetCompact,
} from "@overload/shared/goals/progress";
import { formatWeight } from "@overload/shared/logging/set-entry";
import {
  formatWeightLbs,
  WEIGHT_LBS_MAX,
} from "@overload/shared/logging/weight";
import { PROGRESS_INCREMENT_LBS } from "@overload/shared/progression/config";
import { scheduledDeloadLoad } from "@overload/shared/progression/deload";
import { formatLoad } from "@overload/shared/progression/history-format";

/**
 * Pitch 21b (mobile audit D-14): four weight formatters became one. Frozen
 * copies of the four bodies as they shipped before the consolidation, so this
 * test proves the one formatter prints exactly what each of them printed for
 * every input they can receive.
 */
const LEGACY = {
  /** lib/logging/set-entry.ts formatWeight (logging card, set summaries). */
  setEntry: (weightLbs: number) => String(weightLbs),
  /** lib/progression/history-format.ts formatLoad (exercise history). */
  historyFormat: (lbs: number) => String(Math.round(lbs * 100) / 100),
  /** lib/progression/recommendation.ts lbs (recommendation lines). */
  recommendation: (n: number) => String(Math.round(n * 100) / 100),
  /** lib/goals/progress.ts formatLbs (goal targets). */
  goals: (lbs: number) =>
    Number.isInteger(lbs) ? String(lbs) : String(Number(lbs.toFixed(2))),
};

/**
 * Every weight a lifter can store: Decimal(6,2) above 0 and at most 9,999.99
 * (OVE-135 refuses anything with more places). Parsed from its decimal text,
 * which is how the server turns a stored Decimal into a number.
 */
function* everyStorableWeight(): Generator<number> {
  for (let cents = 1; cents <= Math.round(WEIGHT_LBS_MAX * 100); cents++) {
    const whole = Math.floor(cents / 100);
    const frac = String(cents % 100).padStart(2, "0");
    yield Number(`${whole}.${frac}`);
  }
}

describe("one weight formatter (Pitch 21b, audit D-14)", () => {
  it("prints every storable weight exactly as each legacy formatter did", () => {
    let checked = 0;
    const mismatches: string[] = [];
    for (const w of everyStorableWeight()) {
      const out = formatWeightLbs(w);
      if (
        out !== LEGACY.setEntry(w) ||
        out !== LEGACY.historyFormat(w) ||
        out !== LEGACY.recommendation(w) ||
        out !== LEGACY.goals(w)
      ) {
        if (mismatches.length < 10) mismatches.push(String(w));
      }
      checked++;
    }
    expect(checked).toBe(999_999);
    expect(mismatches).toEqual([]);
  });

  it("the legacy names are the one formatter, on every surface", () => {
    for (const w of [0.01, 1, 2.5, 45, 102.25, 182.5, 185, 315, 9999.99]) {
      expect(formatWeight(w)).toBe(formatWeightLbs(w));
      expect(formatLoad(w)).toBe(formatWeightLbs(w));
      expect(formatGoalTarget(w, 3)).toBe(`${LEGACY.goals(w)} lb × 3`);
      expect(formatGoalTargetCompact(w, 3)).toBe(`${LEGACY.goals(w)} × 3`);
    }
  });

  it("engine loads (+5 progress, 90% deload) print as the recommendation did", () => {
    for (const w of everyStorableWeight()) {
      const progress = w + PROGRESS_INCREMENT_LBS;
      const deload = scheduledDeloadLoad(w);
      expect(formatWeightLbs(progress)).toBe(LEGACY.recommendation(progress));
      expect(formatWeightLbs(deload)).toBe(LEGACY.recommendation(deload));
      if (w > 400) break; // the arithmetic is identical; a sample suffices
    }
  });

  it("rounds float noise away, as the history and recommendation always did", () => {
    expect(formatWeightLbs(0.1 + 0.2)).toBe("0.3");
    expect(formatWeightLbs(166.50000000000003)).toBe("166.5");
    expect(formatWeightLbs(185)).toBe("185");
    expect(formatWeightLbs(182.5)).toBe("182.5");
  });
});
