import {
  DomainError,
  type ActionError,
  type ActionResult,
} from "@/lib/actions/result";

/**
 * Workout Plan Import & Review (Pitch 22) — one place that turns any failure in
 * the import flow into a short, honest, user-safe message, and logs a sanitized
 * diagnostic server-side. Distinguishes:
 *   - deliberate validation (DomainError) → its own message, unchanged;
 *   - an expired login (Next's redirect signal) → "sign in and try again";
 *   - a Storage failure / PDF-engine failure → a transient "try again";
 *   - anything else → the action's generic fallback.
 * A raw exception message never reaches the user, and the log carries the error
 * name and codes only (plus Storage's own message, which holds no secrets) —
 * never source content, prompt text, or a connection string.
 */

export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Sign in and try again.";
export const UPLOAD_FAILED_MESSAGE =
  "The file couldn't be uploaded. Please try again.";
export const PDF_ENGINE_MESSAGE =
  "We couldn't process this PDF right now. Please try again.";
export const EXTRACTION_UNAVAILABLE_MESSAGE =
  "Plan extraction is temporarily unavailable. Try again later.";
export const IMPORT_EXPIRED_MESSAGE =
  "This import has expired. Start a new import.";

/** The stored-object upload to Supabase Storage failed (not the file's fault). */
export class StorageUploadError extends Error {
  constructor(readonly detail: string) {
    super("Source upload failed");
    this.name = "StorageUploadError";
  }
}

/** The PDF library itself could not load (a server problem, not a bad PDF). */
export class PdfEngineError extends Error {
  constructor() {
    super("PDF engine unavailable");
    this.name = "PdfEngineError";
  }
}

/** Next signals redirect()/notFound() by throwing an error with a digest. */
function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Pure: the user-facing error for a thrown value. */
export function mapImportError(error: unknown, fallback: string): ActionError {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (isRedirect(error)) {
    return { code: "unauthorized", message: SESSION_EXPIRED_MESSAGE };
  }
  if (error instanceof StorageUploadError) {
    return { code: "internal_error", message: UPLOAD_FAILED_MESSAGE };
  }
  if (error instanceof PdfEngineError) {
    return { code: "internal_error", message: PDF_ENGINE_MESSAGE };
  }
  return { code: "internal_error", message: fallback };
}

/** A log line with no source content: names and codes only. */
function logLine(operation: string, error: unknown): string {
  const e = (error ?? {}) as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
  };
  const parts = [
    typeof e.name === "string" ? e.name : typeof error,
    typeof e.code === "string" || typeof e.code === "number"
      ? `code=${e.code}`
      : "",
    typeof e.status === "number" ? `status=${e.status}` : "",
    error instanceof StorageUploadError ? `storage="${error.detail}"` : "",
  ].filter(Boolean);
  return `plan-import: ${operation} failed (${parts.join(" ")})`;
}

/** The import actions' replacement for toActionResult. */
export async function importResult<T>(
  operation: string,
  run: () => Promise<T>,
  fallback: string,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    const mapped = mapImportError(error, fallback);
    if (mapped.code === "internal_error") {
      console.error(logLine(operation, error));
    }
    return { ok: false, error: mapped };
  }
}
