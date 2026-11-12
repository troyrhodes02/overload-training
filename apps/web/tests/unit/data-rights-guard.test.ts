jest.mock("@/lib/auth", () => {
  const requireUser = jest.fn();
  return {
    requireUser,
    getAuthUser: jest.fn(),
    currentUser: (...args: unknown[]) => requireUser(...args),
  };
});
jest.mock("@/lib/data/account-db", () => ({ createAccountClient: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import fs from "node:fs";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { createAccountClient } from "@/lib/data/account-db";
import {
  requireAccount,
  requireAccountForDataRights,
} from "@/lib/data/account";

/**
 * OVE-125 (mobile audit F-A7): a suspended account keeps its data rights —
 * downloading its export and deleting itself — through one narrow guard.
 * requireAccount() is NOT weakened: it still refuses suspension everywhere.
 */

const USER = "44444444-4444-4444-8444-444444444444";
const findUnique = jest.fn();
const updateMany = jest.fn();
const db = { profile: { findUnique, updateMany, create: jest.fn() } };
const profile = (status: "active" | "suspended") => ({
  timeZone: "UTC",
  status,
  lastActiveOn: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  (requireUser as jest.Mock).mockResolvedValue({ id: USER });
  (createAccountClient as jest.Mock).mockReturnValue(db);
  updateMany.mockResolvedValue({ count: 1 });
});

it("returns a suspended account (no redirect) and records nothing for it", async () => {
  findUnique.mockResolvedValue(profile("suspended"));
  const { account, suspended } = await requireAccountForDataRights();
  expect(suspended).toBe(true);
  expect(account.userId).toBe(USER);
  expect(updateMany).not.toHaveBeenCalled();
});

it("returns an active account and records last-active as usual", async () => {
  findUnique.mockResolvedValue(profile("active"));
  const { suspended } = await requireAccountForDataRights();
  expect(suspended).toBe(false);
  expect(updateMany).toHaveBeenCalledTimes(1);
});

it("requireAccount still refuses a suspended account", async () => {
  findUnique.mockResolvedValue(profile("suspended"));
  await expect(requireAccount()).rejects.toThrow("NEXT_REDIRECT:/suspended");
});

it("only the export route and the delete-account flow use the data-rights guard", () => {
  const ROOT = path.resolve(__dirname, "..", "..");
  const SRC = path.join(ROOT, "src");
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full);
    }
    return acc;
  };
  const code = (f: string) =>
    fs
      .readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const callers = walk(SRC)
    .filter((f) => /\brequireAccountForDataRights\b/.test(code(f)))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"))
    .sort();
  expect(callers).toEqual(
    [
      "src/app/(app)/settings/delete-account/actions.ts",
      "src/app/(app)/settings/export/route.ts",
      "src/app/suspended/delete-account/page.tsx",
      "src/lib/data/account.ts",
    ].sort(),
  );
});
