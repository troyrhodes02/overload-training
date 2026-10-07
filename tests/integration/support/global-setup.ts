import { execSync } from "node:child_process";
import path from "node:path";
import { provisionTestDatabase } from "./embedded";
import { assertTestDatabaseUrl } from "./assert-test-db";

// Holds the embedded handle for teardown.
declare global {
  var __OVERLOAD_PG__: { stop: () => Promise<void> } | undefined;
}

export default async function globalSetup(): Promise<void> {
  const handle = await provisionTestDatabase();
  globalThis.__OVERLOAD_PG__ = handle;

  const url = assertTestDatabaseUrl();

  // Apply migrations to the throwaway database only. The Prisma CLI reads the
  // connection from prisma.config.ts (DIRECT_URL); we point both DIRECT_URL and
  // DATABASE_URL at the throwaway URL for this child process so nothing can
  // reach a real database.
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
    stdio: "inherit",
  });
}
