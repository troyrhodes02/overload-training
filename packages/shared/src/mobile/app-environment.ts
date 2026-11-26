import { checkMobileEnvironment, type MobileEnvironment } from "./environment";
import {
  checkProductionEnvironment,
  PRODUCTION_ENVIRONMENT,
  type ProductionEnvironment,
} from "./production-environment";

/**
 * The app's runtime environment, either half of the fence (Pitch 21l spec §3).
 * `production` goes to the Production check; anything else goes to the
 * unchanged staging check, which refuses every Production value. The app reads
 * this once at launch, and a failure is the misconfigured gate.
 */
export type AppEnvironmentName = "staging" | "production";

export type AppEnvironment = MobileEnvironment | ProductionEnvironment;

export type AppEnvironmentCheck =
  { ok: true; config: AppEnvironment } | { ok: false; problems: string[] };

export function resolveMobileEnvironment(input: {
  environment: string | undefined;
  supabaseAnonKey: string | undefined;
  localApiOrigin?: string | undefined;
  allowLocalApi: boolean;
}): AppEnvironmentCheck {
  if (input.environment?.trim() === PRODUCTION_ENVIRONMENT) {
    return checkProductionEnvironment(input);
  }
  return checkMobileEnvironment(input);
}

/** What the app calls the environment it is running against. */
export function environmentLabel(env: AppEnvironmentCheck): string {
  if (!env.ok) return "Misconfigured";
  if (env.config.environment === "production") return "Production";
  return env.config.localApi ? "Staging · local API" : "Staging";
}
