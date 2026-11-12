import {
  buildLegacyTemplate,
  createRehearsalDatabase,
  snapshot,
  type RehearsalDb,
} from "./support/rehearsal";

/**
 * RIR Logging & Autoregulation rollout (spec §8; R4–R7): migration
 * 9f_logged_set_rir only adds a nullable column. Rehearsed on the real-shaped
 * legacy dataset: every existing logged set reads NULL ("not recorded"),
 * nothing else changes, and the CHECK refuses an out-of-range value. No RIR is
 * invented for history.
 */
let template: RehearsalDb;
let db: RehearsalDb;

beforeAll(async () => {
  template = await buildLegacyTemplate();
});

afterAll(async () => {
  await template.drop();
});

beforeEach(async () => {
  db = await createRehearsalDatabase(template.name);
});

afterEach(async () => {
  await db.drop();
});

it("backfills nothing: every existing set reads NULL and no other value changes", async () => {
  const before = await snapshot(db);
  expect(before.logged_sets.length).toBeGreaterThan(0);
  await db.applyMigrations(["9f_logged_set_rir"]);
  const after = await snapshot(db);
  expect(after.logged_sets.every((r) => r.rir === null)).toBe(true);
  // Apart from the new (NULL) key, every row of every table is identical.
  const withoutRir = after.logged_sets.map((r) => {
    const copy = { ...r };
    delete copy.rir;
    return copy;
  });
  expect(withoutRir).toEqual(before.logged_sets);
  expect({ ...after, logged_sets: [] }).toEqual({ ...before, logged_sets: [] });
});

it("adds a nullable column with no default and a 0..4 range check", async () => {
  await db.applyMigrations(["9f_logged_set_rir"]);
  const [col] = await db.sql(
    `SELECT is_nullable, column_default, data_type FROM information_schema.columns
      WHERE table_name = 'logged_sets' AND column_name = 'rir'`,
  );
  expect(col).toEqual({
    is_nullable: "YES",
    column_default: null,
    data_type: "integer",
  });
  const [row] = await db.sql(`SELECT id FROM "logged_sets" LIMIT 1`);
  for (const bad of [5, -1]) {
    await expect(
      db.sql(`UPDATE "logged_sets" SET "rir" = $1 WHERE id = $2`, [
        bad,
        row.id,
      ]),
    ).rejects.toThrow(/logged_sets_rir_range/);
  }
  for (const ok of [0, 4, null]) {
    await db.sql(`UPDATE "logged_sets" SET "rir" = $1 WHERE id = $2`, [
      ok,
      row.id,
    ]);
  }
});

it("leaves row-level security on logged_sets enabled with no policy", async () => {
  await db.applyMigrations(["9f_logged_set_rir"]);
  const [rls] = await db.sql(
    `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'logged_sets'`,
  );
  expect(rls.on).toBe(true);
  expect(
    await db.sql(`SELECT 1 FROM pg_policies WHERE tablename = 'logged_sets'`),
  ).toEqual([]);
});
