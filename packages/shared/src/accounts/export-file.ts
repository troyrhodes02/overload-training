/**
 * The data-export FILE (Public Accounts spec §9, R7; Pitch 21j RD-12). Moved
 * here from apps/web/src/lib/accounts/export.ts so the web download and the
 * iPhone share sheet name and serialize the same document identically. The
 * document itself is built only on the server (`buildAccountExport`).
 */

/** Every export file name starts with this. */
export const EXPORT_FILE_PREFIX = "overload-export-";

/** `overload-export-YYYY-MM-DD.json`, from the export's own `exportedOn`. */
export function exportFilename(exportedOn: string): string {
  return `${EXPORT_FILE_PREFIX}${exportedOn}.json`;
}

/** The file's bytes: two-space JSON, the web download's format since R7. */
export function serializeAccountExport(doc: unknown): string {
  return JSON.stringify(doc, null, 2);
}

/** The export format version the clients know how to save. */
export const EXPORT_FORMAT_VERSION = 1 as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a parsed response is a complete export the app may write: an object
 * of the known format version with a calendar `exportedOn`. A truncated or
 * foreign body never parses into this shape, so it is never saved.
 */
export function isAccountExport(
  value: unknown,
): value is { formatVersion: 1; exportedOn: string } & Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v.formatVersion === EXPORT_FORMAT_VERSION &&
    typeof v.exportedOn === "string" &&
    ISO_DATE.test(v.exportedOn)
  );
}
