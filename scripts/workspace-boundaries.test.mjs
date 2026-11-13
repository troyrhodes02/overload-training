/**
 * Tests for the workspace boundary check (Pitch 21a, spec §8.11). Each rule
 * must fail on a crafted violation, and the real repository must pass.
 * Run: node --test scripts/workspace-boundaries.test.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkBoundaries,
  escapesPackage,
  importSpecifiers,
  loadRepo,
  sharedRestrictedImports,
} from "./workspace-boundaries.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A minimal valid repository, cloned per test. */
function repo() {
  return structuredClone({
    root: {
      name: "overload-training",
      workspaces: ["apps/*", "packages/*"],
      devDependencies: { prettier: "^3.0.0" },
    },
    workspaces: [
      {
        dir: "apps/web",
        manifest: {
          name: "@overload/web",
          dependencies: {
            next: "16.4.5",
            react: "19.3.0",
            "react-dom": "19.3.0",
            "@prisma/client": "^7.0.0",
          },
        },
      },
      {
        dir: "packages/shared",
        manifest: {
          name: "@overload/shared",
          devDependencies: { typescript: "^5", eslint: "^9" },
        },
      },
    ],
    lock: {
      packages: {
        "": {},
        "node_modules/react": { version: "19.3.0" },
        "node_modules/react-dom": { version: "19.3.0" },
      },
    },
    sharedSources: [
      { file: "packages/shared/src/index.ts", code: "export {};\n" },
    ],
  });
}

const fails = (r, rule) => {
  const errors = checkBoundaries(r);
  assert.ok(
    errors.some((e) => e.startsWith(`${rule}:`)),
    `expected a ${rule} violation, got ${JSON.stringify(errors)}`,
  );
};

describe("workspace boundaries", () => {
  it("the real repository passes every rule", () => {
    assert.deepEqual(checkBoundaries(loadRepo(ROOT)), []);
  });

  it("the real repository has the web and shared workspaces and reads shared sources", () => {
    const r = loadRepo(ROOT);
    const dirs = r.workspaces.map((w) => w.dir).sort();
    assert.ok(dirs.includes("apps/web"), "apps/web is a workspace");
    assert.ok(
      dirs.includes("packages/shared"),
      "packages/shared is a workspace",
    );
    assert.ok(r.sharedSources.length > 0, "the shared scan found its sources");
  });

  it("a clean fixture passes", () => {
    assert.deepEqual(checkBoundaries(repo()), []);
  });

  it("B1: a changed workspace list or a duplicate name fails", () => {
    const a = repo();
    a.root.workspaces = ["apps/*"];
    fails(a, "B1");
    const b = repo();
    b.workspaces[1].manifest.name = "@overload/web";
    fails(b, "B1");
  });

  it("B2: a root runtime dependency or non-tooling devDependency fails", () => {
    const a = repo();
    a.root.dependencies = { sharp: "0.34.4" };
    fails(a, "B2");
    const b = repo();
    b.root.devDependencies.next = "16.4.5";
    fails(b, "B2");
  });

  it("B3: the shared package may not depend on server, framework, or renderer packages", () => {
    for (const dep of [
      "@prisma/client",
      "next",
      "react",
      "react-native",
      "@supabase/supabase-js",
      "server-only",
      "stripe",
    ]) {
      const r = repo();
      r.workspaces[1].manifest.devDependencies[dep] = "1.0.0";
      fails(r, "B3");
    }
    const runtime = repo();
    runtime.workspaces[1].manifest.dependencies = { zod: "4.6.5" };
    fails(runtime, "B3");
  });

  it("B3: shared source may not import server, framework, Node, or web-alias modules", () => {
    for (const code of [
      'import { PrismaClient } from "@prisma/client";',
      'import type { NextConfig } from "next";',
      'import "server-only";',
      'import fs from "node:fs";',
      'import path from "path";',
      'import { requireAccount } from "@/lib/data/account";',
      'const r = require("react");',
      'export { x } from "@supabase/ssr";',
      'const m = await import("next/headers");',
    ]) {
      const r = repo();
      r.sharedSources.push({ file: "packages/shared/src/bad.ts", code });
      fails(r, "B3");
    }
  });

  it("B3e: shared source reads no environment except NODE_ENV", () => {
    for (const code of [
      "const url = process.env.NEXT_PUBLIC_SUPABASE_URL;",
      'const key = process.env["STRIPE_KEY"];',
      "const cwd = process.cwd();",
      "export const env = process.env;",
    ]) {
      const r = repo();
      r.sharedSources.push({ file: "packages/shared/src/bad.ts", code });
      fails(r, "B3e");
    }
    const ok = repo();
    ok.sharedSources.push({
      file: "packages/shared/src/ok.ts",
      code: '// process.env.SECRET in a comment is fine\nif (process.env.NODE_ENV !== "production") {}',
    });
    assert.deepEqual(checkBoundaries(ok), []);
  });

  it("B3e: the ambient declaration may declare NODE_ENV only", () => {
    const ok = repo();
    ok.sharedSources.push({
      file: "packages/shared/src/env.d.ts",
      code: "// why\ndeclare const process: { readonly env: { readonly NODE_ENV?: string } };\n",
    });
    assert.deepEqual(checkBoundaries(ok), []);
    const wide = repo();
    wide.sharedSources.push({
      file: "packages/shared/src/env.d.ts",
      code: "declare const process: { env: Record<string, string> };",
    });
    fails(wide, "B3e");
  });

  it("B4: the mobile app may not depend on server modules", () => {
    for (const dep of [
      "@prisma/client",
      "next",
      "server-only",
      "@overload/web",
      "sharp",
    ]) {
      const r = repo();
      r.workspaces.push({
        dir: "apps/mobile",
        manifest: {
          name: "@overload/mobile",
          dependencies: { [dep]: "1.0.0" },
        },
      });
      fails(r, "B4");
    }
  });

  it("B5: nothing may depend on the web app", () => {
    const r = repo();
    r.workspaces[1].manifest.devDependencies["@overload/web"] = "*";
    fails(r, "B5");
  });

  it("B6: no manifest may declare a scheduler or queue", () => {
    const a = repo();
    a.root.devDependencies["node-cron"] = "3.0.0";
    fails(a, "B6");
    const b = repo();
    b.workspaces[0].manifest.dependencies.bullmq = "5.0.0";
    fails(b, "B6");
  });

  it("B7: a second React version across workspaces fails (React lockstep)", () => {
    const r = repo();
    r.workspaces.push({
      dir: "apps/mobile",
      manifest: {
        name: "@overload/mobile",
        dependencies: { react: "19.2.3", "react-native": "0.86.3" },
      },
    });
    fails(r, "B7");
  });

  it("B7: a range instead of an exact React pin fails", () => {
    const r = repo();
    r.workspaces[0].manifest.dependencies.react = "^19.3.0";
    fails(r, "B7");
  });

  it("B7: a nested second React in the lockfile fails", () => {
    const r = repo();
    r.lock.packages["apps/web/node_modules/react"] = { version: "19.3.0" };
    fails(r, "B7");
  });

  it("B2: a root optional or peer dependency fails", () => {
    const a = repo();
    a.root.optionalDependencies = { sharp: "0.34.4" };
    fails(a, "B2");
    const b = repo();
    b.root.peerDependencies = { react: "19.3.0" };
    fails(b, "B2");
  });

  it("B3: a relative import that leaves packages/shared fails; one inside it passes", () => {
    const out = repo();
    out.sharedSources.push({
      file: "packages/shared/src/bad.ts",
      code: 'import { prisma } from "../../../apps/web/src/lib/db";',
    });
    fails(out, "B3");
    const inside = repo();
    inside.sharedSources.push({
      file: "packages/shared/src/training/e1rm.ts",
      code: 'import { LIMITS } from "../validation/limits";\nimport "./local";',
    });
    assert.deepEqual(checkBoundaries(inside), []);
    assert.equal(
      escapesPackage(
        "packages/shared/src/a.ts",
        "../../web/x",
        "packages/shared/",
      ),
      true,
    );
    assert.equal(
      escapesPackage("packages/shared/src/a/b.ts", "../c", "packages/shared/"),
      false,
    );
  });

  it("B7: a React peer range in any workspace fails", () => {
    const r = repo();
    r.workspaces[1].manifest.peerDependencies = { react: "^19.3.0" };
    fails(r, "B7");
  });

  it("B7: a lockfile that locks a different React than the pin fails", () => {
    const r = repo();
    r.lock.packages["node_modules/react"].version = "19.2.3";
    fails(r, "B7");
  });

  it("the shared lint option covers exact names, subpaths, built-ins, the alias, and relative escapes", () => {
    const { paths, patterns } = sharedRestrictedImports();
    const names = paths.map((p) => p.name);
    for (const n of [
      "@overload/web",
      "server-only",
      "pdfjs-dist",
      "react",
      "fs",
    ]) {
      assert.ok(names.includes(n), `paths include ${n}`);
    }
    const groups = patterns.flatMap((p) => p.group ?? []);
    for (const g of [
      "@overload/web/*",
      "pdfjs-dist/*",
      "stripe/*",
      "server-only/*",
      "@prisma/*",
      "@supabase/*",
      "node:*",
      "@/*",
    ]) {
      assert.ok(groups.includes(g), `patterns include ${g}`);
    }
    const regex = new RegExp(patterns.find((p) => p.regex).regex);
    assert.ok(regex.test("../../../apps/web/src/lib/db"));
    assert.ok(regex.test("../../node_modules/next/server"));
    assert.ok(!regex.test("../validation/limits"));
  });

  it("import scanning finds static, type-only, side-effect, require, and dynamic imports", () => {
    assert.deepEqual(
      importSpecifiers(
        [
          'import a from "a";',
          'import type { B } from "b";',
          'import {\n  c,\n} from "c";',
          'import "d";',
          'export * from "e";',
          'const f = require("f");',
          'const g = await import("g");',
        ].join("\n"),
      ),
      ["a", "b", "c", "d", "e", "f", "g"],
    );
  });
});
