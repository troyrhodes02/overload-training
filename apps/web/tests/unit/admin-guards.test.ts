import fs from "node:fs";
import path from "node:path";

/**
 * Admin Center & Feedback static guards (spec §14.5; R1, R2, R15). The admin
 * gate is only a guarantee if admin code has no other door, every admin
 * entry point checks the allowlist itself, and nothing can turn admin into a
 * stored role. These run with every unit-test pass.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");
const ADMIN_DATA = "src/lib/data/admin/";

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
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

const all = () => walk(SRC);
const adminData = () => all().filter((f) => rel(f).startsWith(ADMIN_DATA));
const adminSurface = () =>
  all().filter(
    (f) =>
      rel(f).startsWith("src/app/admin/") ||
      rel(f).startsWith("src/components/admin/"),
  );

const importsOf = (f: string) =>
  [...code(f).matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map(
    (m) => m[1],
  );

it("the admin data layer exists where the spec puts it", () => {
  expect(adminData().map(rel).sort()).toEqual(
    expect.arrayContaining([
      "src/lib/data/admin/audit.ts",
      "src/lib/data/admin/db.ts",
      "src/lib/data/admin/gate.ts",
      "src/lib/data/admin/identity.ts",
    ]),
  );
});

it("only the admin data layer reaches the admin client or the gate", () => {
  const offenders = all()
    .filter((f) => !rel(f).startsWith(ADMIN_DATA))
    .filter((f) =>
      importsOf(f).some((i) => /@\/lib\/data\/admin\/(db|gate)$/.test(i)),
    );
  expect(offenders.map(rel)).toEqual([]);
});

it("admin data modules never use the raw client (only db.ts wraps it) or raw SQL", () => {
  for (const f of adminData()) {
    const name = rel(f);
    const src = code(f);
    if (name !== "src/lib/data/admin/db.ts") {
      expect([name, importsOf(f).includes("@/lib/db")]).toEqual([name, false]);
      expect([name, /\bcreateAdminClient\b/.test(src)]).toEqual([name, false]);
    }
    expect([name, /\$(queryRaw|executeRaw)(Unsafe)?\b/.test(src)]).toEqual([
      name,
      false,
    ]);
    // The account-scoped client and operator accounts are not admin doors.
    expect([
      name,
      importsOf(f).some((i) =>
        /@\/lib\/data\/(account-db|operator)$|^\.\.\/(account-db|operator)$/.test(
          i,
        ),
      ),
    ]).toEqual([name, false]);
  }
});

it("every admin data module except the pure gate is server-only", () => {
  for (const f of adminData().filter(
    (f) => rel(f) !== "src/lib/data/admin/gate.ts",
  )) {
    expect([rel(f), /^import "server-only";/m.test(read(f))]).toEqual([
      rel(f),
      true,
    ]);
  }
});

it("admin pages and components import no training module and no deletion path", () => {
  const FORBIDDEN =
    /^@\/lib\/(plan|logging|progression|goals|cardio|gyms|exercises|tour|release-notes)(\/|$)|^@\/lib\/accounts\/deletion$|^@\/lib\/data\/(account-db|operator|scope)$|^@\/lib\/db$/;
  // The one exception: the pure calendar-date helpers (no data access).
  const ALLOWED = new Set(["@/lib/plan/calendar"]);
  const offenders = adminSurface().flatMap((f) =>
    importsOf(f)
      .filter((i) => FORBIDDEN.test(i) && !ALLOWED.has(i))
      .map((i) => `${rel(f)} → ${i}`),
  );
  expect(offenders).toEqual([]);
});

it("every admin page and layout calls requireAdmin()", () => {
  for (const f of adminSurface().filter((f) =>
    /src\/app\/admin\/.*(page|layout)\.tsx$/.test(rel(f)),
  )) {
    expect([rel(f), /\brequireAdmin\(\)/.test(code(f))]).toEqual([
      rel(f),
      true,
    ]);
  }
});

it("every exported admin server action awaits requireAdmin() before anything else", () => {
  const actionFiles = adminSurface().filter((f) =>
    /["']use server["']/.test(read(f)),
  );
  for (const f of actionFiles) {
    const src = code(f);
    const fns = [
      ...src.matchAll(
        /export\s+async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g,
      ),
    ];
    expect([rel(f), fns.length > 0]).toEqual([rel(f), true]);
    for (const [, name, body] of fns) {
      const firstAwait = body.match(/await\s+([\w.]+)\s*\(/);
      expect([rel(f), name, firstAwait?.[1]]).toEqual([
        rel(f),
        name,
        "requireAdmin",
      ]);
    }
  }
});

it("admin actors are made only by identity.ts", () => {
  const offenders = all()
    .filter((f) => rel(f) !== "src/lib/data/admin/identity.ts")
    .filter((f) => /\badminActorFor\b/.test(code(f)));
  expect(offenders.map(rel)).toEqual([]);
});

it("only the allowlist module reads the admin allowlist", () => {
  const offenders = all()
    .filter((f) => rel(f) !== "src/lib/admin/allowlist.ts")
    .filter((f) => /OVERLOAD_ADMIN_USER_IDS/.test(code(f)));
  expect(offenders.map(rel)).toEqual([]);
  expect(read(path.join(REPO_ROOT, "scripts/check-client-bundle.mjs"))).toMatch(
    /"OVERLOAD_ADMIN_USER_IDS"/,
  );
});

it("no client component imports the admin data layer or the allowlist", () => {
  const offenders = all()
    .filter((f) => /^["']use client["']/m.test(read(f)))
    .filter((f) =>
      importsOf(f).some(
        (i) =>
          i.startsWith("@/lib/data/admin") || i === "@/lib/admin/allowlist",
      ),
    );
  expect(offenders.map(rel)).toEqual([]);
});

it("admin can never become a stored role: no role or admin field on any model", () => {
  const schema = read(path.join(REPO_ROOT, "prisma", "schema.prisma"));
  const fields = [...schema.matchAll(/^model \w+ \{([\s\S]*?)^\}/gm)].flatMap(
    ([, body]) =>
      body
        .split("\n")
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((w) => /^[a-z]\w*$/.test(w ?? "")),
  );
  expect(
    fields.filter((f) => /^(role|roles|isAdmin|admin\w*)$/i.test(f)),
  ).toEqual([]);
  expect(schema).not.toMatch(/^enum \w*Role\b/m);
});
