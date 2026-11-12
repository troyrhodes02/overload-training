import { randomUUID } from "node:crypto";
import {
  BackfillRefused,
  ENFORCE_MIGRATION,
  EXPAND_MIGRATION,
  executeOwnershipBackfill,
  formatPlan,
  LEGACY_OWNED_TABLES,
  planOwnershipBackfill,
} from "../../scripts/operator/account-ownership/backfill";
import {
  buildLegacyTemplate,
  createAuthUsers,
  createRehearsalDatabase,
  LEGACY,
  migrationsUpTo,
  snapshot,
  type RehearsalDb,
} from "./support/rehearsal";

/**
 * Multi-User Foundation — Stage 2 (ASSIGN) rehearsed on real-shaped
 * pre-ownership data (spec §11 operator backfill, §14.4; R15, R16, R22).
 * Every database here is a separate throwaway copy inside the embedded test
 * Postgres; nothing touches Supabase.
 */

let template: RehearsalDb;
const open: RehearsalDb[] = [];

beforeAll(async () => {
  template = await buildLegacyTemplate();
}, 120_000);

afterEach(async () => {
  while (open.length) await open.pop()!.drop();
});

afterAll(async () => {
  await template.drop();
});

/** A copy of the legacy template, at migration 8, optionally expanded (9). */
async function legacyCopy(expand = true): Promise<RehearsalDb> {
  const db = await createRehearsalDatabase(template.name);
  open.push(db);
  if (expand) await db.applyMigrations([EXPAND_MIGRATION]);
  return db;
}

const input = { email: "lifter@example.com", timeZone: "America/Chicago" };

describe("dry run", () => {
  it("reports the plan, resolves the named account case-insensitively, and writes nothing", async () => {
    const db = await legacyCopy();
    const before = await snapshot(db);

    const plan = await planOwnershipBackfill(db.prisma, input);
    expect(plan.refusals).toEqual([]);
    expect(plan.account).toEqual({
      userId: LEGACY.owner.id,
      email: LEGACY.owner.email,
    });
    expect(plan.authUserCount).toBe(1);
    expect(plan.profile).toBe("create");
    expect(plan.tables.mesocycles).toEqual({
      total: 2,
      unowned: 2,
      ownedByOther: 0,
    });
    expect(plan.tables.logged_sets).toEqual({
      total: 14,
      unowned: 14,
      ownedByOther: 0,
    });
    expect(plan.customExercises).toEqual({
      total: 2,
      unowned: 2,
      ownedByOther: 0,
    });
    expect(plan.library).toEqual({ total: 6, archived: 1, owned: 0 });
    expect(plan.favoritesToCopy).toBe(3);

    expect(await snapshot(db)).toEqual(before);
    expect(await db.sql(`SELECT * FROM profiles`)).toEqual([]);
    expect(await db.sql(`SELECT * FROM exercise_favorites`)).toEqual([]);

    const text = formatPlan(plan, "127.0.0.1");
    expect(text).toContain("Target database host : 127.0.0.1");
    expect(text).toContain(LEGACY.owner.id);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
  });
});

describe("execute", () => {
  it("assigns every legacy row to the account and preserves every value", async () => {
    const db = await legacyCopy();
    const before = await snapshot(db);
    const favoritesBefore = (
      await db.sql(`SELECT id FROM exercises WHERE is_favorite ORDER BY id`)
    ).map((r) => r.id);

    const result = await executeOwnershipBackfill(db.prisma, input);

    // Values: every row of every legacy table is identical apart from user_id.
    expect(await snapshot(db)).toEqual(before);
    for (const [table, b] of Object.entries(result.before)) {
      expect([table, result.after[table]]).toEqual([table, b]);
    }

    // Ownership: every owned row is the account's; library stays shared.
    for (const table of LEGACY_OWNED_TABLES) {
      const rows = await db.sql(
        `SELECT count(*)::int AS n FROM "${table}" WHERE user_id IS DISTINCT FROM $1::uuid`,
        [LEGACY.owner.id],
      );
      expect([table, rows[0].n]).toEqual([table, 0]);
    }
    expect(
      await db.sql(
        `SELECT is_custom, user_id::text AS user_id FROM exercises ORDER BY id`,
      ),
    ).toEqual([
      ...Array(6).fill({ is_custom: false, user_id: null }),
      { is_custom: true, user_id: LEGACY.owner.id },
      { is_custom: true, user_id: LEGACY.owner.id },
    ]);

    // Favorites carried over exactly; profile created with the supplied zone.
    expect(
      (
        await db.sql(
          `SELECT exercise_id, user_id::text AS user_id FROM exercise_favorites ORDER BY exercise_id`,
        )
      ).map((r) => [r.exercise_id, r.user_id]),
    ).toEqual(favoritesBefore.map((id) => [id, LEGACY.owner.id]));
    expect(
      await db.sql(
        `SELECT user_id::text AS user_id, time_zone, first_name, last_name FROM profiles`,
      ),
    ).toEqual([
      {
        user_id: LEGACY.owner.id,
        time_zone: "America/Chicago",
        first_name: null,
        last_name: null,
      },
    ]);
    expect(result.profileCreated).toBe(true);
    expect(result.favoritesCopied).toBe(3);
    expect(result.assigned.logged_sets).toBe(14);
    expect(result.assigned.exercises).toBe(2);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const db = await legacyCopy();
    await executeOwnershipBackfill(db.prisma, input);
    const after1 = await snapshot(db);
    const again = await executeOwnershipBackfill(db.prisma, input);
    expect(Object.values(again.assigned).every((n) => n === 0)).toBe(true);
    expect(again.favoritesCopied).toBe(0);
    expect(again.profileCreated).toBe(false);
    expect(await snapshot(db)).toEqual(after1);
  });

  it("assigns rows the old code wrote between expand and assign", async () => {
    const db = await legacyCopy();
    await db.sql(
      `INSERT INTO gyms (id, name, created_at, updated_at) VALUES ($1, 'New Gym', now(), now())`,
      [randomUUID()],
    );
    await executeOwnershipBackfill(db.prisma, input);
    expect(
      await db.sql(`SELECT count(*)::int AS n FROM gyms WHERE user_id IS NULL`),
    ).toEqual([{ n: 0 }]);
  });
});

describe("refusals change nothing", () => {
  async function expectRefused(
    db: RehearsalDb,
    args: typeof input,
    match: RegExp,
  ) {
    const before = await snapshot(db);
    const plan = await planOwnershipBackfill(db.prisma, args);
    expect(plan.refusals.join("\n")).toMatch(match);
    await expect(
      executeOwnershipBackfill(db.prisma, args),
    ).rejects.toBeInstanceOf(BackfillRefused);
    expect(await snapshot(db)).toEqual(before);
    expect(await db.sql(`SELECT count(*)::int AS n FROM profiles`)).toEqual([
      { n: 0 },
    ]);
  }

  it("an email that matches no account", async () => {
    const db = await legacyCopy();
    await expectRefused(
      db,
      { ...input, email: "someone@else.com" },
      /No account has that email/,
    );
    // Personal data: the refusal never repeats the email (CLAUDE.md).
    const plan = await planOwnershipBackfill(db.prisma, {
      ...input,
      email: "someone@else.com",
    });
    expect(plan.refusals.join("\n")).not.toContain("someone@else.com");
    await expect(
      executeOwnershipBackfill(db.prisma, {
        ...input,
        email: "someone@else.com",
      }),
    ).rejects.not.toThrow(/someone@else\.com/);
  });

  it("a missing email", async () => {
    await expectRefused(
      await legacyCopy(),
      { ...input, email: "  " },
      /No target account email/,
    );
  });

  it("an invalid timezone", async () => {
    await expectRefused(
      await legacyCopy(),
      { ...input, timeZone: "Mars/Olympus_Mons" },
      /not a valid IANA timezone/,
    );
  });

  it("more than one account in auth.users", async () => {
    const db = await legacyCopy();
    await createAuthUsers(db, [
      { id: randomUUID(), email: "friend@example.com" },
    ]);
    await expectRefused(db, input, /Expected exactly one account/);
  });

  it("before migration 9 (expand) is applied", async () => {
    const db = await legacyCopy(false);
    const plan = await planOwnershipBackfill(db.prisma, input);
    expect(plan.refusals.join("\n")).toMatch(/is not applied/);
    await expect(
      executeOwnershipBackfill(db.prisma, input),
    ).rejects.toBeInstanceOf(BackfillRefused);
  });

  it("after the enforce migration is recorded as applied", async () => {
    const db = await legacyCopy();
    await db.sql(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, 'x', now(), $2, 1)`,
      [randomUUID(), ENFORCE_MIGRATION],
    );
    await expectRefused(db, input, /already applied/);
  });

  it("an existing profile with a different timezone (never overwritten)", async () => {
    const db = await legacyCopy();
    await db.sql(
      `INSERT INTO profiles (user_id, time_zone, created_at, updated_at) VALUES ($1, 'Europe/Berlin', now(), now())`,
      [LEGACY.owner.id],
    );
    const before = await snapshot(db);
    const plan = await planOwnershipBackfill(db.prisma, input);
    expect(plan.refusals.join("\n")).toMatch(/different timezone/);
    await expect(
      executeOwnershipBackfill(db.prisma, input),
    ).rejects.toBeInstanceOf(BackfillRefused);
    expect(await snapshot(db)).toEqual(before);
    expect(await db.sql(`SELECT time_zone FROM profiles`)).toEqual([
      { time_zone: "Europe/Berlin" },
    ]);
  });

  it("rows already owned by another account", async () => {
    const db = await legacyCopy();
    const other = randomUUID();
    await db.sql(
      `INSERT INTO profiles (user_id, time_zone, created_at, updated_at) VALUES ($1, 'UTC', now(), now())`,
      [other],
    );
    await db.sql(`UPDATE gyms SET user_id = $1 WHERE id = $2`, [
      other,
      LEGACY.gym.campus,
    ]);
    const plan = await planOwnershipBackfill(db.prisma, input);
    expect(plan.refusals.join("\n")).toMatch(/belong to a different account/);
    expect(plan.refusals.join("\n")).toMatch(/profile\(s\) for other accounts/);
    await expect(
      executeOwnershipBackfill(db.prisma, input),
    ).rejects.toBeInstanceOf(BackfillRefused);
  });

  it("a database with no auth schema", async () => {
    const db = await createRehearsalDatabase();
    open.push(db);
    await db.applyMigrations(migrationsUpTo(EXPAND_MIGRATION));
    const plan = await planOwnershipBackfill(db.prisma, input);
    expect(plan.refusals.join("\n")).toMatch(/not a Supabase database/);
  });
});

/**
 * Stage 3 (ENFORCE) at the end of the rehearsal: the whole staged conversion,
 * legacy data → expand → assign → enforce, exactly as the runbook performs it.
 */
describe("the full staged conversion (expand → assign → enforce)", () => {
  async function schemaState(db: RehearsalDb) {
    const [nullable] = await db.sql(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'logged_sets' AND column_name = 'user_id'`,
    );
    const [triggers] = await db.sql(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal`,
    );
    const indexes = (
      await db.sql(
        `SELECT indexname FROM pg_indexes
          WHERE indexname IN ('mesocycles_single_active', 'mesocycles_single_active_per_user',
                              'goals_one_active_per_exercise', 'goals_one_active_per_exercise_per_user')
          ORDER BY 1`,
      )
    ).map((r) => r.indexname);
    const [enforced] = await db.sql(
      `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1`,
      [ENFORCE_MIGRATION],
    );
    return {
      nullable: nullable.is_nullable,
      triggers: triggers.n,
      indexes,
      enforced: enforced.n,
    };
  }

  it("preserves every row and value end to end and leaves ownership mandatory", async () => {
    const db = await legacyCopy();
    const before = await snapshot(db);
    await executeOwnershipBackfill(db.prisma, input);
    await db.applyMigrations([ENFORCE_MIGRATION]);

    expect(await snapshot(db)).toEqual(before);
    expect(await schemaState(db)).toEqual({
      nullable: "NO",
      triggers: 35,
      indexes: [
        "goals_one_active_per_exercise_per_user",
        "mesocycles_single_active_per_user",
      ],
      enforced: 1,
    });
    // Library rows remain shared and untouched (incl. the archived one).
    expect(
      await db.sql(
        `SELECT count(*)::int AS n FROM exercises WHERE NOT is_custom AND user_id IS NULL`,
      ),
    ).toEqual([{ n: 6 }]);
    // Ownership is now immutable at the database.
    await expect(
      db.sql(`UPDATE gyms SET user_id = NULL WHERE id = $1`, [
        LEGACY.gym.downtown,
      ]),
    ).rejects.toThrow();
  });

  it("refuses to enforce while anything is unassigned — and changes nothing", async () => {
    const db = await legacyCopy();
    const before = await snapshot(db);
    const state = await schemaState(db);
    await expect(db.applyMigrations([ENFORCE_MIGRATION])).rejects.toThrow(
      /Ownership backfill incomplete: mesocycles has 2 row\(s\) without an owner/,
    );
    expect(await schemaState(db)).toEqual(state);
    expect(state).toMatchObject({ nullable: "YES", triggers: 0, enforced: 0 });
    expect(await snapshot(db)).toEqual(before);
  });

  it("refuses to enforce over a cross-account reference — and changes nothing", async () => {
    const db = await legacyCopy();
    await executeOwnershipBackfill(db.prisma, input);
    const other = randomUUID();
    await db.sql(
      `INSERT INTO profiles (user_id, time_zone, created_at, updated_at) VALUES ($1, 'UTC', now(), now())`,
      [other],
    );
    await db.sql(`UPDATE gyms SET user_id = $1 WHERE id = $2`, [
      other,
      LEGACY.gym.downtown,
    ]);
    const state = await schemaState(db);
    await expect(db.applyMigrations([ENFORCE_MIGRATION])).rejects.toThrow(
      /reference a gyms row of a different account/,
    );
    expect(await schemaState(db)).toEqual(state);
  });

  it("applies cleanly to an empty database (fresh environments)", async () => {
    const db = await createRehearsalDatabase();
    open.push(db);
    await db.applyMigrations(migrationsUpTo(ENFORCE_MIGRATION));
    expect(await schemaState(db)).toMatchObject({
      nullable: "NO",
      triggers: 35,
      enforced: 1,
    });
  });
});
