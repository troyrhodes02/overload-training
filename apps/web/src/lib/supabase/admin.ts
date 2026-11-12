import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The auth-admin facade (Accounts spec R4): the ONLY module in src/ that reads
 * SUPABASE_SERVICE_ROLE_KEY, and it exposes exactly three auth operations —
 * create a confirmed user (signup), delete a user (account deletion), and,
 * read-only, list every user's email for the owner's account directory
 * (Admin Center & Feedback, spec R16). It never touches application tables
 * (Prisma owns those; the Supabase client is for auth and Storage only).
 * Imported only by src/lib/accounts/signup.ts, src/lib/accounts/deletion.ts,
 * and src/lib/data/admin/emails.ts (guard tests).
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

/** Users per listUsers page, and the most pages read (a 20,000-account cap). */
const LIST_PAGE_SIZE = 1000;
const LIST_MAX_PAGES = 20;

/**
 * Every auth user's email by user id, for the admin directory only. Read-only;
 * returns nothing else about a user. Throws if the auth service fails, and the
 * caller degrades to "emails unavailable".
 */
export async function listAuthUserEmails(): Promise<Map<string, string>> {
  const auth = adminAuth();
  const emails = new Map<string, string>();
  for (let page = 1; page <= LIST_MAX_PAGES; page++) {
    const { data, error } = await auth.listUsers({
      page,
      perPage: LIST_PAGE_SIZE,
    });
    if (error) {
      throw new Error(`Auth user listing failed (${error.code ?? "unknown"}).`);
    }
    for (const user of data.users) {
      if (user.email) emails.set(user.id, user.email);
    }
    if (data.users.length < LIST_PAGE_SIZE) break;
  }
  return emails;
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
