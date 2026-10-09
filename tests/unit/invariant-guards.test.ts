import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("logged-history write guard", () => {
  it("has no LoggedSet write outside lib/logging/logged-sets.ts", () => {
    const offenders: string[] = [];
    const writeRe =
      /prisma\s*\.\s*loggedSet\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)/;
    for (const file of walk(SRC)) {
      const rel = path.relative(REPO_ROOT, file);
      if (rel.replace(/\\/g, "/") === "src/lib/logging/logged-sets.ts")
        continue;
      const contents = fs.readFileSync(file, "utf8");
      if (writeRe.test(contents)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("exercise and gym write guards (Library & Gyms Setup)", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");

  it("never hard-deletes an Exercise or Gym anywhere in application code", () => {
    const hardDelete = /\.\s*(exercise|gym)\s*\.\s*(delete|deleteMany)\s*\(/;
    const offenders = walk(SRC).filter((f) =>
      hardDelete.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("writes Exercise rows only through src/lib/exercises/exercises.ts", () => {
    const write =
      /\.\s*exercise\s*\.\s*(create|createMany|update|updateMany|upsert)\s*\(/;
    const offenders = walk(SRC)
      .filter((f) => rel(f) !== "src/lib/exercises/exercises.ts")
      .filter((f) => write.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("secret hygiene", () => {
  const dbSecretRe =
    /NEXT_PUBLIC_[A-Z0-9_]*(DATABASE_URL|DIRECT_URL|SERVICE_ROLE|SERVICE_KEY)/;

  it("references no NEXT_PUBLIC_ database/service-role secret in source", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const contents = fs.readFileSync(file, "utf8");
      if (dbSecretRe.test(contents))
        offenders.push(path.relative(REPO_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it("the .env.example never prefixes a DB/service-role secret with NEXT_PUBLIC_", () => {
    const envExample = fs.readFileSync(
      path.join(REPO_ROOT, ".env.example"),
      "utf8",
    );
    expect(dbSecretRe.test(envExample)).toBe(false);
  });
});

describe("seed imports the exercise catalog only (spec D37)", () => {
  // Library & Gyms Setup introduces the seed (CLAUDE.md: free-exercise-db is
  // "imported once by a Prisma seed script"). Foundation's intent — no demo or
  // training data — is preserved: the seed writes Exercise rows (and Storage
  // objects) only, and never user preference or archive state.
  const seedFiles = [
    path.join(REPO_ROOT, "prisma", "seed.ts"),
    ...walk(path.join(REPO_ROOT, "prisma", "seed")),
  ];

  it("the seed entry point and its modules exist", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "prisma", "seed.ts"))).toBe(true);
    expect(seedFiles.length).toBeGreaterThan(1);
  });

  it("writes no model other than Exercise", () => {
    const otherWrite =
      /\.\s*(mesocycle|session|sessionExercise|gym|gymExerciseBaseline|loggedSession|loggedExercise|loggedSet|goal|cardioLog)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const offenders = seedFiles.filter((f) =>
      otherWrite.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("never deletes exercises and never writes favorites or archive state", () => {
    for (const f of seedFiles) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/exercise\s*\.\s*(delete|deleteMany|upsert)\b/);
      expect(src).not.toMatch(/isFavorite\s*:/);
      expect(src).not.toMatch(/deletedAt\s*:/);
      expect(src).not.toMatch(/isCustom\s*:\s*true/);
    }
  });
});

describe("free-exercise-db is an ingest dependency, never a runtime one", () => {
  it("no application source references the source dataset or its host", () => {
    const offenders = walk(SRC).filter((f) =>
      /raw\.githubusercontent|yuhonas|from\s+["'][^"']*(prisma\/seed|exercises\.json)/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(offenders.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });

  it("no application source references the service-role key", () => {
    const offenders = walk(SRC).filter((f) =>
      /SUPABASE_SERVICE_ROLE_KEY|service_role|serviceRole/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(offenders.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });
});

describe("no seed data in migrations", () => {
  it("the initial migration contains no INSERT (no seeding during migrate)", () => {
    const migration = fs.readFileSync(
      path.join(REPO_ROOT, "prisma", "migrations", "0_init", "migration.sql"),
      "utf8",
    );
    expect(/\bINSERT\s+INTO\b/i.test(migration)).toBe(false);
  });
});

describe("migration safety (every migration after 0_init)", () => {
  const migrationsDir = path.join(REPO_ROOT, "prisma", "migrations");
  const later = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "0_init")
    .map((d) => ({
      name: d.name,
      sql: fs
        .readFileSync(path.join(migrationsDir, d.name, "migration.sql"), "utf8")
        // Ignore comment lines; only executable SQL matters.
        .replace(/^\s*--.*$/gm, ""),
    }));

  it("finds every migration after 0_init", () => {
    expect(later.map((m) => m.name)).toEqual(
      expect.arrayContaining([
        "1_library_gyms_setup",
        "2_mesocycle_draft_status",
        "3_split_mesocycle_builder",
      ]),
    );
  });

  it.each(later.map((m) => [m.name, m.sql]))(
    "%s drops/renames nothing, inserts nothing, cascades nothing, and adds no RLS policy",
    (_name, sql) => {
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA)\b/i);
      expect(sql).not.toMatch(/\bRENAME\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(sql).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
      expect(sql).not.toMatch(/\bCREATE\s+POLICY\b/i);
      expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    },
  );

  it.each(later.map((m) => [m.name, m.sql]))(
    "%s enables RLS on every table it creates",
    (_name, sql) => {
      const created = [...sql.matchAll(/CREATE\s+TABLE\s+"([^"]+)"/gi)].map(
        (m) => m[1],
      );
      for (const table of created) {
        expect(sql).toMatch(
          new RegExp(
            `ALTER\\s+TABLE\\s+"${table}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
            "i",
          ),
        );
      }
    },
  );
});
