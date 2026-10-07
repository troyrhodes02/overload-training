#!/usr/bin/env node
/**
 * Fails if any server-only database secret appears in the client bundle.
 * Run AFTER `next build`. Scans .next/static for forbidden tokens and for the
 * actual values of DATABASE_URL / DIRECT_URL / the service-role key if those
 * env vars are set in the build environment.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

if (!existsSync(STATIC_DIR)) {
  console.error(
    "check-client-bundle: .next/static not found. Run `next build` first.",
  );
  process.exit(1);
}

// Tokens that should never appear in client code.
const forbiddenTokens = ["DATABASE_URL", "DIRECT_URL", "service_role"];

// Actual secret values present in the build env (never their public NEXT_PUBLIC_ vars).
const forbiddenValues = [
  process.env.DATABASE_URL,
  process.env.DIRECT_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
].filter((v) => typeof v === "string" && v.length > 0);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|cjs|map)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(STATIC_DIR)) {
  const contents = readFileSync(file, "utf8");
  for (const token of forbiddenTokens) {
    if (contents.includes(token)) {
      offenders.push(
        `${path.relative(process.cwd(), file)} contains "${token}"`,
      );
    }
  }
  for (const value of forbiddenValues) {
    if (contents.includes(value)) {
      offenders.push(
        `${path.relative(process.cwd(), file)} contains a server secret value`,
      );
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "check-client-bundle: FAILED — secrets found in client bundle:",
  );
  for (const o of offenders) console.error(`  - ${o}`);
  process.exit(1);
}

console.log(
  "check-client-bundle: OK — no server database secret found in .next/static.",
);
