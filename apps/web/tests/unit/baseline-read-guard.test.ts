import fs from "node:fs";
import path from "node:path";
import { walkCode } from "../support/code-roots";

/**
 * Prescription-Aware Intelligence (spec §7.2–§7.3; RD-9): the gym baseline is
 * no longer a weight source for the card's offer, a progression number, or a
 * scheduled-deload number. Its write path (src/lib/gyms/baselines.ts) is
 * unchanged, and the account's own data export and account deletion still
 * reach it. No other module may touch the table.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const relPath = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");

const ALLOWED = new Set([
  "src/lib/gyms/baselines.ts", // establish / correct, in the set's transaction
  "src/lib/accounts/export.ts", // the account's own data export
  "src/lib/accounts/deletion.ts", // account deletion removes it
]);

it("no module but the write path, export, and deletion reads gym baselines", () => {
  const offenders: string[] = [];
  const re = /\.\s*gymExerciseBaseline\s*\./;
  for (const file of walkCode()) {
    const rel = relPath(file);
    if (!rel.startsWith("src/") || ALLOWED.has(rel)) continue;
    if (re.test(fs.readFileSync(file, "utf8"))) offenders.push(rel);
  }
  expect(offenders).toEqual([]);
});
