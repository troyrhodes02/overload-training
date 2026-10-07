import { getTestPrisma, APP_TABLES } from "./support/db";

/**
 * Security / privacy — the deny-all RLS posture that closes the Supabase Data
 * API. CLAUDE.md: "RLS is enabled with no policies on every table."
 */
describe("row-level security posture", () => {
  it("has RLS enabled on every table in the public schema, including _prisma_migrations", async () => {
    const prisma = getTestPrisma();
    const withoutRls = await prisma.$queryRawUnsafe<{ relname: string }[]>(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
        ORDER BY 1`,
    );
    expect(withoutRls.map((r) => r.relname)).toEqual([]);

    const migrations = await prisma.$queryRawUnsafe<
      { relrowsecurity: boolean }[]
    >(
      `SELECT c.relrowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations'`,
    );
    expect(migrations[0]?.relrowsecurity).toBe(true);
  });

  it("has ZERO policies in the public schema (deny-all, not permissive)", async () => {
    const prisma = getTestPrisma();
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("does not let the anon role execute the classification helper function (no RPC surface)", async () => {
    const prisma = getTestPrisma();
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
           CREATE ROLE anon NOLOGIN;
         END IF;
       END $$;`,
    );
    const rows = await prisma.$queryRawUnsafe<{ can_execute: boolean }[]>(
      `SELECT has_function_privilege('anon', 'overload_array_is_distinct(anyarray)', 'EXECUTE') AS can_execute`,
    );
    expect(rows[0].can_execute).toBe(false);
  });

  it("returns no application rows to the anon role even when a row exists (Data API posture)", async () => {
    const prisma = getTestPrisma();

    // Mirror Supabase: an `anon` role that is granted table SELECT. RLS with no
    // policy must still return nothing to it.
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
           CREATE ROLE anon NOLOGIN;
         END IF;
       END $$;`,
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`,
    );

    // Insert a real row as the owner (Prisma bypasses RLS).
    await prisma.exercise.create({
      data: {
        name: "Barbell Bench Press",
        primaryMuscle: "chest",
        equipmentType: "barbell",
        isCustom: true,
      },
    });

    // Owner sees the row...
    const ownerCount = await prisma.exercise.count();
    expect(ownerCount).toBe(1);

    // ...but the anon role sees nothing, on every table.
    for (const table of APP_TABLES) {
      const rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE anon");
        return tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "${table}"`,
        );
      });
      expect(Number(rows[0].n)).toBe(0);
    }
  });
});
