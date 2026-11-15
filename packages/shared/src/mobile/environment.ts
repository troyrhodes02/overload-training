/**
 * The iPhone app's environment allowlist (Pitch 21d spec §7, RD-15). Every
 * 21d artifact is staging-only: development builds, simulator builds, and
 * over-the-air updates connect to the staging deployment and the overload-dev
 * Supabase project, and nothing else. This one pure module is enforced three
 * times: by apps/mobile/app.config.ts (so `expo start`, `eas build`, and
 * `eas update` refuse a bad environment before anything is bundled), by the
 * app at launch (the "misconfigured" gate), and by tests.
 *
 * Problems name a variable, never its value. Pure TypeScript, no platform
 * APIs (B3), so the same check runs in Node and on Hermes.
 */

/** The only app environment that exists in 21d. 21l adds "production". */
export const MOBILE_APP_ENVIRONMENTS = ["staging"] as const;
export type MobileAppEnvironment = (typeof MOBILE_APP_ENVIRONMENTS)[number];

/** The permanent staging branch's stable Vercel alias (docs/technical/staging-environment.md). */
export const STAGING_API_ORIGIN =
  "https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app";

/** The overload-dev Supabase project. */
export const STAGING_SUPABASE_REF = "vdxrmfadikwzodjljbdi";
export const STAGING_SUPABASE_URL = `https://${STAGING_SUPABASE_REF}.supabase.co`;

/** Strings that mean Production. None may appear in any mobile value or file. */
export const PRODUCTION_MARKERS = [
  "ycxvdiklpefyhdclxyau",
  "overloadtraining.app",
] as const;

/** The only EAS build profiles and update channels a 21d build may use. */
export const MOBILE_EAS_PROFILES = [
  "development",
  "development-simulator",
] as const;
export const MOBILE_UPDATE_CHANNELS = ["staging"] as const;

export type MobileEnvironmentInput = {
  /** EXPO_PUBLIC_OVERLOAD_ENV */
  environment: string | undefined;
  /** EXPO_PUBLIC_SUPABASE_ANON_KEY (public by design; RLS is deny-all). */
  supabaseAnonKey: string | undefined;
  /**
   * EXPO_PUBLIC_LOCAL_API_ORIGIN: a local `next start` against overload-dev.
   * Honored only when `allowLocalApi` (a Metro development bundle, `__DEV__`);
   * a release bundle or an update always talks to staging.
   */
  localApiOrigin?: string | undefined;
  allowLocalApi: boolean;
};

export type MobileEnvironment = {
  environment: MobileAppEnvironment;
  apiOrigin: string;
  /** True when the API is a local server rather than the staging deployment. */
  localApi: boolean;
  supabaseUrl: string;
  supabaseRef: string;
  supabaseAnonKey: string;
};

export type MobileEnvironmentCheck =
  { ok: true; config: MobileEnvironment } | { ok: false; problems: string[] };

const LOCAL_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d{1,5})?$/;

export function mentionsProduction(value: string | undefined | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return PRODUCTION_MARKERS.some((m) => lower.includes(m));
}

/** True for a local development API origin (no path, no https). */
export function isLocalApiOrigin(origin: string): boolean {
  return LOCAL_ORIGIN.test(origin);
}

/**
 * The project ref inside a legacy Supabase anon key (a JWT), or null when the
 * key isn't a JWT (for example a newer publishable key) or can't be decoded.
 */
export function anonKeyProjectRef(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  const decode = (globalThis as { atob?: (s: string) => string }).atob;
  if (!decode) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(decode(padded)) as { ref?: unknown };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

export function checkMobileEnvironment(
  input: MobileEnvironmentInput,
): MobileEnvironmentCheck {
  const problems: string[] = [];

  const environment = input.environment?.trim();
  if (
    !environment ||
    !(MOBILE_APP_ENVIRONMENTS as readonly string[]).includes(environment)
  ) {
    problems.push(
      `EXPO_PUBLIC_OVERLOAD_ENV must be one of: ${MOBILE_APP_ENVIRONMENTS.join(", ")}`,
    );
  }

  const key = input.supabaseAnonKey?.trim() ?? "";
  if (!key) {
    problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is missing");
  } else if (mentionsProduction(key)) {
    problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY names Production");
  } else {
    const ref = anonKeyProjectRef(key);
    if (ref !== null && ref !== STAGING_SUPABASE_REF) {
      problems.push(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY belongs to a project other than overload-dev",
      );
    }
  }

  let apiOrigin = STAGING_API_ORIGIN;
  let localApi = false;
  const local = input.localApiOrigin?.trim();
  if (local && input.allowLocalApi) {
    if (mentionsProduction(local) || !isLocalApiOrigin(local)) {
      problems.push(
        "EXPO_PUBLIC_LOCAL_API_ORIGIN must be an http://localhost or private-network origin",
      );
    } else {
      apiOrigin = local;
      localApi = true;
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: {
      environment: environment as MobileAppEnvironment,
      apiOrigin,
      localApi,
      supabaseUrl: STAGING_SUPABASE_URL,
      supabaseRef: STAGING_SUPABASE_REF,
      supabaseAnonKey: key,
    },
  };
}

/**
 * The EAS side of the fence: a build profile or update channel outside the
 * allowlist (a "production" profile above all) is refused. Undefined means
 * a local command (`expo start`, `expo export`), which is allowed.
 */
export function checkEasTarget(target: {
  profile: string | undefined;
  channel: string | undefined;
}): string[] {
  const problems: string[] = [];
  if (
    target.profile &&
    !(MOBILE_EAS_PROFILES as readonly string[]).includes(target.profile)
  ) {
    problems.push(
      `EAS build profile must be one of: ${MOBILE_EAS_PROFILES.join(", ")}`,
    );
  }
  if (
    target.channel &&
    !(MOBILE_UPDATE_CHANNELS as readonly string[]).includes(target.channel)
  ) {
    problems.push(
      `EAS update channel must be one of: ${MOBILE_UPDATE_CHANNELS.join(", ")}`,
    );
  }
  return problems;
}
