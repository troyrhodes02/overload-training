import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The auth-admin facade (Accounts spec R4): the ONLY module in src/ that reads
 * SUPABASE_SERVICE_ROLE_KEY, and it exposes exactly two auth operations —
 * create a confirmed user (signup) and delete a user (account
 * deletion). It never touches application tables (Prisma owns those; the
 * Supabase client is for auth and Storage only). Imported only by
 * src/lib/accounts/signup.ts and src/lib/accounts/deletion.ts (guard tests).
 *
 * Supabase's own public signup stays DISABLED in every environment, even with
 * self-signup open (OVE-50): this facade is how every account is created, only
 * after the app's own checks (signup switch, names, unique username), so the
 * anon key that ships to browsers can never create an account directly.
 */

function adminAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("The auth admin client is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}

export type CreateUserResult =
  | { ok: true; user: { id: string } }
  | { ok: false; code: string; reasons?: string[] };

/** A confirmed email/password user (no confirmation email is sent). */
export async function createConfirmedUser(input: {
  email: string;
  password: string;
}): Promise<CreateUserResult> {
  const { data, error } = await adminAuth().createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    const reasons = (error as { reasons?: unknown } | null)?.reasons;
    return {
      ok: false,
      code: error?.code ?? "unexpected_failure",
      ...(Array.isArray(reasons) ? { reasons: reasons.map(String) } : {}),
    };
  }
  return { ok: true, user: { id: data.user.id } };
}

/**
 * Deletes an auth user and, with it, its auth sessions. An already-deleted
 * user is reported as "not_found" (deletion is idempotent); anything else
 * throws.
 */
export async function deleteAuthUser(
  id: string,
): Promise<"deleted" | "not_found"> {
  const { error } = await adminAuth().deleteUser(id);
  if (!error) return "deleted";
  if (error.status === 404 || error.code === "user_not_found") {
    return "not_found";
  }
  throw new Error(`Auth user deletion failed (${error.code ?? "unknown"}).`);
}
