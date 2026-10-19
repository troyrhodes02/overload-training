import fs from "node:fs";
import path from "node:path";

/**
 * Multi-User Foundation static guards (spec §9, §14.6; R7–R9). The account-
 * scoped layer is only a guarantee if nothing can walk around it, so these
 * checks run with every unit-test pass (the repository has no separate CI
 * service; lint + unit tests are the per-commit gate — spec R8).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");
const DATA_LAYER = "src/lib/data/";

/**
 * TEMPORARY (OVE-38 → OVE-39): modules not yet converted to the account-
 * scoped layer. Mirrors NOT_YET_SCOPED in eslint.config.mjs. OVE-39 converts
 * them and this list must then be empty.
 */
const NOT_YET_SCOPED = [
  "src/lib/cardio/cardio-logs.ts",
  "src/lib/cardio/queries.ts",
  "src/lib/goals/goals.ts",
  "src/lib/goals/queries.ts",
  "src/lib/logging/logged-sets.ts",
  "src/lib/logging/missed-days.ts",
  "src/lib/logging/queries.ts",
  "src/lib/logging/sessions.ts",
  "src/lib/progression/queries.ts",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
const read = (f: string) => fs.readFileSync(f, "utf8");
/** Code only: comments may legitimately name what they forbid. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const appFiles = () =>
  walk(SRC).filter(
    (f) => !rel(f).startsWith(DATA_LAYER) && !NOT_YET_SCOPED.includes(rel(f)),
  );

describe("account-scoped access is the only door (Multi-User Foundation)", () => {
  it("only src/lib/data imports the raw Prisma client", () => {
    const offenders = appFiles().filter((f) =>
      /from\s+["']@\/lib\/db["']/.test(read(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no raw SQL outside src/lib/data (raw queries bypass the scope)", () => {
    const offenders = appFiles().filter((f) =>
      /\$(queryRaw|executeRaw)(Unsafe)?\b/.test(code(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("application code never builds an Account for an arbitrary id", () => {
    const offenders = walk(SRC)
      .filter((f) => !rel(f).startsWith(DATA_LAYER))
      .filter((f) =>
        /@\/lib\/data\/operator|\bcreateAccountClient\b|\bresolveAccount\b|\baccountFor\b/.test(
          code(f),
        ),
      );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("outside src/lib/data, userId appears only as the session-derived account.userId", () => {
    const offenders = walk(SRC)
      .filter((f) => !rel(f).startsWith(DATA_LAYER))
      .filter((f) => {
        const stripped = code(f)
          .replace(/\buserId:\s*account\.userId\b/g, "")
          .replace(/\baccount\.userId\b/g, "");
        return /\buserId\b/.test(stripped);
      });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("server actions resolve the acting account first and accept no account id", () => {
    const actions = walk(path.join(SRC, "app")).filter((f) =>
      /["']use server["']/.test(read(f)),
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const f of actions) {
      const src = code(f);
      expect([rel(f), /\b(accountId|ownerId|tenantId)\b/.test(src)]).toEqual([
        rel(f),
        false,
      ]);
    }
  });

  it("the Supabase client never queries application tables", () => {
    const offenders = walk(SRC).filter((f) =>
      /supabase[\w.]*\.from\(|\.from\(["'](mesocycles|sessions|session_exercises|exercises|exercise_favorites|gyms|gym_exercise_baselines|logged_sessions|logged_exercises|logged_sets|missed_day_resolutions|goals|planned_cardio|cardio_logs|profiles)["']\)/.test(
        code(f),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("the temporary allowlist matches eslint.config.mjs exactly", () => {
    const eslint = read(path.join(REPO_ROOT, "eslint.config.mjs"));
    const block =
      /const NOT_YET_SCOPED = \[([\s\S]*?)\];/.exec(eslint)?.[1] ?? "";
    const listed = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...NOT_YET_SCOPED].sort());
    for (const f of NOT_YET_SCOPED) {
      expect(fs.existsSync(path.join(REPO_ROOT, f))).toBe(true);
    }
  });
});
