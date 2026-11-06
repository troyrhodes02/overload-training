/**
 * The demo seed's environment guard (spec §13, RD-16; pitch Appendix A item
 * 4). It runs BEFORE any database connection, in every mode (dry run
 * included), and has no override flag.
 *
 * Overload's only cloud project, ref `ycxvdiklpefyhdclxyau`, IS PRODUCTION,
 * whatever a `.env` or a Preview label calls it — and the repository's `.env`
 * points at it. So the demo tools:
 *   - never load `.env` (they read only what the operator exported);
 *   - refuse outright if ANY database or Supabase variable in the process
 *     names a production project ref or any hosted Supabase host;
 *   - accept only a loopback database (the local Supabase CLI stack, or an
 *     embedded test Postgres).
 * A future, separately owner-approved production demo account is NOT
 * reachable from these tools (runbook: separate operator procedure).
 */

export const PRODUCTION_PROJECT_REFS = ["ycxvdiklpefyhdclxyau"] as const;

/** Every variable that could point a tool at a database or Supabase project. */
export const GUARDED_ENV_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "DEMO_SUPABASE_URL",
  "DEMO_APP_URL",
] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const HOSTED_SUPABASE = /(^|\.)supabase\.(co|com|in|net)$/i;

export class DemoSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedRefused";
  }
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLoopbackHost(host: string | null): boolean {
  return host !== null && LOOPBACK_HOSTS.has(host);
}

/**
 * Throws DemoSeedRefused unless the environment is provably isolated. Returns
 * the guarded DATABASE_URL and its host. Never echoes a credential.
 */
export function assertSafeEnvironment(
  env: Record<string, string | undefined> = process.env,
): { databaseUrl: string; host: string } {
  for (const name of GUARDED_ENV_VARS) {
    const value = env[name];
    if (!value) continue;
    const lower = value.toLowerCase();
    for (const ref of PRODUCTION_PROJECT_REFS) {
      if (lower.includes(ref)) {
        throw new DemoSeedRefused(
          `${name} names the PRODUCTION project (${ref}). The demo tools never touch production. Export local-stack values instead.`,
        );
      }
    }
    const host = hostOf(value);
    if (host && HOSTED_SUPABASE.test(host)) {
      throw new DemoSeedRefused(
        `${name} points at a hosted Supabase project (${host}). The demo tools run only against the local stack.`,
      );
    }
    if (/pooler\.supabase|supabase\.co|supabase\.com/.test(lower)) {
      throw new DemoSeedRefused(
        `${name} references a hosted Supabase service. The demo tools run only against the local stack.`,
      );
    }
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new DemoSeedRefused(
      "DATABASE_URL is not set. Export the LOCAL stack URL (postgresql://postgres:postgres@127.0.0.1:54322/postgres); .env is never read.",
    );
  }
  const host = hostOf(databaseUrl);
  if (!isLoopbackHost(host)) {
    throw new DemoSeedRefused(
      `DATABASE_URL host ${host ?? "(unparseable)"} is not loopback. The demo tools run only against a local, isolated database.`,
    );
  }
  return { databaseUrl, host: host! };
}

/** "demo@example.test" → "d***@example.test" (never print a full email). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
