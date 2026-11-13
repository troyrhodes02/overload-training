/**
 * Unit test project. Fast, no database, no network.
 * Integration tests (which need a throwaway Postgres) live in
 * tests/integration/*.int.test.ts and run via jest.integration.config.js.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: "unit",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests/unit"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "\\.int\\.test\\.ts$"],
  moduleNameMapper: {
    // `server-only` throws by design when loaded outside an RSC bundle; stub it.
    "^server-only$": "<rootDir>/tests/support/empty-module.js",
    "^@/(.*)$": "<rootDir>/src/$1",
    // Pitch 21b: @overload/shared is source-only TypeScript in the workspace's
    // packages/shared; map its subpath exports ("./*" -> "./src/*.ts") so ts-jest
    // compiles it like the web's own source.
    "^@overload/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.jest.json" },
    ],
  },
};
