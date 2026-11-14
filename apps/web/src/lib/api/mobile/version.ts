import "server-only";
import type { AppConfigDto } from "@overload/shared/contracts/app-config";
import { isPlanImportEnabled } from "@/lib/import/config";
import { signupMode } from "@/lib/accounts/signup-gate";
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

export type AppVersion = readonly [number, number, number];

/** The request header every app build sends. */
export const APP_VERSION_HEADER = "X-Overload-App-Version";

const MAX_PART = 999_999;
// Canonical non-negative integers only: no leading zeros, sign, or suffix.
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

/** Strict MAJOR.MINOR.PATCH, or null. */
export function parseAppVersion(
  raw: string | null | undefined,
): AppVersion | null {
  if (typeof raw !== "string") return null;
  const m = VERSION.exec(raw.trim());
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
  return parts.every((p) => p <= MAX_PART) ? parts : null;
}

export function compareAppVersions(a: AppVersion, b: AppVersion): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function formatAppVersion(v: AppVersion): string {
  return v.join(".");
}

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
 * "closed": the app has no invite field (21b RD-19).
 */
export function mobileAppConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfigDto {
  const minimum =
    configuredVersion(env, "MOBILE_MIN_APP_VERSION") ?? DEFAULT_MINIMUM;
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
  };
}

/**
 * The version gate: the app's version, or the failure to answer with. A
 * missing or malformed header is a client bug (400); a version below the
 * minimum must update (426 upgrade_required).
 */
export function checkAppVersion(
  header: string | null,
  config: AppConfigDto = mobileAppConfig(),
): AppVersion | ApiFailure {
  const version = parseAppVersion(header);
  if (!version) {
    return new ApiFailure(
      "validation_error",
      "Send the app version with every request.",
      { [APP_VERSION_HEADER]: "Send the app version as MAJOR.MINOR.PATCH." },
    );
  }
  const minimum = parseAppVersion(config.minimumAppVersion) ?? DEFAULT_MINIMUM;
  if (compareAppVersions(version, minimum) < 0) {
    return new ApiFailure(
      "upgrade_required",
      "This version of Overload is no longer supported. Update the app to continue.",
    );
  }
  return version;
}
