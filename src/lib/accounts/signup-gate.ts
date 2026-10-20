import "server-only";

/**
 * Whether self-signup is open (OVE-50; replaces the Accounts invite gate).
 * Anyone may create an account, but only while the server-only
 * `OVERLOAD_SIGNUP_OPEN` is "true". Unset — production's default — means
 * closed, which is both the rollout gate (signup stays closed until
 * Multi-User Foundation is verified in production) and the off switch.
 */
export function isSignupOpen(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.OVERLOAD_SIGNUP_OPEN?.trim().toLowerCase() === "true";
}
