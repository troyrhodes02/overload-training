import { getTestPrisma, APP_TABLES, ADMIN_ONLY_TABLES } from "./support/db";

/**
 * Schema invariants: the Architecture Doc's core entities exist, derived values
 * are never stored, there is no ownership column, and Foundation seeds no data.
 */
describe("schema invariants", () => {
  it("contains all eleven approved core entities", async () => {
    const prisma = getTestPrisma();
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    for (const table of APP_TABLES) {
      expect(present.has(table)).toBe(true);
    }
  });

  it("stores NO progression tag or e1RM column on the logged chain", async () => {
    const prisma = getTestPrisma();
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('logged_exercises', 'logged_sets')
          AND (column_name ILIKE '%tag%'
               OR column_name ILIKE '%e1rm%'
               OR column_name ILIKE '%one_rep%')`,
    );
    expect(rows).toEqual([]);
  });

  // Multi-User Foundation replaced the single-user "no ownership column"
  // invariant: every application table now carries its owning account
  // (CLAUDE.md first invariant; Architecture → Ownership). One owner column
  // name only — no second tenant/owner/account key.
  it("every application table carries user_id, and no other owner column", async () => {
    const prisma = getTestPrisma();
    const rows = await prisma.$queryRawUnsafe<
      { table_name: string; column_name: string }[]
    >(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
          AND column_name IN ('user_id', 'owner_id', 'tenant_id', 'account_id')
        ORDER BY table_name`,
      APP_TABLES as unknown as string[],
    );
    expect(rows.map((r) => r.column_name).every((c) => c === "user_id")).toBe(
      true,
    );
    // Admin Center & Feedback: the admin-only audit log has no owner column.
    expect(rows.map((r) => r.table_name)).toEqual(
      APP_TABLES.filter((t) => !ADMIN_ONLY_TABLES.includes(t)).sort(),
    );
  });

  it("profiles.appearance is the account's appearance: NOT NULL, default 'system', exactly three values", async () => {
    const prisma = getTestPrisma();
    const [col] = await prisma.$queryRawUnsafe<
      { is_nullable: string; column_default: string; udt_name: string }[]
    >(
      `SELECT is_nullable, column_default, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'appearance'`,
    );
    expect(col).toEqual({
      is_nullable: "NO",
      column_default: "'system'::appearance",
      udt_name: "appearance",
    });
    const labels = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'appearance' ORDER BY e.enumsortorder`,
    );
    expect(labels.map((l) => l.enumlabel)).toEqual(["system", "light", "dark"]);
  });

  it("profiles.username is nullable text with a unique index and the shape CHECK (OVE-50)", async () => {
    const prisma = getTestPrisma();
    const [col] = await prisma.$queryRawUnsafe<
      { is_nullable: string; data_type: string }[]
    >(
      `SELECT is_nullable, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'username'`,
    );
    expect(col).toEqual({ is_nullable: "YES", data_type: "text" });
    const indexes = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND indexname = 'profiles_username_key'`,
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toMatch(/CREATE UNIQUE INDEX/);
    const checks = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'profiles_username_format'`,
    );
    expect(checks).toHaveLength(1);
    expect(checks[0].def).toContain("^[a-z0-9_]{3,20}$");
  });

  it("seeds no training data (every application table is empty on a clean migrate)", async () => {
    const prisma = getTestPrisma();
    // after-env truncates before each test; this asserts the baseline is empty.
    for (const table of APP_TABLES) {
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${table}"`,
      );
      expect(Number(rows[0].n)).toBe(0);
    }
  });
});
