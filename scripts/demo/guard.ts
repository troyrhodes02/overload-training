/**
 * The demo seed's environment guard (spec §13, RD-16; pitch Appendix A item
 * 4). It runs BEFORE any database connection, in every mode (dry run
 * included), and has no override flag.
 *
 * Supabase ref `ycxvdiklpefyhdclxyau` IS PRODUCTION, whatever a `.env` or a
 * Preview label calls it. So the demo tools:
 *   - never load `.env` (they read only what the operator exported);
 *   - refuse outright if ANY database or Supabase variable in the process
 *     names a production project ref — with no override, in every mode;
 *   - by default accept only a loopback database (the local Supabase CLI
 *     stack, or an embedded test Postgres) and refuse any hosted Supabase;
 *   - with `--confirm-ref <ref>` (OVE-111), accept exactly ONE hosted
 *     non-production project — the development project — when DATABASE_URL
 *     (and DIRECT_URL, if set) and NEXT_PUBLIC_SUPABASE_URL all identify that
 *     same ref (scripts/operator/target-identity.ts). The CLI then verifies
 *     the database identity marker before anything is read or written.
 * A production demo account is NOT reachable from these tools (runbook:
 * separate operator procedure).
 */
import {
  PRODUCTION_PROJECT_REFS,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../operator/target-identity";

export { PRODUCTION_PROJECT_REFS, describeTarget, verifyTargetMarker };
export type { VerifiedTarget };

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
 * the guarded DATABASE_URL, its host, and the verified target. Never echoes a
 * credential. `confirmRef` (the CLI's --confirm-ref) is the ONLY way to reach a
 * hosted project, and it can never reach Production.
 */
export function assertSafeEnvironment(
  env: Record<string, string | undefined> = process.env,
  opts: { confirmRef?: string } = {},
): { databaseUrl: string; host: string; target: VerifiedTarget } {
  for (const name of GUARDED_ENV_VARS) {
    const value = env[name];
    if (!value) continue;
    const lower = value.toLowerCase();
    for (const ref of PRODUCTION_PROJECT_REFS) {
      if (lower.includes(ref)) {
        throw new DemoSeedRefused(
          `${name} names the PRODUCTION project (${ref}). The demo tools never touch production. Export local-stack or development values instead.`,
        );
      }
    }
  }

  const confirmRef = opts.confirmRef?.trim();
  if (confirmRef) return assertConfirmedHostedTarget(env, confirmRef);

  for (const name of GUARDED_ENV_VARS) {
    const value = env[name];
    if (!value) continue;
    const lower = value.toLowerCase();
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
  return { databaseUrl, host: host!, target: { kind: "local", host: host! } };
}

/** The --confirm-ref path: one explicitly confirmed, non-production project. */
function assertConfirmedHostedTarget(
  env: Record<string, string | undefined>,
  confirmRef: string,
): { databaseUrl: string; host: string; target: VerifiedTarget } {
  let target: VerifiedTarget;
  try {
    target = assertOperatorTarget({
      env,
      uses: ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      confirmRef,
      production: "refuse",
      allowLocal: false,
    });
  } catch (error) {
    if (error instanceof TargetRefused) {
      throw new DemoSeedRefused(error.message);
    }
    throw error;
  }
  if (target.kind !== "hosted" || target.production) {
    throw new DemoSeedRefused(
      "--confirm-ref accepts only a hosted, non-production project.",
    );
  }
  return { databaseUrl: env.DATABASE_URL!, host: target.host, target };
}

/** "demo@example.test" → "d***@example.test" (never print a full email). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
