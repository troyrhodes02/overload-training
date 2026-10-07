import EmbeddedPostgres from "embedded-postgres";
import os from "node:os";
import path from "node:path";

/**
 * Provisions a throwaway local Postgres for integration tests.
 *
 * If TEST_DATABASE_URL is already set (e.g. a CI Postgres service container),
 * it is used as-is and no embedded server is started. Otherwise an ephemeral
 * embedded Postgres is booted and TEST_DATABASE_URL is pointed at it.
 *
 * This NEVER reads DATABASE_URL.
 */
export type EmbeddedHandle = {
  stop: () => Promise<void>;
};

const PORT = Number(process.env.TEST_PG_PORT ?? 5433);
const DB_NAME = "overload_test";
const USER = "overload_test";
const PASSWORD = "overload_test";

export async function provisionTestDatabase(): Promise<EmbeddedHandle> {
  // Honor an externally provided throwaway database (CI).
  if (process.env.TEST_DATABASE_URL) {
    return { stop: async () => {} };
  }

  const databaseDir = path.join(
    os.tmpdir(),
    `overload-test-pg-${process.pid}-${PORT}`,
  );

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB_NAME);

  process.env.TEST_DATABASE_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;

  return {
    stop: async () => {
      await pg.stop();
    },
  };
}
