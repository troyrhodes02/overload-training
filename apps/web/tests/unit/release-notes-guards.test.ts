import fs from "node:fs";
import path from "node:path";
import { RELEASE_NOTES } from "@overload/shared/release-notes/entries";
import { libFile, relToWeb, walkCode } from "../support/code-roots";

/**
 * What's New — structural guards (spec §8, §14.1; R5, R21, R30).
 *
 *  - entries.ts is the single source of release notes, read only through
 *    catalog.ts (no copies, no second registry);
 *  - the public-safe modules import nothing private, so a future public
 *    changelog can reuse the content and the ReleaseNote component without
 *    reaching any account state;
 *  - the mechanism names no entry, so adding one is a data-only change;
 *  - nothing sends email or push.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
const importsOf = (src: string) =>
  [...src.matchAll(/(?:import|from)\s+["']([^"']+)["']/g)].map((m) => m[1]);

// The release-note content and catalog live in the shared package since Pitch
// 21b; libFile finds them there (and fails if they exist in both trees).
const TYPES = relToWeb(libFile("release-notes/types.ts"));
const ENTRIES = relToWeb(libFile("release-notes/entries.ts"));
const CATALOG = relToWeb(libFile("release-notes/catalog.ts"));

/** Modules a public (unauthenticated) changelog may import. */
export const PUBLIC_SAFE = [
  TYPES,
  ENTRIES,
  CATALOG,
  "src/components/release-notes/release-note.tsx",
];

/** The What's New mechanism: none of it may name an entry. */
export const MECHANISM = [
  TYPES,
  CATALOG,
  "src/lib/release-notes/seen.ts",
  "src/app/(app)/release-notes-actions.ts",
  "src/components/release-notes/release-note.tsx",
  "src/components/release-notes/whats-new-dialog.tsx",
  "src/app/(app)/settings/whats-new/page.tsx",
  "src/app/(app)/layout.tsx",
  "src/components/shell/app-shell.tsx",
];

it("entries.ts imports only the entry type", () => {
  expect(importsOf(read(ENTRIES))).toEqual(["./types"]);
});

it("RELEASE_NOTES is read only by catalog.ts", () => {
  const readers = walkCode()
    .filter((f) => /\bRELEASE_NOTES\b/.test(fs.readFileSync(f, "utf8")))
    .map(rel)
    .sort();
  expect(readers).toEqual([CATALOG, ENTRIES].sort());
});

it("the public-safe modules import nothing private", () => {
  for (const file of PUBLIC_SAFE) {
    for (const spec of importsOf(read(file))) {
      expect([file, spec]).toEqual([
        file,
        expect.not.stringMatching(
          /^(server-only|@\/lib\/(db|data|auth|supabase|accounts)|@prisma|@supabase|.*\/seen)/,
        ),
      ]);
    }
    expect([
      file,
      /\bprocess\.env\b|\bcookies\(|\bheaders\(/.test(read(file)),
    ]).toEqual([file, false]);
  }
});

it("the ReleaseNote component is presentational: no client hooks, no props about the reader", () => {
  const src = read("src/components/release-notes/release-note.tsx");
  expect(src).not.toMatch(/"use client"|use(State|Effect|Ref|Context)/);
  expect(src).toMatch(/entry: ReleaseNoteView;\s*headingLevel: 2 \| 3;/);
});

it("seen state stays server-only and is the only module that touches it", () => {
  expect(read("src/lib/release-notes/seen.ts")).toMatch(
    /^import "server-only";/,
  );
  const touchers = walkCode()
    .filter((f) => /\.releaseSeen\b/.test(fs.readFileSync(f, "utf8")))
    .map(rel)
    .sort();
  // seen.ts reads and marks; the signup profile write starts a new account
  // caught up; the deletion module removes the row; the data export (PA6)
  // reads the account's own ReleaseSeen into the file it takes with it.
  expect(touchers).toEqual([
    "src/lib/accounts/deletion.ts",
    "src/lib/accounts/export.ts",
    "src/lib/data/account.ts",
    "src/lib/release-notes/seen.ts",
  ]);
});

it("the mechanism names no entry (adding one is data only)", () => {
  const entryLike = /["'`]\d{4}-\d{2}-\d{2}-[a-z0-9-]+["'`]/;
  for (const file of MECHANISM) {
    const src = read(file);
    expect([file, entryLike.test(src)]).toEqual([file, false]);
    for (const e of RELEASE_NOTES) {
      expect([file, src.includes(e.id) || src.includes(e.title)]).toEqual([
        file,
        false,
      ]);
    }
  }
});

it("nothing sends email or push", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  expect(
    deps.filter((d) =>
      /resend|nodemailer|sendgrid|postmark|web-push|mailgun/i.test(d),
    ),
  ).toEqual([]);
  // The dependency check above is the real anti-SDK protection: no third-party
  // email or push package may be installed. The source scan then forbids those
  // identifiers anywhere in src — with ONE sanctioned exception. Public
  // Accounts (spec §11) sends recovery and verification mail through Supabase
  // Auth's OWN templates over custom SMTP (no SDK): recovery uses
  // resetPasswordForEmail (no matched identifier), and verification uses the
  // Supabase auth client's `resend` of its own template. The verification
  // module is the only file allowed to name it; `resend` stays forbidden
  // everywhere else, and no email/push SDK is ever a dependency.
  const EMAIL_SENDER_EXEMPT = "src/lib/accounts/verification.ts";
  const offenders = walkCode()
    .filter((f) => rel(f) !== EMAIL_SENDER_EXEMPT)
    .filter((f) =>
      /\b(resend|nodemailer|web-push|PushManager|showNotification)\b/i.test(
        fs.readFileSync(f, "utf8"),
      ),
    )
    .map(rel);
  expect(offenders).toEqual([]);
});
