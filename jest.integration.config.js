/**
 * Integration test project. Runs against a THROWAWAY local Postgres reached
 * through TEST_DATABASE_URL (an embedded Postgres is provisioned automatically
 * when the var is unset). Never connects to Supabase, and never falls back to
 * DATABASE_URL.
 *
 * Run serially (maxWorkers: 1) so tests share one throwaway database with a
 * truncate between each.
 *
 * workerIdleMemoryLimit recycles the single worker's heap when it grows past the
 * limit, so a late-running suite starts from a clean heap. This keeps the
 * memory-sensitive native dependencies used by a few suites (pdfjs-dist's ESM
 * parser, sharp) from degrading under accumulated heap pressure across the full
 * serial run — the cause of an intermittent import-pdf parse flake.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: "integration",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testMatch: ["**/*.int.test.ts"],
  maxWorkers: 1,
  workerIdleMemoryLimit: "512MB",
  globalSetup: "<rootDir>/tests/integration/support/global-setup.ts",
  globalTeardown: "<rootDir>/tests/integration/support/global-teardown.ts",
  setupFilesAfterEnv: ["<rootDir>/tests/integration/support/after-env.ts"],
  moduleNameMapper: {
    // App modules import the shared client from @/lib/db; in integration tests
    // that resolves to a client bound to TEST_DATABASE_URL (never DATABASE_URL).
    "^@/lib/db$": "<rootDir>/tests/integration/support/app-db.ts",
    // `server-only` throws outside an RSC bundle; stub it for Node tests.
    "^server-only$": "<rootDir>/tests/support/empty-module.js",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.jest.json" },
    ],
  },
  testTimeout: 60000,
};
