import Constants from "expo-constants";
import {
  checkMobileEnvironment,
  type MobileEnvironmentCheck,
} from "@overload/shared/mobile/environment";

/**
 * The app's runtime environment (spec §7): the same allowlist app.config.ts
 * enforced, checked again on the embedded values at launch. A failure is the
 * "misconfigured" gate, and the app makes no network call.
 *
 * `process.env.EXPO_PUBLIC_*` must be referenced literally so Metro inlines
 * them. The local API override is honored only in a Metro development
 * bundle (`__DEV__`); a release bundle or an over-the-air update always talks
 * to staging.
 */
export const ENV: MobileEnvironmentCheck = checkMobileEnvironment({
  environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  localApiOrigin: process.env.EXPO_PUBLIC_LOCAL_API_ORIGIN,
  allowLocalApi: __DEV__,
});

/** The running app version, sent as X-Overload-App-Version on every call. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

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
