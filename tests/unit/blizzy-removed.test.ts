/**
 * OVE-118: the /blizzy page and its first-party attribution are removed. The
 * BLIZZY code reaches people only through the creator's videos and word of
 * mouth: no public page names it or links to it, no request sets the old
 * campaign cookie, and signup records no campaign. The Stripe promotion code
 * itself (entered on Stripe's own Checkout page) is unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

const getUser = jest.fn(async () => ({
  data: { user: null as null | { id: string } },
}));
jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => ({ auth: { getUser } })),
}));
jest.mock("@/lib/db", () => ({ prisma: {} }));

import { proxy } from "@/proxy";
import { MARKETING_PATHS, isPublicPath } from "@/lib/auth-routes";
import { INDEXABLE_PUBLIC_PATHS } from "@/lib/marketing/site";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function srcFiles(dir = path.join(REPO_ROOT, "src")): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...srcFiles(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("the /blizzy page is gone", () => {
  it("has no route file, and is neither public nor indexable", () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(marketing)/blizzy")),
    ).toBe(false);
    expect(MARKETING_PATHS as readonly string[]).not.toContain("/blizzy");
    expect(INDEXABLE_PUBLIC_PATHS as readonly string[]).not.toContain(
      "/blizzy",
    );
    expect(isPublicPath("/blizzy")).toBe(false);
  });

  it("no source file links to it", () => {
    const linking = srcFiles().filter((f) =>
      /["'`]\/blizzy\b/.test(fs.readFileSync(f, "utf8")),
    );
    expect(linking).toEqual([]);
  });

  it("no request sets the old campaign cookie", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const p of ["/blizzy", "/", "/pricing", "/signup"]) {
      const res = await proxy(
        new NextRequest(new URL(p, "https://www.overloadtraining.app")),
      );
      const cookies = res.headers.getSetCookie().join("\n");
      expect([p, cookies.includes("ovl_campaign=")]).toEqual([p, false]);
    }
  });

  it("signup and profile creation no longer record a campaign", () => {
    for (const rel of [
      "src/app/signup/actions.ts",
      "src/lib/accounts/signup.ts",
      "src/lib/data/account.ts",
      "src/proxy.ts",
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      expect([rel, /signupCampaign|ovl_campaign|campaign/i.test(src)]).toEqual([
        rel,
        false,
      ]);
    }
  });
});
