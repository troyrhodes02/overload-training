import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { withDb } from "./representative-workout";
import { E2E_ADMIN_ID } from "./admin-id";
import { RELEASE_NOTES } from "../../../src/lib/release-notes/entries";

export { E2E_ADMIN_ID };

/**
 * The e2e admin (Admin Center & Feedback, spec §14.3). The accounts web
 * server runs with OVERLOAD_ADMIN_USER_IDS set to this fixed id (see
 * playwright.accounts.config.ts), so the suite creates the auth user with
 * exactly that id in the LOCAL stack, uses it, and removes it afterwards.
 * Nothing that existed before is touched.
 */

export const E2E_ADMIN = {
  email: "e2e-admin-17@example.test",
  password: "admin-pass-17-xyz",
};

function adminAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/127\.0\.0\.1[:/]/.test(url)) {
    throw new Error("The e2e admin is created in the local stack only.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}

/** Creates the admin's auth user (fixed id) and a named profile. */
export async function createE2eAdmin(): Promise<void> {
  await removeE2eAdmin();
  const { error } = await adminAuth().createUser({
    id: E2E_ADMIN_ID,
    email: E2E_ADMIN.email,
    password: E2E_ADMIN.password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not create the e2e admin: ${error.code}`);
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO profiles (user_id, first_name, last_name, username, time_zone, updated_at)
       VALUES ($1, 'Owner', 'Admin', 'e2e_owner_17', 'America/Chicago', now())`,
      [E2E_ADMIN_ID],
    );
    // Caught up on the release notes, as a real signup starts (What's New
    // R10), so no dialog stands between the admin and the menu.
    if (RELEASE_NOTES[0]) {
      await db.query(
        `INSERT INTO release_seen (user_id, last_seen_release_id, last_seen_at, updated_at)
         VALUES ($1, $2, now(), now())`,
        [E2E_ADMIN_ID, RELEASE_NOTES[0].id],
      );
    }
  });
}

/**
 * Removes the admin's rows and auth user. The audit log is append-only by
 * design (spec R11), so entries this suite's admin wrote stay behind in the
 * local stack — ids only, no personal data.
 */
export async function removeE2eAdmin(): Promise<void> {
  await withDb(async (db) => {
    for (const table of ["feedback", "tour_progress", "release_seen"]) {
      await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [E2E_ADMIN_ID]);
    }
    await db.query("DELETE FROM profiles WHERE user_id = $1", [E2E_ADMIN_ID]);
  });
  const { error } = await adminAuth().deleteUser(E2E_ADMIN_ID);
  if (error && error.status !== 404 && error.code !== "user_not_found") {
    throw new Error(`Could not remove the e2e admin: ${error.code}`);
  }
}

export async function signIn(
  page: Page,
  who: { email: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}
