/**
 * Integration test project. Runs against a THROWAWAY local Postgres reached
 * through TEST_DATABASE_URL (an embedded Postgres is provisioned automatically
 * when the var is unset). Never connects to Supabase, and never falls back to
 * DATABASE_URL.
 *
 * Run serially (maxWorkers: 1) so tests share one throwaway database with a
 * truncate between each.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: "integration",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testMatch: ["**/*.int.test.ts"],
  maxWorkers: 1,
  globalSetup: "<rootDir>/tests/integration/support/global-setup.ts",
  globalTeardown: "<rootDir>/tests/integration/support/global-teardown.ts",
  setupFilesAfterEnv: ["<rootDir>/tests/integration/support/after-env.ts"],
  moduleNameMapper: {
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
