/**
 * Preview / Development deployment tripwire (OVE-111).
 *
 * Vercel Preview deployments run against the development Supabase project,
 * never Production. Environment variables are set by hand in the Vercel
 * dashboard, so a mis-scoped variable is one click away; this check makes that
 * mistake fail loudly instead of silently reading and writing the only copy of
 * every lifter's history.
 *
 * Runs at BUILD time (next.config.ts) and at RUNTIME (src/instrumentation.ts
 * on server start, and src/lib/db.ts before the one Prisma client is built).
 * It applies whenever VERCEL_ENV is set and is not "production" — i.e. Vercel
 * Preview and `vercel dev` / pulled Development env. Local `next dev` (no
 * VERCEL_ENV) is unaffected, and Production is unaffected.
 *
 * Errors name the VARIABLE only — never its value, host, or credentials.
 */
import {
  identifyDatabaseUrl,
  identifySupabaseUrl,
  isProductionRef,
  mentionsProductionRef,
} from "./supabase-identity";

/** Every variable that could point a deployment at a database or Supabase project. */
export const DEPLOYMENT_TARGET_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

const DATABASE_VARS = new Set<string>([
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
]);

export class DeploymentTargetRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentTargetRefused";
  }
}

/** True for a Vercel deployment that must never reach Production data. */
export function isNonProductionDeployment(
  env: Record<string, string | undefined>,
): boolean {
  const v = env.VERCEL_ENV?.trim().toLowerCase();
  return !!v && v !== "production";
}

/**
 * Throws DeploymentTargetRefused when a non-production Vercel deployment has
 * any database or Supabase variable that references a Production project.
 * Returns the names it checked (for tests). A no-op outside Preview/Development.
 */
export function assertDeploymentTarget(
  env: Record<string, string | undefined> = process.env,
): { checked: string[] } {
  if (!isNonProductionDeployment(env)) return { checked: [] };
  const deployment = env.VERCEL_ENV!.trim().toLowerCase();
  const checked: string[] = [];
  for (const name of DEPLOYMENT_TARGET_VARS) {
    const raw = env[name];
    if (!raw) continue;
    checked.push(name);
    const identity = DATABASE_VARS.has(name)
      ? identifyDatabaseUrl(raw)
      : identifySupabaseUrl(raw);
    const productionByParse =
      identity.kind === "supabase" && isProductionRef(identity.ref);
    if (productionByParse || mentionsProductionRef(raw)) {
      throw new DeploymentTargetRefused(
        `Refusing to run a ${deployment} deployment: ${name} references the PRODUCTION Supabase project. ` +
          `Scope ${name} to the development project for ${deployment} in Vercel → Settings → Environment Variables, then redeploy.`,
      );
    }
  }
  return { checked };
}
