import "server-only";
import type {
  AppConfigDto,
  BotChallengeDto,
} from "@overload/shared/contracts/app-config";
import { isPlanImportEnabled } from "@/lib/import/config";
import { signupMode } from "@/lib/accounts/signup-gate";
import { isTurnstileBypassEnabled } from "@/lib/accounts/turnstile-bypass";
import {
  compareAppVersions,
  formatAppVersion,
  parseAppVersion,
  type AppVersion,
} from "@overload/shared/mobile/app-version";
import { ApiFailure } from "./errors";

/**
 * App config and the version gate (Pitch 21c spec §8; RD-9, RD-10, RD-11).
 *
 * The configuration comes from three SERVER-ONLY environment variables with
 * safe defaults, so a deployment with none of them set serves every version:
 *   MOBILE_MIN_APP_VERSION     default 0.0.0
 *   MOBILE_LATEST_APP_VERSION  default = the minimum (raised to it if lower)
 *   MOBILE_MAINTENANCE         on only when exactly "true" (advisory)
 * An invalid value falls back to its default and logs the variable NAME once
 * per process — never the value — so a typo can never brick installed apps.
 */

// The parser and comparator are shared with the app (Pitch 21d review audit).
export {
  compareAppVersions,
  formatAppVersion,
  parseAppVersion,
  type AppVersion,
} from "@overload/shared/mobile/app-version";

/** The request header every app build sends. */
export const APP_VERSION_HEADER = "X-Overload-App-Version";

const DEFAULT_MINIMUM: AppVersion = [0, 0, 0];
const warned = new Set<string>();

function configuredVersion(
  env: Record<string, string | undefined>,
  name: string,
): AppVersion | null {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = parseAppVersion(raw);
  if (!parsed && !warned.has(name)) {
    warned.add(name);
    console.error(
      `mobile api: ${name} is not MAJOR.MINOR.PATCH; using the default`,
    );
  }
  return parsed;
}

/**
 * The public app config. Reads ONLY the variables named above, the plan-import
 * kill switch, and the signup mode. Never the invite code, keys, URLs, or the
 * admin allowlist (pitch rabbit hole I). The legacy invite mode reads as
 * "closed": the app has no invite field (21b RD-19). `planImportEnabled` always
 * comes from the one kill-switch authority, isPlanImportEnabled() (the process
 * environment), never from `env`.
 */
/** The minimum supported app version (the one value the gate needs). */
export function minimumAppVersion(
  env: Record<string, string | undefined> = process.env,
): AppVersion {
  return configuredVersion(env, "MOBILE_MIN_APP_VERSION") ?? DEFAULT_MINIMUM;
}

export function mobileAppConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfigDto {
  const minimum = minimumAppVersion(env);
  const latestRaw = configuredVersion(env, "MOBILE_LATEST_APP_VERSION");
  const latest =
    latestRaw && compareAppVersions(latestRaw, minimum) >= 0
      ? latestRaw
      : minimum;
  return {
    minimumAppVersion: formatAppVersion(minimum),
    latestAppVersion: formatAppVersion(latest),
    killSwitches: {
      planImportEnabled: isPlanImportEnabled(),
      maintenance: env.MOBILE_MAINTENANCE === "true",
    },
    signupMode: signupMode(env) === "public" ? "public" : "closed",
    botChallenge: mobileBotChallenge(env),
  };
}

/**
 * The bot challenge native signup and the reset request must pass (Pitch 21d
 * RD-6). It uses the same decision the web's signup and forgot-password pages
 * use: null exactly under the development / Preview bypass, when the web
 * hides its widget. Otherwise it carries the PUBLIC widget key and the public
 * web origin the widget runs on, never the secret. A missing value is null,
 * and the app then shows signup as unavailable instead of skipping the check.
 */
export function mobileBotChallenge(
  env: Record<string, string | undefined> = process.env,
): BotChallengeDto | null {
  if (isTurnstileBypassEnabled(env)) return null;
  return {
    provider: "turnstile",
    siteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null,
    origin: publicWebOrigin(env.NEXT_PUBLIC_APP_URL),
  };
}

/** The origin of the canonical public web URL, or null when it isn't one. */
function publicWebOrigin(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The version gate: the app's version, or the failure to answer with. A
 * missing or malformed header is a client bug (400); a version below the
 * minimum must update (426 upgrade_required).
 */
export function checkAppVersion(
  header: string | null,
  minimum: AppVersion = minimumAppVersion(),
): AppVersion | ApiFailure {
  const version = parseAppVersion(header);
  if (!version) {
    return new ApiFailure(
      "validation_error",
      "Send the app version with every request.",
      { [APP_VERSION_HEADER]: "Send the app version as MAJOR.MINOR.PATCH." },
    );
  }
  if (compareAppVersions(version, minimum) < 0) {
    return new ApiFailure(
      "upgrade_required",
      "This version of Overload is no longer supported. Update the app to continue.",
    );
  }
  return version;
}
