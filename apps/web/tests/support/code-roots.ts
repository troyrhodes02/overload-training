import fs from "node:fs";
import path from "node:path";

/**
 * Where the code the guard tests read lives (Pitch 21b). The web app's source
 * is `apps/web/src`; the pure modules moved out of `src/lib` live in the
 * shared package, `packages/shared/src`, under the same path minus `lib/`
 * (`src/lib/plan/calendar.ts` → `packages/shared/src/plan/calendar.ts`).
 *
 * A guard that scans "all the code" scans both trees, and a guard that pins
 * one module finds it wherever it lives. Neither may stop looking: a module
 * that exists in both places, or in neither, fails the lookup, so a move can
 * never make a guard silently pass by reading nothing.
 */
export const WEB_ROOT = path.resolve(__dirname, "..", "..");
export const WEB_SRC = path.join(WEB_ROOT, "src");
export const SHARED_SRC = path.resolve(
  WEB_ROOT,
  "..",
  "..",
  "packages",
  "shared",
  "src",
);

/** Every .ts/.tsx file under `dir` (none if it does not exist). */
export function walkTs(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** All source the guards scan: the web app's `src` and the shared package. */
export function walkCode(): string[] {
  return [...walkTs(WEB_SRC), ...walkTs(SHARED_SRC)];
}

/**
 * Every file of one lib domain, in both trees: `walkLib("goals")` reads
 * `src/lib/goals` and `packages/shared/src/goals`. Fails when neither exists.
 */
export function walkLib(domain: string): string[] {
  const web = path.join(WEB_SRC, "lib", domain);
  const shared = path.join(SHARED_SRC, domain);
  if (!fs.existsSync(web) && !fs.existsSync(shared)) {
    throw new Error(`walkLib: no lib domain "${domain}" in the web or shared`);
  }
  return [...walkTs(web), ...walkTs(shared)];
}

/**
 * The one file for a lib module path such as "logging/schedule.ts", whether it
 * is still in the web (`src/lib/…`) or in the shared package. Throws when it is
 * in both (a duplicate) or neither (a guard reading nothing).
 */
export function libFile(rel: string): string {
  const web = path.join(WEB_SRC, "lib", rel);
  const shared = path.join(SHARED_SRC, rel);
  const found = [web, shared].filter((f) => fs.existsSync(f));
  if (found.length !== 1) {
    throw new Error(
      `libFile("${rel}"): expected exactly one of ${path.relative(WEB_ROOT, web)} or ${path.relative(WEB_ROOT, shared)}, found ${found.length}`,
    );
  }
  return found[0];
}

/** A display path relative to apps/web (shared files read "../../packages/shared/src/…"). */
export function relToWeb(file: string): string {
  return path.relative(WEB_ROOT, file).replace(/\\/g, "/");
}
