/**
 * Record ids are UUIDs. Checked before any lookup, so a malformed id reads as
 * not-found rather than reaching the database (moved from
 * apps/web/src/lib/actions/result.ts in Pitch 21b).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
