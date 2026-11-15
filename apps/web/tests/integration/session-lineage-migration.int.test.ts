import {
  buildLegacyTemplate,
  createRehearsalDatabase,
  snapshot,
  type RehearsalDb,
} from "./support/rehearsal";

/**
 * Prescription-Aware Intelligence (spec §8; RD-3): migration
 * 9q_session_lineage, rehearsed on the real-shaped legacy dataset. Every
 * existing session's lineage is its own id, nothing else in any table changes
 * (no logged row is touched), the column is NOT NULL with no DB default,
 * unique per mesocycle, immutable, and sessions keep deny-all RLS.
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

it("backfills each session's lineage to its own id and changes nothing else", async () => {
  const before = await snapshot(db);
  expect(before.sessions.length).toBeGreaterThan(1);
  await db.applyMigrations(["9q_session_lineage"]);
  const after = await snapshot(db);
  for (const row of after.sessions) expect(row.lineage_id).toBe(row.id);
  const withoutLineage = after.sessions.map((r) => {
    const copy = { ...r };
    delete copy.lineage_id;
    return copy;
  });
  expect(withoutLineage).toEqual(before.sessions);
  expect({ ...after, sessions: [] }).toEqual({ ...before, sessions: [] });
});

it("adds a NOT NULL uuid column with no database default", async () => {
  await db.applyMigrations(["9q_session_lineage"]);
  const [col] = await db.sql(
    `SELECT is_nullable, column_default, data_type FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'lineage_id'`,
  );
  expect(col).toEqual({
    is_nullable: "NO",
    column_default: null,
    data_type: "uuid",
  });
});

it("refuses a changed lineage and a duplicate lineage within one mesocycle", async () => {
  await db.applyMigrations(["9q_session_lineage"]);
  const [a] = await db.sql(
    `SELECT id, mesocycle_id FROM "sessions" ORDER BY mesocycle_id, id`,
  );
  await expect(
    db.sql(
      `UPDATE "sessions" SET "lineage_id" = gen_random_uuid() WHERE id = $1`,
      [a.id],
    ),
  ).rejects.toThrow(/lineage never changes/);
  // Other columns stay editable.
  await db.sql(`UPDATE "sessions" SET "name" = 'Renamed' WHERE id = $1`, [
    a.id,
  ]);
  const twins = await db.sql(
    `SELECT s1.id AS one, s2.id AS two, s1.mesocycle_id AS meso
       FROM "sessions" s1 JOIN "sessions" s2
         ON s1.mesocycle_id = s2.mesocycle_id AND s1.id < s2.id LIMIT 1`,
  );
  expect(twins.length).toBe(1);
  await expect(
    db.sql(
      `INSERT INTO "sessions" (id, mesocycle_id, name, position, lineage_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Twin', 99, $2, now(), now())`,
      [twins[0].meso, twins[0].one],
    ),
  ).rejects.toThrow(/sessions_mesocycle_id_lineage_id_key/);
});

it("leaves row-level security on sessions enabled with no policy", async () => {
  await db.applyMigrations(["9q_session_lineage"]);
  const [rls] = await db.sql(
    `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'sessions'`,
  );
  expect(rls.on).toBe(true);
  expect(
    await db.sql(`SELECT 1 FROM pg_policies WHERE tablename = 'sessions'`),
  ).toEqual([]);
});
