/**
 * Pitch 21g RD-A / spec §12: the phone never runs the progression engine. No
 * app source imports the engine, e1RM, recurring-segment, or deload modules
 * (the deload FACTOR from config.ts is display copy, and allowed).
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..", "src");
const FORBIDDEN =
  /@overload\/shared\/progression\/(engine|e1rm|recurring|deload|history)(["'/])/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}

it("no app source imports a progression rule", () => {
  const offenders = files(SRC).filter((f) =>
    FORBIDDEN.test(fs.readFileSync(f, "utf8")),
  );
  expect(offenders).toEqual([]);
});
