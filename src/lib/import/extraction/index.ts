import "server-only";
import { AnthropicPlanExtractionPort } from "./anthropic";
import type { PlanExtractionPort } from "./port";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the extraction port factory.
 * Production uses the Anthropic port; tests inject the in-memory mock via
 * `__setPlanExtractionPort`, so no test ever makes a real paid call. A single
 * instance is reused (one provider client per process), matching the serverless
 * singleton posture of the rest of the app.
 */

let override: PlanExtractionPort | null = null;
let instance: PlanExtractionPort | null = null;

export function getPlanExtractionPort(): PlanExtractionPort {
  if (override) return override;
  if (!instance) instance = new AnthropicPlanExtractionPort();
  return instance;
}

/** Test seam: inject a mock port. Pass null to restore the real one. */
export function __setPlanExtractionPort(port: PlanExtractionPort | null): void {
  override = port;
}

export type { PlanExtractionPort } from "./port";
export type {
  ExtractionRequest,
  ExtractionResult,
  ExtractionSuccess,
  ExtractionFailure,
  ExtractionErrorCode,
  ExtractionPart,
} from "./port";
