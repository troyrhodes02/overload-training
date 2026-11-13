import { isUuid } from "@/lib/actions/result";

/**
 * THE ADMIN ALLOWLIST (Admin Center & Feedback, spec section 6.1; R1). An
 * admin is an authenticated account whose auth user id is listed in the
 * server-only OVERLOAD_ADMIN_USER_IDS. It is not stored in the database,
 * nothing in the app can grant it, and it is read on every call, so changing
 * the variable (and redeploying) is the only way to change who is an admin.
 *
 * Format: auth user UUIDs separated by commas and/or whitespace. Case does
 * not matter. Anything that is not a UUID is ignored, and an unset or empty
 * variable means nobody is an admin (fail closed).
 *
 * Pure and free of server-only imports so the proxy can use the very same
 * rule for its early not-found (spec R23); it must never be imported by a
 * client component (guard tests, client-bundle check).
 */
const ADMIN_ENV = "OVERLOAD_ADMIN_USER_IDS";

export function adminUserIds(
  env: Record<string, string | undefined> = process.env,
): ReadonlySet<string> {
  const raw = env[ADMIN_ENV] ?? "";
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter((id) => isUuid(id)),
  );
}

/** Whether an auth user id is on the allowlist. */
export function isAdminUserId(
  id: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    typeof id === "string" && adminUserIds(env).has(id.trim().toLowerCase())
  );
}
