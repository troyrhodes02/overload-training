import "server-only";
import { createClient } from "@supabase/supabase-js";
import { screenshotExtension } from "./attachment-validation";

/**
 * Feedback screenshot Storage (Admin Center & Feedback). The ONE module besides
 * the auth-admin facade that reads SUPABASE_SERVICE_ROLE_KEY: the
 * feedback-screenshots bucket is PRIVATE with no Storage policies (deny-all,
 * like every app table), so only the service role can write an upload or mint a
 * read URL. Nothing here touches an application table — the Supabase client is
 * for auth and Storage only.
 *
 * Object paths are owner-prefixed (`<userId>/<group>/<n>.<ext>`); the caller
 * builds the prefix from the session-derived account id, so this module never
 * handles the account id itself. Admin viewing reads back through short-lived
 * signed URLs; the bucket is never public.
 */

export const FEEDBACK_SCREENSHOT_BUCKET = "feedback-screenshots";

/** Minted read URLs expire quickly: the admin views, they do not get a link. */
const SIGNED_URL_TTL_SECONDS = 300;

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Feedback screenshot storage is not configured.");
  }
  // Named so it is never the Data-API `supabase.from(...)` the scope guard bans.
  const service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service.storage.from(FEEDBACK_SCREENSHOT_BUCKET);
}

export type UploadedScreenshot = {
  objectPath: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Upload screenshots under `keyPrefix` (the caller's owner-prefixed group), in
 * order. On any failure the already-uploaded objects in the group are removed
 * best-effort and the error is rethrown, so a half-written group never lingers.
 */
export async function uploadFeedbackScreenshots(
  keyPrefix: string,
  files: { bytes: Uint8Array; contentType: string; sizeBytes: number }[],
): Promise<UploadedScreenshot[]> {
  const bucket = storageClient();
  const uploaded: UploadedScreenshot[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const objectPath = `${keyPrefix}/${i}.${screenshotExtension(f.contentType)}`;
      const { error } = await bucket.upload(objectPath, f.bytes, {
        contentType: f.contentType,
        upsert: false,
        cacheControl: "3600",
      });
      if (error) throw error;
      uploaded.push({
        objectPath,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
      });
    }
    return uploaded;
  } catch (error) {
    await removeFeedbackScreenshots(uploaded.map((u) => u.objectPath));
    throw error;
  }
}

/** Remove stored screenshots by path. Best-effort: failures are swallowed. */
export async function removeFeedbackScreenshots(
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  try {
    await storageClient().remove(paths);
  } catch {
    // Orphaned objects are a cleanup concern, never a correctness one.
  }
}

/**
 * Short-lived signed read URLs for the admin viewer, by object path. A path
 * that cannot be signed maps to null (shown as unavailable), never an error
 * that breaks the page.
 */
export async function signFeedbackScreenshotUrls(
  paths: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (paths.length === 0) return out;
  const { data } = await storageClient().createSignedUrls(
    paths,
    SIGNED_URL_TTL_SECONDS,
  );
  for (const path of paths) out.set(path, null);
  for (const row of data ?? []) {
    if (row.path && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}
