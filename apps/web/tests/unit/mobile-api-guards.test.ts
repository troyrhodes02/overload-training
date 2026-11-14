import fs from "node:fs";
import path from "node:path";
import {
  endpointKey,
  MOBILE_ENDPOINTS,
  PUBLIC_MOBILE_ROUTES,
} from "../support/mobile-endpoints";

/**
 * Pitch 21c static guards (spec §10, §17.1).
 *
 * Side-effect fence (RD-5): the Stripe refresh (billing sync) and the plan-
 * import retention sweep are page-load writes of two web-only pages. They must
 * never run from a shared view or from the mobile API, where a GET would
 * silently call Stripe or delete import data.
 *
 * Goal reconciliation (RD-4; audit S-4 / F-T12): after a write it runs only
 * through src/lib/logging/workflows.ts, so no server action (or, in 21e, a
 * mobile handler) can forget it or run it inside a set's transaction.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");
const code = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const SIDE_EFFECTING_READS =
  /@\/lib\/billing\/sync|@\/lib\/import\/retention|\brefreshBillingFromStripe\b|\brunImportRetention\b/;

describe("side-effect fence (Pitch 21c RD-5)", () => {
  it("the shared views never call Stripe or run import retention", () => {
    const files = walk(path.join(SRC, "lib", "views"));
    expect(files.length).toBeGreaterThan(0);
    expect(
      files.filter((f) => SIDE_EFFECTING_READS.test(code(f))).map(rel),
    ).toEqual([]);
  });

  it("the mobile API never calls Stripe or runs import retention", () => {
    const files = [
      ...walk(path.join(SRC, "app", "api", "mobile")),
      ...walk(path.join(SRC, "lib", "api", "mobile")),
    ];
    expect(files.length).toBeGreaterThan(0);
    expect(
      files.filter((f) => SIDE_EFFECTING_READS.test(code(f))).map(rel),
    ).toEqual([]);
  });

  it("the two page-load writes stay on their own web pages", () => {
    const callers = walk(SRC)
      .filter((f) => !rel(f).startsWith("src/lib/billing/"))
      .filter((f) => !rel(f).startsWith("src/lib/import/"))
      .filter((f) =>
        /\brefreshBillingFromStripe\(|\brunImportRetention\(/.test(code(f)),
      )
      .map(rel)
      .sort();
    expect(callers).toEqual([
      "src/app/(app)/plan/import/page.tsx",
      "src/app/(app)/settings/billing/page.tsx",
    ]);
  });
});

describe("goal reconciliation after a write (Pitch 21c RD-4)", () => {
  it("no server action calls the reconcile engine directly", () => {
    const actions = walk(path.join(SRC, "app")).filter((f) =>
      /["']use server["']/.test(fs.readFileSync(f, "utf8")),
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(
      actions
        .filter((f) => /\breconcileGoalCompletions(Safely)?\b/.test(code(f)))
        .map(rel),
    ).toEqual([]);
  });

  it("only the goal module, the workflows, the Today view, and the goal pages reconcile", () => {
    const callers = walk(SRC)
      .filter((f) => /\breconcileGoalCompletionsSafely\(/.test(code(f)))
      .map(rel)
      .sort();
    expect(callers).toEqual(
      [
        "src/app/(app)/goals/[goalId]/page.tsx",
        "src/app/(app)/goals/history/page.tsx",
        "src/app/(app)/goals/new/[exerciseId]/page.tsx",
        "src/app/(app)/goals/new/page.tsx",
        "src/app/(app)/goals/page.tsx",
        "src/lib/goals/goals.ts",
        "src/lib/logging/workflows.ts",
        "src/lib/views/today.ts",
      ].sort(),
    );
  });
});

describe("mobile API routes (Pitch 21c RD-13)", () => {
  const API = path.join(SRC, "app", "api", "mobile");
  const routes = walk(API).filter((f) => path.basename(f) === "route.ts");
  const routeDir = (f: string) =>
    path.relative(path.join(SRC, "app"), path.dirname(f)).replace(/\\/g, "/");
  const exportedMethods = (f: string) =>
    [
      ...code(f).matchAll(
        /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
      ),
    ].map((m) => m[1]);

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(5);
  });

  it("the endpoint registry lists exactly the exported route methods", () => {
    const found = routes
      .flatMap((f) =>
        exportedMethods(f).map((method) => `${method} ${routeDir(f)}`),
      )
      .sort();
    expect(found).toEqual(MOBILE_ENDPOINTS.map(endpointKey).sort());
  });

  it("every route is built with the request pipeline; only the sanctioned routes are public", () => {
    for (const f of routes) {
      const src = code(f);
      // No hand-written handler: every method comes from a pipeline wrapper.
      expect([routeDir(f), /export\s+(async\s+)?function\b/.test(src)]).toEqual(
        [routeDir(f), false],
      );
      const authenticated = /\bmobileRoute\s*[<(]/.test(src);
      const isPublic = /\bpublicMobileRoute\s*[<(]/.test(src);
      expect([routeDir(f), authenticated || isPublic]).toEqual([
        routeDir(f),
        true,
      ]);
      if (isPublic) expect(PUBLIC_MOBILE_ROUTES).toContain(routeDir(f));
      for (const e of MOBILE_ENDPOINTS.filter((e) => e.route === routeDir(f))) {
        expect([endpointKey(e), e.auth]).toEqual([
          endpointKey(e),
          isPublic ? "public" : "account",
        ]);
      }
    }
  });

  it("route files never reach the database, cookie auth, redirects, or web-only writes", () => {
    const FORBIDDEN =
      /@\/lib\/db\b|@prisma\/client|@\/lib\/data\/account-db|@\/lib\/data\/account["']|@\/lib\/data\/operator|@\/lib\/data\/admin|@\/lib\/auth["']|@\/lib\/supabase\/server|next\/navigation|next\/headers|@\/lib\/billing\/(sync|checkout|stripe)|@\/lib\/import\/|@\/lib\/admin\/|\brequireAccount\w*\b|\bcurrentUser\b|\bredirect\(|\bnotFound\(|\brefresh\(|\bformData\(/;
    expect(routes.filter((f) => FORBIDDEN.test(code(f))).map(rel)).toEqual([]);
  });

  it("route files never take an account id from the request", () => {
    expect(
      routes
        .filter((f) => /\b(userId|accountId|ownerId|tenantId)\b/.test(code(f)))
        .map(rel),
    ).toEqual([]);
  });

  it("only the pipeline authenticates a mobile request", () => {
    const importers = walk(SRC)
      .filter((f) => /\bauthenticateMobileRequest\b/.test(code(f)))
      .map(rel)
      .sort();
    expect(importers).toEqual([
      "src/lib/api/mobile/pipeline.ts",
      "src/lib/data/mobile-auth.ts",
    ]);
  });

  it("the token verifier is reached only through the mobile auth step", () => {
    const importers = walk(SRC)
      .filter((f) => /\bverifyAccessToken\b/.test(code(f)))
      .map(rel)
      .sort();
    expect(importers).toEqual([
      "src/lib/data/access-token.ts",
      "src/lib/data/mobile-auth.ts",
    ]);
  });
});
