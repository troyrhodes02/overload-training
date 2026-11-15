import type { MobileEnvironmentCheck } from "@overload/shared/mobile/environment";
import { ENV } from "../config/env";

/**
 * The app environments that ship the developer Diagnostics screen (design
 * M3): staging only. An allowlist, so the Production environment Pitch 21l
 * adds is excluded without anyone remembering to exclude it. Diagnostics
 * holds the staging access key's removal, which no customer build may reach.
 */
export const DIAGNOSTICS_ENVIRONMENTS: readonly string[] = ["staging"];

/**
 * Decided by the build's embedded environment, not by `__DEV__`, so a staging
 * over-the-air update (a release bundle) keeps Diagnostics for Checkpoint C.
 * Enforced three times: the More row, the route's Stack.Protected guard, and
 * the screen itself.
 */
export function diagnosticsAvailable(
  env: MobileEnvironmentCheck = ENV,
): boolean {
  return env.ok && DIAGNOSTICS_ENVIRONMENTS.includes(env.config.environment);
}
