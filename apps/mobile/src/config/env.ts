import Constants from "expo-constants";
import * as Application from "expo-application";
import {
  environmentLabel,
  resolveMobileEnvironment,
  type AppEnvironmentCheck,
} from "@overload/shared/mobile/app-environment";

/**
 * The app's runtime environment (21d spec §7; 21l spec §3): the same
 * allowlists app.config.ts enforced, checked again on the embedded values at
 * launch. `production` is checked against the Production half of the fence,
 * anything else against staging. A failure is the "misconfigured" gate, and
 * the app makes no network call.
 *
 * `process.env.EXPO_PUBLIC_*` must be referenced literally so Metro inlines
 * them. The local API override is honored only in a staging Metro development
 * bundle (`__DEV__`); a Production build refuses it outright.
 */
export const ENV: AppEnvironmentCheck = resolveMobileEnvironment({
  environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  localApiOrigin: process.env.EXPO_PUBLIC_LOCAL_API_ORIGIN,
  allowLocalApi: __DEV__,
});

/** The running app version, sent as X-Overload-App-Version on every call. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/** The native build number (CFBundleVersion), for display only. */
export const BUILD_NUMBER: string | null =
  Application.nativeBuildVersion ?? null;

/** "Production", "Staging", "Staging · local API", or "Misconfigured". */
export const ENVIRONMENT_LABEL: string = environmentLabel(ENV);

/** True only for the Production build (the friends' TestFlight app). */
export const IS_PRODUCTION: boolean =
  ENV.ok && ENV.config.environment === "production";

/**
 * The commit an over-the-air update was published from, stamped by
 * `npm run mobile:update:staging` (root; apps/mobile/scripts/update-staging.ts). Display only; null in
 * a Metro bundle or a build.
 */
export const SOURCE_COMMIT: string | null =
  process.env.EXPO_PUBLIC_SOURCE_COMMIT?.trim() || null;

/** The web origin the app links out to ("Open on the web"). */
export function webOrigin(): string | null {
  return ENV.ok ? ENV.config.apiOrigin : null;
}
