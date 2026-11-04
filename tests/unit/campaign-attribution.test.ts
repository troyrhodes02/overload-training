/**
 * Public Landing Page & Changelog — L4 (OVE-99; spec §4, §10, §14; RD-7–RD-9;
 * P21-AC7). First-party campaign attribution: the cookie holds only an
 * allowlisted name and its issue time; anything else is absent; it is set by
 * a real GET of /blizzy and nothing else; signup records it only from the
 * cookie, re-validated; it never authorizes a discount.
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
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createConfirmedUser: jest.fn(),
  deleteAuthUser: jest.fn(),
}));
jest.mock("@/lib/data/account", () => ({
  DEFAULT_PROFILE_TIME_ZONE: "UTC",
  establishProfile: jest.fn(),
}));
jest.mock("@/lib/data/usernames", () => ({ isUsernameAvailable: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: {} }));

import {
  CAMPAIGN_COOKIE,
  CAMPAIGN_TTL_SECONDS,
  CAMPAIGNS,
  campaignCookieFor,
  campaignForPath,
  encodeCampaign,
  isCampaign,
  parseCampaign,
} from "@/lib/marketing/campaign";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";
import { proxy } from "@/proxy";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

const NOW = new Date("2026-11-04T18:00:00.000Z");
const T = Math.floor(NOW.getTime() / 1000);

describe("allowlist and cookie value (RD-8)", () => {
  it("allows only blizzy today", () => {
    expect(CAMPAIGNS).toEqual(["blizzy"]);
    expect(isCampaign("blizzy")).toBe(true);
    for (const v of ["BLIZZY", "Blizzy", "other", "", null, 1, "blizzy "]) {
      expect(isCampaign(v)).toBe(false);
    }
  });

  it("only /blizzy sets a campaign", () => {
    expect(campaignForPath("/blizzy")).toBe("blizzy");
    for (const p of ["/", "/pricing", "/blizzy/x", "/BLIZZY", "/blizzyy"]) {
      expect(campaignForPath(p)).toBeNull();
    }
  });

  it("round-trips a fresh value", () => {
    expect(encodeCampaign("blizzy", NOW)).toBe(`blizzy.${T}`);
    expect(parseCampaign(`blizzy.${T}`, NOW)).toBe("blizzy");
  });

  it("no campaign: an absent cookie is null", () => {
    expect(parseCampaign(undefined, NOW)).toBeNull();
    expect(parseCampaign(null, NOW)).toBeNull();
    expect(parseCampaign("", NOW)).toBeNull();
  });

  it.each([
    ["wrong case", `BLIZZY.${T}`],
    ["unknown campaign", `other.${T}`],
    ["no issue time", "blizzy"],
    ["non-numeric time", "blizzy.abc"],
    ["extra segment", `blizzy.${T}.x`],
    ["injection attempt", `blizzy.${T};admin=1`],
    ["url-encoded junk", `blizzy%2E${T}`],
    ["overlong", `blizzy.${"1".repeat(80)}`],
  ])("tampered (%s) is treated as absent", (_why, raw) => {
    expect(parseCampaign(raw, NOW)).toBeNull();
  });

  it("expired: older than two hours is absent; just inside is valid", () => {
    expect(
      parseCampaign(`blizzy.${T - CAMPAIGN_TTL_SECONDS - 1}`, NOW),
    ).toBeNull();
    expect(parseCampaign(`blizzy.${T - CAMPAIGN_TTL_SECONDS}`, NOW)).toBe(
      "blizzy",
    );
  });

  it("an issue time far in the future is absent (small skew tolerated)", () => {
    expect(parseCampaign(`blizzy.${T + 3600}`, NOW)).toBeNull();
    expect(parseCampaign(`blizzy.${T + 30}`, NOW)).toBe("blizzy");
  });

  it("the cookie is first-party, HttpOnly, Lax, root path, two hours, Secure on https", () => {
    expect(campaignCookieFor("/blizzy", NOW, true)).toEqual({
      name: CAMPAIGN_COOKIE,
      value: `blizzy.${T}`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: 7200,
      },
    });
    expect(campaignCookieFor("/blizzy", NOW, false)!.options.secure).toBe(
      false,
    );
    expect(campaignCookieFor("/pricing", NOW, true)).toBeNull();
  });
});

describe("the proxy sets it only on a real GET of /blizzy", () => {
  const req = (
    p: string,
    init: { method?: string; headers?: Record<string, string> } = {},
  ) => new NextRequest(new URL(p, "https://www.overloadtraining.app"), init);
  const campaignCookie = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.trim().startsWith(`${CAMPAIGN_COOKIE}=`));

  beforeEach(() => getUser.mockResolvedValue({ data: { user: null } }));

  it("sets it on GET /blizzy (signed out), with the safe attributes", async () => {
    const cookie = campaignCookie(await proxy(req("/blizzy")));
    expect(cookie).toMatch(/^ovl_campaign=blizzy\.\d+;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=7200/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it("repeat visit: sets a fresh value again (refreshes the window)", async () => {
    expect(campaignCookie(await proxy(req("/blizzy")))).toBeDefined();
    expect(campaignCookie(await proxy(req("/blizzy")))).toBeDefined();
  });

  it("sets it for a signed-in visitor too (it only feeds the Plan & Billing reminder)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    expect(campaignCookie(await proxy(req("/blizzy")))).toBeDefined();
  });

  it.each([
    ["next router prefetch", { "next-router-prefetch": "1" }],
    ["browser prefetch (purpose)", { purpose: "prefetch" }],
    ["browser prefetch (sec-purpose)", { "sec-purpose": "prefetch;prerender" }],
  ])("never on a %s", async (_why, headers) => {
    expect(
      campaignCookie(await proxy(req("/blizzy", { headers }))),
    ).toBeUndefined();
  });

  it("never on other pages or other methods", async () => {
    for (const p of ["/", "/pricing", "/changelog", "/signup"]) {
      expect(campaignCookie(await proxy(req(p)))).toBeUndefined();
    }
    expect(
      campaignCookie(await proxy(req("/blizzy", { method: "HEAD" }))),
    ).toBeUndefined();
  });

  it("signed-out / is rewritten to the landing page, with no campaign", async () => {
    const res = await proxy(req("/"));
    expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/welcome$/);
    expect(campaignCookie(res)).toBeUndefined();
  });
});

describe("signup records the campaign only when valid (RD-9)", () => {
  const NEW_ID = "b0000000-0000-4000-8000-000000000002";
  const deps = (): SignUpDeps => ({
    checkAndIncrement: jest.fn(async () => ({ allowed: true })),
    verifyChallenge: jest.fn(async () => true),
    isUsernameAvailable: jest.fn(async () => true),
    createConfirmedUser: jest.fn(async () => ({
      ok: true as const,
      user: { id: NEW_ID },
    })),
    deleteAuthUser: jest.fn(async () => "deleted" as const),
    signIn: jest.fn(async () => ({ user: { id: NEW_ID } })),
    signOut: jest.fn(async () => {}),
    establishProfile: jest.fn(async () => {}),
  });
  const valid = {
    firstName: "Sam",
    lastName: "Ortiz",
    username: "sam_lifts",
    email: "sam@example.com",
    password: "barbell-315",
    confirmPassword: "barbell-315",
    timeZone: "UTC",
    inviteCode: null,
  };
  const OPEN = { OVERLOAD_SIGNUP_MODE: "public" };

  it("records blizzy when the action passes a validated campaign", async () => {
    const d = deps();
    await signUp({ ...valid, signupCampaign: "blizzy" }, d, OPEN);
    expect(d.establishProfile).toHaveBeenCalledWith(
      { id: NEW_ID },
      expect.objectContaining({ signupCampaign: "blizzy" }),
    );
  });

  it.each([
    [undefined],
    [null],
    ["BLIZZY"],
    ["other"],
    [{ c: "blizzy" }],
    [`blizzy.${T}`],
  ])(
    "records nothing for %p (re-validated at the module boundary)",
    async (claim) => {
      const d = deps();
      await signUp({ ...valid, signupCampaign: claim }, d, OPEN);
      expect(d.establishProfile).toHaveBeenCalledWith(
        { id: NEW_ID },
        expect.objectContaining({ signupCampaign: null }),
      );
    },
  );

  it("the signup action reads the campaign from the cookie, never the form, and spends it after signup", () => {
    const src = read("src/app/signup/actions.ts");
    expect(src).toMatch(/parseCampaign\(\s*jar\.get\(CAMPAIGN_COOKIE\)/);
    expect(src).not.toMatch(/get\(["']signupCampaign["']\)/);
    expect(src).toMatch(/jar\.delete\(CAMPAIGN_COOKIE\)/);
  });

  it("establishProfile is the only writer of signupCampaign in src", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
      }
    };
    walk(path.join(REPO_ROOT, "src"));
    const writers = files
      .filter((f) =>
        /signupCampaign\s*:\s*input\.signupCampaign/.test(
          fs.readFileSync(f, "utf8"),
        ),
      )
      .map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, "/"));
    expect(writers).toEqual(["src/lib/data/account.ts"]);
  });
});

describe("a campaign never authorizes a discount (RD-7)", () => {
  it("checkout has no path from a campaign or cookie to a discount", () => {
    for (const file of [
      "src/lib/billing/checkout.ts",
      "src/lib/billing/stripe.ts",
    ]) {
      expect([file, /campaign|discounts\s*:/i.test(read(file))]).toEqual([
        file,
        false,
      ]);
    }
    // Promotion codes stay monthly-only, entered on Stripe's own page.
    expect(read("src/lib/billing/stripe.ts")).toMatch(
      /allow_promotion_codes: interval === "month"/,
    );
  });
});
