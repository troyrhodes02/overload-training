import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabaseUrl } from "./assert-test-db";

/**
 * A Prisma client bound explicitly to TEST_DATABASE_URL via a per-test
 * datasource override. It is built from the throwaway database only and never
 * reads DATABASE_URL (the app singleton in src/lib/db.ts is not imported here).
 */
export const APP_TABLES = [
  "mesocycles",
  "sessions",
  "session_exercises",
  "exercises",
  "gyms",
  "gym_exercise_baselines",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "goals",
  "cardio_logs",
] as const;

let client: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!client) {
    const connectionString = assertTestDatabaseUrl();
    const adapter = new PrismaPg({ connectionString });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/** Reset all application tables between tests. */
export async function truncateAll(): Promise<void> {
  const prisma = getTestPrisma();
  const list = APP_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`,
  );
}
