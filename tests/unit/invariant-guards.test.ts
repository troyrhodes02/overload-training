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

describe("no seed data", () => {
  it("has no Prisma seed script", () => {
    const candidates = ["prisma/seed.ts", "prisma/seed.js", "prisma/seed.mjs"];
    for (const c of candidates) {
      expect(fs.existsSync(path.join(REPO_ROOT, c))).toBe(false);
    }
  });

  it("the initial migration contains no INSERT (no seeding during migrate)", () => {
    const migration = fs.readFileSync(
      path.join(REPO_ROOT, "prisma", "migrations", "0_init", "migration.sql"),
      "utf8",
    );
    expect(/\bINSERT\s+INTO\b/i.test(migration)).toBe(false);
  });
});
