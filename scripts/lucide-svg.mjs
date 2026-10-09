#!/usr/bin/env node
/**
 * Prints Lucide icons as inline SVG markup, using the exact path data of the
 * lucide-react version the app ships. Used to author UI previews
 * (docs/previews/*.html), which must open offline with no icon CDN.
 *
 *   node scripts/lucide-svg.mjs chevron-right triangle-alert plus
 *
 * Output: one line per icon, `name<TAB><svg …>`. The SVG uses
 * stroke="currentColor", stroke-width 2, and no width/height, so the preview's
 * CSS sizes and colors it the same way the app's `className="size-4"` does.
 */
import fs from "node:fs";
import path from "node:path";

const ICON_DIR = path.join(
  process.cwd(),
  "node_modules",
  "lucide-react",
  "dist",
  "esm",
  "icons",
);

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: node scripts/lucide-svg.mjs <icon-name> [...]");
  process.exit(1);
}

function attrs(obj) {
  return Object.entries(obj)
    .filter(([k]) => k !== "key")
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

let failed = false;
for (const name of names) {
  const file = path.join(ICON_DIR, `${name}.mjs`);
  if (!fs.existsSync(file)) {
    console.error(`unknown icon: ${name}`);
    failed = true;
    continue;
  }
  let src = fs.readFileSync(file, "utf8");
  // Renamed icons are re-exports (e.g. building-2 → building-complex).
  const alias = src.match(/export \{ default \} from '\.\/([\w-]+)\.mjs'/);
  if (alias)
    src = fs.readFileSync(path.join(ICON_DIR, `${alias[1]}.mjs`), "utf8");
  // The icon's node array ends right before `, aliases` or the closing `}`.
  const match = src.match(/node:\s*(\[[\s\S]*?\])(\s*,\s*aliases|\s*\})/);
  if (!match) {
    console.error(`could not parse: ${name}`);
    failed = true;
    continue;
  }
  // The node array is a plain JS literal (strings and objects only).
  const node = Function(`"use strict"; return (${match[1]});`)();
  const children = node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
  console.log(
    `${name}\t<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`,
  );
}
process.exit(failed ? 1 : 0);
