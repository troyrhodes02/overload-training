import "server-only";
import { cache } from "react";
import { listAuthUserEmails } from "@/lib/supabase/admin";

/**
 * Account emails for the admin area (Admin Center & Feedback, spec §6.4;
 * R16). Emails live in the sign-in system, not the database: this is the
 * one admin module that asks it, read-only. If the sign-in system can't be
 * read, the caller shows "—" and says so instead of failing the page.
 */
export type EmailSource = () => Promise<Map<string, string>>;

/** One listing per server request, however many helpers ask for it. */
const listOncePerRequest = cache(listAuthUserEmails);

/** Emails by user id, or null when the sign-in system could not be read. */
export async function readEmails(
  source: EmailSource = listOncePerRequest,
): Promise<Map<string, string> | null> {
  try {
    return await source();
  } catch (error) {
    console.error(
      "admin: emails unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
}
