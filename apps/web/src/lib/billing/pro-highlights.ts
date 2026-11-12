import { PLAN_CAPABILITIES, type Capability } from "@/lib/billing/config";
import { isPlanImportEnabled } from "@/lib/import/config";

/**
 * What Pro adds, in one short line per capability (OVE-112). The trial
 * notices list these. The list is derived from the capability model: every
 * Pro capability must name its line here (the Record makes a new capability a
 * type error until it does), so a notice never promises a feature that isn't
 * gated, and never omits one that is.
 *
 * Plan import is listed only while its kill switch is on in this deployment,
 * so Production never promises AI import while its provider is disabled.
 */
const LINES: Record<Capability, string> = {
  progression_insights:
    "Progress, hold, and deload calls, with the weight to try and why, using your RIR",
  e1rm_trends: "Estimated one-rep max trends and stall detection",
  exercise_history_intelligence:
    "Rep records and the call each past session led to",
  plan_import: "Importing a plan you've already written",
};

export function proHighlights(
  opts: { planImportEnabled?: boolean } = {},
): string[] {
  const importOn = opts.planImportEnabled ?? isPlanImportEnabled();
  return PLAN_CAPABILITIES.pro
    .filter((cap) => cap !== "plan_import" || importOn)
    .map((cap) => LINES[cap]);
}
