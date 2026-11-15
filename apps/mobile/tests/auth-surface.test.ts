/**
 * Pitch 21d spec §13 (B9): the app reaches Supabase for auth only. No file
 * calls a data API on a Supabase client, and only the auth module imports it.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..", "src");
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name)) files.push(full);
  }
};
walk(SRC);
const rel = (f: string) => path.relative(SRC, f);
/** Source without comments, so the rules' own explanations don't count. */
const code = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Supabase is auth only", () => {
  it("only src/auth/supabase.ts imports supabase-js, and it exports the auth client", () => {
    const importers = files.filter((f) =>
      /from\s+["']@supabase\//.test(fs.readFileSync(f, "utf8")),
    );
    expect(importers.map(rel)).toEqual([path.join("auth", "supabase.ts")]);
    const code = fs.readFileSync(path.join(SRC, "auth", "supabase.ts"), "utf8");
    expect(code).toMatch(/\}\)\.auth;/);
    expect(code).not.toMatch(
      /export\s+(const|function)\s+\w+\s*=?\s*createClient/,
    );
  });

  it("no file calls a Supabase data API", () => {
    const offenders = files.filter((f) =>
      /\.(from|rpc|channel)\(|\.storage\b|\.functions\b|\.realtime\b/.test(
        code(f),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no file writes a token anywhere but the Keychain adapter", () => {
    const offenders = files.filter((f) =>
      /AsyncStorage|localStorage|MMKV/.test(code(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
