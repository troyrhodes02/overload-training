import { randomUUID } from "node:crypto";
import {
  createRehearsalDatabase,
  migrationsUpTo,
  type RehearsalDb,
} from "./support/rehearsal";

/**
 * Onboarding Tour rollout (spec §8, §14.2; R6): migration 9d_tour_progress
 * creates an empty, deny-all table and writes nothing, so every account that
 * exists when it runs has no row — never due, so never toured by itself.
 * Rehearsed in a separate throwaway database inside the embedded Postgres.
 */

let db: RehearsalDb;

beforeEach(async () => {
  db = await createRehearsalDatabase();
  await db.applyMigrations(migrationsUpTo("9c_profile_username"));
});

afterEach(async () => {
  await db.drop();
});

const COUNTED = [
  "profiles",
  "exercises",
  "gyms",
  "mesocycles",
  "sessions",
  "logged_sessions",
  "logged_sets",
  "goals",
  "cardio_logs",
];

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of COUNTED) {
    const [r] = await db.sql(`SELECT count(*)::int AS n FROM "${t}"`);
    out[t] = r.n as number;
  }
  return out;
}

it("leaves existing accounts with no row (never due) and changes nothing else", async () => {
  for (const id of [randomUUID(), randomUUID(), randomUUID()]) {
    await db.sql(
      `INSERT INTO "profiles" ("user_id", "time_zone", "updated_at") VALUES ($1, 'America/Chicago', now())`,
      [id],
    );
  }
  const before = await counts();
  await db.applyMigrations(["9d_tour_progress"]);
  expect(await db.sql(`SELECT 1 FROM "tour_progress"`)).toEqual([]);
  expect(await counts()).toEqual(before);
});

it("creates the table deny-all with the ownership trigger and the outcome check", async () => {
  await db.applyMigrations(["9d_tour_progress"]);
  const [rls] = await db.sql(
    `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'tour_progress'`,
  );
  expect(rls.on).toBe(true);
  expect(
    await db.sql(`SELECT 1 FROM pg_policies WHERE tablename = 'tour_progress'`),
  ).toEqual([]);
  const triggers = await db.sql(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = 'tour_progress'::regclass AND NOT tgisinternal`,
  );
  expect(triggers.map((t) => t.tgname)).toEqual([
    "tour_progress_user_id_immutable",
  ]);
  const checks = await db.sql(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'tour_progress'::regclass AND contype = 'c'`,
  );
  expect(checks.map((c) => c.conname)).toEqual([
    "tour_progress_outcome_at_check",
  ]);
});
