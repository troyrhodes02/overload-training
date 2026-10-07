/**
 * Guard: integration tests may only ever talk to a throwaway Postgres reached
 * through TEST_DATABASE_URL. There is NO fallback to DATABASE_URL, and the URL
 * must not point at any Supabase host (dev or prod).
 *
 * Call this before opening any connection.
 */
export function assertTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests require a throwaway " +
        "local Postgres and must never fall back to DATABASE_URL.",
    );
  }

  // Never connect to a real Supabase database.
  if (/supabase\.(co|com|in|net)/i.test(url)) {
    throw new Error(
      "TEST_DATABASE_URL points at a Supabase host. Integration tests must " +
        "use a throwaway local Postgres, never a Supabase database.",
    );
  }

  // Defense in depth: refuse if it happens to equal DATABASE_URL.
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL equals DATABASE_URL. Tests must use a separate " +
        "throwaway database.",
    );
  }

  return url;
}
