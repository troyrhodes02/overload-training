/**
 * Refuses to run the catalog import unless its two targets — the database
 * (DATABASE_URL) and Storage (NEXT_PUBLIC_SUPABASE_URL + service-role key) —
 * are the SAME environment, and refuses a remote environment unless the
 * operator confirms the exact database host (spec D29). The repo's local `.env`
 * has, at times, held production values; an accidental or mixed run must not
 * write rows to one project and images to another.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(url: string, label: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
}

/** Supabase project ref from `https://<ref>.supabase.co`, or null. */
function supabaseProjectRef(supabaseHost: string): string | null {
  const match = /^([a-z0-9]+)\.supabase\.(co|com|in|net)$/i.exec(supabaseHost);
  return match ? match[1].toLowerCase() : null;
}

/** Does this Postgres URL belong to the given Supabase project? */
function databaseBelongsToProject(databaseUrl: string, ref: string): boolean {
  const url = new URL(databaseUrl);
  const user = decodeURIComponent(url.username).toLowerCase();
  const host = url.hostname.toLowerCase();
  // Pooler: user `postgres.<ref>`; direct: host `db.<ref>.supabase.co`.
  return user.endsWith(`.${ref}`) || host === `db.${ref}.supabase.co`;
}

export function assertImportTargetAllowed(
  databaseUrl: string | undefined,
  supabaseUrl: string | undefined,
  confirmHost: string | undefined,
): { host: string; remote: boolean } {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set; the import has no target.");
  }
  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set; the import has no Storage target.",
    );
  }
  const host = hostOf(databaseUrl, "DATABASE_URL");
  const storageHost = hostOf(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const dbLocal = LOCAL_HOSTS.has(host);
  const storageLocal = LOCAL_HOSTS.has(storageHost);

  if (dbLocal && storageLocal) return { host, remote: false };
  if (dbLocal !== storageLocal) {
    throw new Error(
      `Refusing to import: the database ("${host}") and Storage ("${storageHost}") ` +
        "are different environments. Both must be local, or both the same remote project.",
    );
  }

  const ref = supabaseProjectRef(storageHost);
  if (!ref || !databaseBelongsToProject(databaseUrl, ref)) {
    throw new Error(
      `Refusing to import: DATABASE_URL does not belong to the Supabase project at "${storageHost}". ` +
        "Rows and images must go to the same project.",
    );
  }
  if (confirmHost !== host) {
    throw new Error(
      `Refusing to import into non-local database host "${host}". ` +
        `If this is the deliberate, runbook-driven production import, re-run with ` +
        `OVERLOAD_IMPORT_CONFIRM_HOST=${host}.`,
    );
  }
  return { host, remote: true };
}
