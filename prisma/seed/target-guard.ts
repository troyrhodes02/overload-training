/**
 * Refuses to run the catalog import against a non-local database unless the
 * operator explicitly confirms the exact host (spec D29). The repo's local
 * `.env` has, at times, held production values; an accidental `npm run
 * db:seed` must not touch production.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL.");
  }
}

export function assertImportTargetAllowed(
  databaseUrl: string | undefined,
  confirmHost: string | undefined,
): { host: string; remote: boolean } {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set; the import has no target.");
  }
  const host = databaseHost(databaseUrl);
  if (LOCAL_HOSTS.has(host)) return { host, remote: false };
  if (confirmHost !== host) {
    throw new Error(
      `Refusing to import into non-local database host "${host}". ` +
        `If this is the deliberate, runbook-driven production import, re-run with ` +
        `OVERLOAD_IMPORT_CONFIRM_HOST=${host}.`,
    );
  }
  return { host, remote: true };
}
