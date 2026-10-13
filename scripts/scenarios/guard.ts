/**
 * Scenario seeding target guard (dev tooling only).
 *
 * Scenario seeding DELETES and replaces application data, so it may only ever
 * run against a database that is unambiguously local: the Supabase CLI stack
 * (`npx supabase start`, 127.0.0.1:54322) or a throwaway test Postgres. The
 * only cloud project is `overload-prod` (CLAUDE.md → Secrets), and the repo's
 * `.env` has at times held production values (prisma/seed/target-guard.ts), so
 * this guard ALLOWLISTS loopback hosts and refuses everything else. There is
 * deliberately no override flag or confirmation variable: no environment that
 * is not local is ever a valid target.
 *
 * Pure module (no Prisma, no I/O) so it can be unit-tested exhaustively.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type ScenarioTarget = { host: string; port: string; database: string };

export class ScenarioTargetRefused extends Error {
  constructor(reason: string) {
    super(`Refusing to seed a scenario: ${reason}`);
    this.name = "ScenarioTargetRefused";
  }
}

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ScenarioTargetRefused(
      `${label} is not a valid URL, so the target can't be identified.`,
    );
  }
}

function requireLoopback(value: string, label: string): URL {
  const url = parseUrl(value, label);
  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new ScenarioTargetRefused(
      `${label} points at "${host}", which is not a local host. ` +
        "Scenario seeding only runs against the local Supabase CLI stack or a throwaway test database.",
    );
  }
  return url;
}

/**
 * Decide whether the environment is a safe scenario target. Throws
 * ScenarioTargetRefused (with the reason) unless every check passes:
 *
 *  - not a production / Vercel runtime;
 *  - DATABASE_URL is set, is a postgres URL, and points at a loopback host;
 *  - DIRECT_URL, when set, is loopback too (a mixed config means the env file
 *    holds remote values and can't be trusted);
 *  - NEXT_PUBLIC_SUPABASE_URL, when set, is loopback too (the app the lifter
 *    logs into must be the same local environment being seeded).
 */
export function assertScenarioTargetAllowed(
  env: Record<string, string | undefined>,
): ScenarioTarget {
  if (env.NODE_ENV === "production") {
    throw new ScenarioTargetRefused("NODE_ENV is production.");
  }
  if (env.VERCEL || env.VERCEL_ENV) {
    throw new ScenarioTargetRefused(
      "this looks like a Vercel runtime (VERCEL / VERCEL_ENV is set).",
    );
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new ScenarioTargetRefused(
      "DATABASE_URL is not set, so the target can't be identified.",
    );
  }
  const db = requireLoopback(databaseUrl, "DATABASE_URL");
  if (db.protocol !== "postgresql:" && db.protocol !== "postgres:") {
    throw new ScenarioTargetRefused("DATABASE_URL is not a Postgres URL.");
  }
  if (env.DIRECT_URL) requireLoopback(env.DIRECT_URL, "DIRECT_URL");
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    requireLoopback(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  }
  return {
    host: db.hostname,
    port: db.port || "5432",
    database: decodeURIComponent(db.pathname.replace(/^\//, "")) || "postgres",
  };
}
