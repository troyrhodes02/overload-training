#!/usr/bin/env node
/**
 * Workspace boundary check (Pitch 21a, spec §8.11). Pure rule functions plus
 * a CLI that runs them over this repository. Run with `npm run
 * verify:workspaces` (part of `npm test`); its tests are
 * scripts/workspace-boundaries.test.mjs (node:test, no dependencies).
 *
 *   B1  the workspace list is exactly apps/* and packages/*, names are unique
 *   B2  the root has no runtime dependencies, only repository-wide tooling
 *   B3  packages/shared depends on and imports nothing server-, framework-,
 *       renderer- or Node-specific
 *   B4  apps/mobile (once it has a manifest) depends on no server module
 *   B5  nothing depends on the web app
 *   B6  no manifest declares a scheduler or queue (CLAUDE.md: rejected infra)
 *   B7  React lockstep: one exact React version across workspaces and a single
 *       react / react-dom in the lockfile, so the install has one React runtime
 */
import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_WORKSPACES = ["apps/*", "packages/*"];
export const ROOT_DEV_TOOLING = ["prettier"];

/** Node-only or native packages that belong to apps/web alone (audit §8). */
export const WEB_ONLY_PACKAGES = [
  "sharp",
  "heic-convert",
  "pdfjs-dist",
  "stripe",
  "@anthropic-ai/sdk",
];

/** B3: what the shared package may never depend on or import. */
export const SHARED_FORBIDDEN = [
  "@prisma/*",
  "prisma",
  "next",
  "next/*",
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "react-native",
  "react-native/*",
  "@supabase/*",
  "server-only",
  "@overload/web",
  ...WEB_ONLY_PACKAGES,
];

/** B4: what the mobile app may never depend on (it talks to the API only). */
export const MOBILE_FORBIDDEN = [
  "@prisma/*",
  "prisma",
  "next",
  "server-only",
  "@overload/web",
  "@supabase/ssr",
  ...WEB_ONLY_PACKAGES,
];

/** B6: the list invariant-guards.test.ts bans in the web manifest. */
export const BANNED_INFRA = [
  "cron",
  "node-cron",
  "node-schedule",
  "bullmq",
  "bull",
  "bee-queue",
  "agenda",
  "@vercel/cron",
];

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/** Every dependency name a manifest declares, in any field. */
export function declaredDeps(manifest) {
  return [
    ...new Set(DEP_FIELDS.flatMap((f) => Object.keys(manifest[f] ?? {}))),
  ];
}

/** Whether `spec` (a package name or import specifier) matches a pattern. */
export function matches(spec, pattern) {
  if (pattern.endsWith("/*")) return spec.startsWith(pattern.slice(0, -1));
  return spec === pattern || spec.startsWith(`${pattern}/`);
}

const matchesAny = (spec, patterns) => patterns.some((p) => matches(spec, p));

/**
 * @param {{
 *   root: object,
 *   workspaces: { dir: string, manifest: object }[],
 *   lock: object,
 *   sharedSources?: { file: string, code: string }[],
 * }} repo
 * @returns {string[]} violations, each naming the rule, workspace and package
 */
export function checkBoundaries(repo) {
  const errors = [];
  const { root, workspaces, lock, sharedSources = [] } = repo;

  // B1
  const list = root.workspaces;
  if (
    !Array.isArray(list) ||
    list.length !== EXPECTED_WORKSPACES.length ||
    !EXPECTED_WORKSPACES.every((w) => list.includes(w))
  ) {
    errors.push(
      `B1: the root workspace list must be exactly ${JSON.stringify(EXPECTED_WORKSPACES)}, found ${JSON.stringify(list)}.`,
    );
  }
  const names = new Map();
  for (const ws of workspaces) {
    const name = ws.manifest.name;
    if (!name) errors.push(`B1: ${ws.dir} has no package name.`);
    else if (names.has(name))
      errors.push(
        `B1: ${ws.dir} and ${names.get(name)} share the name "${name}".`,
      );
    else names.set(name, ws.dir);
  }

  // B2
  for (const dep of Object.keys(root.dependencies ?? {})) {
    errors.push(
      `B2: the root declares runtime dependency "${dep}"; dependencies belong to the workspace that uses them.`,
    );
  }
  for (const dep of Object.keys(root.devDependencies ?? {})) {
    if (!ROOT_DEV_TOOLING.includes(dep)) {
      errors.push(
        `B2: the root declares devDependency "${dep}"; only repository-wide tooling (${ROOT_DEV_TOOLING.join(", ")}) belongs at the root.`,
      );
    }
  }

  // B3
  const shared = workspaces.find((w) => w.dir === "packages/shared");
  if (shared) {
    for (const dep of Object.keys(shared.manifest.dependencies ?? {})) {
      errors.push(
        `B3: packages/shared declares runtime dependency "${dep}"; it is source-only with no runtime dependencies.`,
      );
    }
    for (const dep of declaredDeps(shared.manifest)) {
      if (matchesAny(dep, SHARED_FORBIDDEN)) {
        errors.push(
          `B3: packages/shared depends on "${dep}", which the shared package must never use.`,
        );
      }
    }
    for (const { file, code } of sharedSources) {
      for (const spec of importSpecifiers(code)) {
        if (
          matchesAny(spec, SHARED_FORBIDDEN) ||
          spec.startsWith("node:") ||
          builtinModules.includes(spec.split("/")[0]) ||
          spec.startsWith("@/")
        ) {
          errors.push(
            `B3: ${file} imports "${spec}", which shared code must never import.`,
          );
        }
      }
    }
  }

  // B4
  const mobile = workspaces.find((w) => w.dir === "apps/mobile");
  if (mobile) {
    for (const dep of declaredDeps(mobile.manifest)) {
      if (matchesAny(dep, MOBILE_FORBIDDEN)) {
        errors.push(
          `B4: apps/mobile depends on "${dep}"; the mobile app reaches data only through the mobile API.`,
        );
      }
    }
  }

  // B5
  const web = workspaces.find((w) => w.dir === "apps/web");
  const webName = web?.manifest.name ?? "@overload/web";
  for (const ws of workspaces) {
    if (ws === web) continue;
    if (declaredDeps(ws.manifest).includes(webName)) {
      errors.push(`B5: ${ws.dir} depends on the web app ("${webName}").`);
    }
  }

  // B6
  for (const [where, manifest] of [
    ["the root", root],
    ...workspaces.map((w) => [w.dir, w.manifest]),
  ]) {
    for (const dep of declaredDeps(manifest)) {
      if (BANNED_INFRA.includes(dep)) {
        errors.push(
          `B6: ${where} declares "${dep}"; Overload has no scheduler or queue (CLAUDE.md, Stack).`,
        );
      }
    }
  }

  // B7
  for (const pkg of ["react", "react-dom"]) {
    const pins = workspaces
      .map((w) => [
        w.dir,
        (w.manifest.dependencies ?? {})[pkg] ??
          (w.manifest.devDependencies ?? {})[pkg],
      ])
      .filter(([, v]) => v !== undefined);
    for (const [dir, v] of pins) {
      if (!/^\d+\.\d+\.\d+$/.test(v)) {
        errors.push(
          `B7: ${dir} declares ${pkg}@"${v}"; React must be pinned to an exact version (React lockstep).`,
        );
      }
    }
    const versions = new Set(pins.map(([, v]) => v));
    if (versions.size > 1) {
      errors.push(
        `B7: workspaces pin different ${pkg} versions (${pins.map(([d, v]) => `${d}: ${v}`).join(", ")}). Every app must use the same React (React lockstep, spec §10): choose the Expo SDK that matches the web's React.`,
      );
    }
    const copies = Object.keys(lock.packages ?? {}).filter(
      (k) => k === `node_modules/${pkg}` || k.endsWith(`/node_modules/${pkg}`),
    );
    if (pins.length > 0 && copies.length !== 1) {
      errors.push(
        `B7: package-lock.json holds ${copies.length} copies of ${pkg} (${copies.join(", ") || "none"}); the install must have exactly one React runtime.`,
      );
    }
  }

  return errors;
}

/** Static import / require / export-from specifiers in a source file. */
export function importSpecifiers(code) {
  const specs = [];
  const re =
    /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

/** Reads the real repository at `rootDir`. */
export function loadRepo(rootDir) {
  const read = (p) =>
    JSON.parse(fs.readFileSync(path.join(rootDir, p), "utf8"));
  const root = read("package.json");
  const workspaces = [];
  for (const pattern of root.workspaces ?? []) {
    const base = pattern.replace(/\/\*$/, "");
    const abs = path.join(rootDir, base);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const dir = `${base}/${entry.name}`;
      if (
        entry.isDirectory() &&
        fs.existsSync(path.join(rootDir, dir, "package.json"))
      ) {
        workspaces.push({ dir, manifest: read(`${dir}/package.json`) });
      }
    }
  }
  const sharedSources = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(c|m)?(t|j)sx?$/.test(e.name)) {
        sharedSources.push({
          file: path.relative(rootDir, full).split(path.sep).join("/"),
          code: fs.readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(path.join(rootDir, "packages", "shared", "src"));
  return { root, workspaces, lock: read("package-lock.json"), sharedSources };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const repo = loadRepo(rootDir);
  const errors = checkBoundaries(repo);
  if (errors.length > 0) {
    console.error(`Workspace boundary check failed:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(
    `Workspace boundaries OK (${repo.workspaces.map((w) => w.manifest.name).join(", ")}).`,
  );
}
