import { assertDeploymentTarget } from "@/lib/env/deployment-guard";

/**
 * Next.js server-start hook. OVE-111: a Vercel Preview (or Development)
 * deployment whose database or Supabase variables reference the Production
 * project refuses to start, so no request is ever served against Production
 * data. The error names the variable only, never its value.
 */
export function register(): void {
  assertDeploymentTarget(process.env);
}
