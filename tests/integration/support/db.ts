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
  "planned_cardio",
  "missed_day_resolutions",
  // Multi-User Foundation
  "exercise_favorites",
  "profiles",
  // Onboarding Tour
  "tour_progress",
  // What's New
  "release_seen",
  // Admin Center & Feedback (TRUNCATE does not fire the append-only trigger)
  "feedback",
  "admin_audit_entries",
  // Public Accounts: the un-owned pre-auth rate limiter.
  "auth_throttle",
] as const;

/** Tables that belong to no account (spec 17 R11): no owner column at all. */
export const ADMIN_ONLY_TABLES: readonly string[] = ["admin_audit_entries"];

/**
 * Every application table with no owner column: the admin audit log (spec 17
 * R11) and the pre-auth rate limiter (Public Accounts R5). Neither carries a
 * user_id; both are sanctioned un-owned infrastructure.
 */
export const UNOWNED_TABLES: readonly string[] = [
  ...ADMIN_ONLY_TABLES,
  "auth_throttle",
];

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
