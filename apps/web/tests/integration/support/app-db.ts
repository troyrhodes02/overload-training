import { getTestPrisma } from "./db";

/**
 * Integration-test stand-in for `src/lib/db.ts` (wired via moduleNameMapper in
 * jest.integration.config.js). Application read/write modules therefore run
 * against the THROWAWAY test database; the real singleton — which would read
 * DATABASE_URL — is never constructed in integration tests.
 */
export const prisma = getTestPrisma();
