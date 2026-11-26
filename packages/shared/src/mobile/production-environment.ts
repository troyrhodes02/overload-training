/**
 * The iPhone app's Production environment (Pitch 21l spec §3; RD-3, RD-19).
 * The TestFlight build talks to the Production API and the Production
 * Supabase project, and nothing else.
 *
 * This module is the Production half of the fence whose staging half is
 * `environment.ts`. Each half refuses the other's values. It is enforced three
 * times: by apps/mobile/app.config.ts for a Production target, by the app at
 * launch (through `app-environment.ts`), and by tests.
 *
 * Self-contained on purpose: app.config.ts loads it with Node's type
 * stripping, which can't resolve the shared package's extensionless imports,
 * and only for a Production target. `environment.ts` stays byte-identical, so
 * the staging build's runtime fingerprint never changes (RD-19). The staging
 * strings below are pinned against `environment.ts` by a test.
 *
 * Problems name a variable, never its value. Pure TypeScript, no platform
 * APIs (B3).
 */

/** The canonical Production web origin. The apex redirects here, so it must be exact. */
export const PRODUCTION_API_ORIGIN = "https://www.overloadtraining.app";

/** The Production Supabase project. */
export const PRODUCTION_SUPABASE_REF = "ycxvdiklpefyhdclxyau";
export const PRODUCTION_SUPABASE_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;

/** The Production app environment, EAS build profile, and update channel. */
export const PRODUCTION_ENVIRONMENT = "production";
export const PRODUCTION_EAS_PROFILE = "production";
export const PRODUCTION_UPDATE_CHANNEL = "production";

/** Strings that mean staging. None may appear in any Production value. */
export const STAGING_MARKERS = [
  "vdxrmfadikwzodjljbdi",
  "overload-training-git-staging",
  "vercel.app",
] as const;

export type ProductionEnvironmentInput = {
  /** EXPO_PUBLIC_OVERLOAD_ENV */
  environment: string | undefined;
  /** EXPO_PUBLIC_SUPABASE_ANON_KEY (public by design; RLS is deny-all). */
  supabaseAnonKey: string | undefined;
  /** EXPO_PUBLIC_LOCAL_API_ORIGIN: never allowed in Production. */
  localApiOrigin?: string | undefined;
};

export type ProductionEnvironment = {
  environment: "production";
  apiOrigin: string;
  localApi: false;
  supabaseUrl: string;
  supabaseRef: string;
  supabaseAnonKey: string;
};

export type ProductionEnvironmentCheck =
  | { ok: true; config: ProductionEnvironment }
  | { ok: false; problems: string[] };

export function mentionsStaging(value: string | undefined | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return STAGING_MARKERS.some((m) => lower.includes(m));
}

/**
 * The project ref inside a legacy Supabase anon key (a JWT), or null when the
 * key isn't a JWT (a newer publishable key) or can't be decoded.
 */
function jwtProjectRef(key: string): string | null {
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

export function checkProductionEnvironment(
  input: ProductionEnvironmentInput,
): ProductionEnvironmentCheck {
  const problems: string[] = [];

  if (input.environment?.trim() !== PRODUCTION_ENVIRONMENT) {
    problems.push(`EXPO_PUBLIC_OVERLOAD_ENV must be ${PRODUCTION_ENVIRONMENT}`);
  }

  const key = input.supabaseAnonKey?.trim() ?? "";
  if (!key) {
    problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is missing");
  } else if (mentionsStaging(key)) {
    problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY names staging");
  } else {
    const ref = jwtProjectRef(key);
    if (ref !== null && ref !== PRODUCTION_SUPABASE_REF) {
      problems.push(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY belongs to a project other than Production",
      );
    }
  }

  // A Production build never talks to a local server, in any bundle.
  if (input.localApiOrigin?.trim()) {
    problems.push("EXPO_PUBLIC_LOCAL_API_ORIGIN must not be set in Production");
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: {
      environment: PRODUCTION_ENVIRONMENT,
      apiOrigin: PRODUCTION_API_ORIGIN,
      localApi: false,
      supabaseUrl: PRODUCTION_SUPABASE_URL,
      supabaseRef: PRODUCTION_SUPABASE_REF,
      supabaseAnonKey: key,
    },
  };
}

export type EasTargetInput = {
  /** EXPO_PUBLIC_OVERLOAD_ENV */
  environment: string | undefined;
  /** EAS_BUILD_PROFILE */
  profile: string | undefined;
  /** EAS_UPDATE_CHANNEL */
  channel: string | undefined;
};

/**
 * Any Production signal makes the target Production, so a half-set target
 * (a Production channel with the staging environment, say) is checked by the
 * Production rules and refused, never waved through as staging.
 */
export function isProductionTarget(t: EasTargetInput): boolean {
  return (
    t.environment?.trim() === PRODUCTION_ENVIRONMENT ||
    t.profile === PRODUCTION_EAS_PROFILE ||
    t.channel === PRODUCTION_UPDATE_CHANNEL
  );
}

/** For a Production target: every value that is set must say Production. */
export function checkProductionEasTarget(t: EasTargetInput): string[] {
  const problems: string[] = [];
  const env = t.environment?.trim();
  if (env && env !== PRODUCTION_ENVIRONMENT) {
    problems.push(
      `EXPO_PUBLIC_OVERLOAD_ENV must be ${PRODUCTION_ENVIRONMENT} for a Production build or update`,
    );
  }
  if (t.profile && t.profile !== PRODUCTION_EAS_PROFILE) {
    problems.push(
      `EAS build profile must be ${PRODUCTION_EAS_PROFILE} for a Production build`,
    );
  }
  if (t.channel && t.channel !== PRODUCTION_UPDATE_CHANNEL) {
    problems.push(
      `EAS update channel must be ${PRODUCTION_UPDATE_CHANNEL} for a Production update`,
    );
  }
  return problems;
}
