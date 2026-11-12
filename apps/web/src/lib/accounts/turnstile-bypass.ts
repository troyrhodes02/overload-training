import "server-only";

import { DEPLOYMENT_TARGET_VARS } from "@/lib/env/deployment-guard";
import { mentionsProductionRef } from "@/lib/env/supabase-identity";

/**
 * The development and Preview Turnstile bypass: the single decision point.
 *
 * `TURNSTILE_DISABLED=true` lets a developer sign up and request a password
 * reset without the Cloudflare widget, locally and on Vercel Preview (the
 * permanent `staging` branch). Every Turnstile surface asks this one function:
 * the signup and forgot-password pages (whether to render the widget),
 * `verifyChallenge` (whether to skip siteverify), and `signUp` (whether to skip
 * the global hourly signup cap, so repeated test accounts are not paused).
 *
 * The bypass applies only when ALL of these hold:
 *   1. `TURNSTILE_DISABLED` is exactly `true` (absent, `false`, or anything
 *      else means Turnstile is on);
 *   2. the environment is an approved non-production one:
 *        - Vercel Preview: `VERCEL_ENV === "preview"`, or
 *        - local development: `NODE_ENV === "development"`, not on a Vercel
 *          deployment (`VERCEL_ENV` unset, or `development` from `vercel env
 *          pull`);
 *   3. no database or Supabase variable names a Production project ref.
 *
 * `VERCEL_ENV === "production"` refuses regardless of `NODE_ENV` or the flag.
 * NODE_ENV alone is never trusted for Preview, because Preview builds run with
 * `NODE_ENV=production`; and a production-mode process outside Vercel Preview
 * never qualifies. Every input is a server environment variable: nothing a
 * client sends can change the answer. The flag is server-only (it is on the
 * client-bundle forbidden scan); the browser learns only the resulting boolean,
 * and the server re-decides it independently on every submit.
 *
 * Everything else about signup is unchanged under the bypass: the closed mode,
 * the invite gate, the per-IP throttle, field validation, reserved usernames,
 * the disposable-email blocklist, username uniqueness, and the trial rules.
 */
export function isTurnstileBypassEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.TURNSTILE_DISABLED?.trim() !== "true") return false;

  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase() ?? "";
  if (vercelEnv === "production") return false;

  // Defence in depth: never bypass against Production data, whatever the
  // deployment claims to be. The deployment guard already refuses this for
  // Preview; this also covers a local process pointed at Production.
  if (DEPLOYMENT_TARGET_VARS.some((name) => mentionsProductionRef(env[name]))) {
    return false;
  }

  if (vercelEnv === "preview") return true;

  // An unrecognised VERCEL_ENV, or a Vercel build without one, fails closed.
  if (vercelEnv !== "" && vercelEnv !== "development") return false;
  if (vercelEnv === "" && env.VERCEL?.trim() === "1") return false;

  return env.NODE_ENV === "development";
}
