import { randomUUID } from "node:crypto";
import {
  createRehearsalDatabase,
  migrationsUpTo,
  type RehearsalDb,
} from "./support/rehearsal";

/**
 * What's New rollout (spec §8, §14.2; R9, R24): migration 9e_release_seen
 * creates an empty, deny-all table and writes nothing, so every account that
 * exists when it runs has no row (shown nothing; with no entries at launch,
 * nothing is unseen). Rehearsed in a separate throwaway database inside the
 * embedded Postgres.
 */

let db: RehearsalDb;

beforeEach(async () => {
  db = await createRehearsalDatabase();
  await db.applyMigrations(migrationsUpTo("9d_tour_progress"));
});

afterEach(async () => {
  await db.drop();
});

const COUNTED = [
  "profiles",
  "tour_progress",
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

async function addProfile(): Promise<string> {
  const id = randomUUID();
  await db.sql(
    `INSERT INTO "profiles" ("user_id", "time_zone", "updated_at") VALUES ($1, 'America/Chicago', now())`,
    [id],
  );
  return id;
}

it("leaves existing accounts with no row and changes nothing else", async () => {
  for (let i = 0; i < 3; i++) await addProfile();
  const before = await counts();
  await db.applyMigrations(["9e_release_seen"]);
  expect(await db.sql(`SELECT 1 FROM "release_seen"`)).toEqual([]);
  expect(await counts()).toEqual(before);
});

it("creates the table deny-all with the ownership trigger and the id check", async () => {
  await db.applyMigrations(["9e_release_seen"]);
  const [rls] = await db.sql(
    `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'release_seen'`,
  );
  expect(rls.on).toBe(true);
  expect(
    await db.sql(`SELECT 1 FROM pg_policies WHERE tablename = 'release_seen'`),
  ).toEqual([]);
  const triggers = await db.sql(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = 'release_seen'::regclass AND NOT tgisinternal`,
  );
  expect(triggers.map((t) => t.tgname)).toEqual([
    "release_seen_user_id_immutable",
  ]);
  const checks = await db.sql(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'release_seen'::regclass AND contype = 'c'`,
  );
  expect(checks.map((c) => c.conname)).toEqual([
    "release_seen_last_seen_release_id_check",
  ]);
});

it("enforces the id format, the owner FK, and immutable ownership", async () => {
  await db.applyMigrations(["9e_release_seen"]);
  const owner = await addProfile();
  const other = await addProfile();
  const insert = (userId: string, id: string) =>
    db.sql(
      `INSERT INTO "release_seen" ("user_id", "last_seen_release_id", "last_seen_at", "updated_at") VALUES ($1, $2, now(), now())`,
      [userId, id],
    );
  await expect(insert(owner, "Not A Slug")).rejects.toThrow();
  await expect(insert(owner, `a${"-b".repeat(40)}`)).rejects.toThrow();
  await expect(insert(randomUUID(), "2026-11-03-faster")).rejects.toThrow();
  await insert(owner, "2026-11-03-faster");
  await expect(
    db.sql(`UPDATE "release_seen" SET "user_id" = $1 WHERE "user_id" = $2`, [
      other,
      owner,
    ]),
  ).rejects.toThrow();
});
