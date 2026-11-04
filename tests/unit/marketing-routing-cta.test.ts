/**
 * Public Landing Page & Changelog — L1 (OVE-96; spec §7, §14; design §6.9).
 * Routing: the public root is the landing page for signed-out visitors and
 * Today for signed-in lifters, with no loops and no loosening of the
 * protected app. CTA truth: every (signed in × signup mode × billing) row.
 */
import {
  LANDING_PATH,
  MARKETING_PATHS,
  isPublicPath,
  routeRedirect,
  routeRewrite,
} from "@/lib/auth-routes";
import {
  CLOSED_NOTE,
  FAIL_CLOSED_CONTEXT,
  INVITE_NOTE,
  TRIAL_NOTE,
  resolveCta,
  type MarketingContext,
} from "@/lib/marketing/cta";
import {
  INDEXABLE_PUBLIC_PATHS,
  PUBLIC_SITE_ORIGIN,
  canonicalUrl,
  isProductionDeployment,
} from "@/lib/marketing/site";

describe("public root routing (RD-4)", () => {
  it("rewrites signed-out / to the landing page and never redirects it", () => {
    expect(routeRewrite("/", false)).toBe(LANDING_PATH);
    expect(routeRedirect("/", false)).toBeNull();
  });

  it("leaves signed-in / alone: Today, no rewrite, no redirect", () => {
    expect(routeRewrite("/", true)).toBeNull();
    expect(routeRedirect("/", true)).toBeNull();
  });

  it("rewrites only the exact root", () => {
    for (const p of ["/plan", "/welcome", "/pricing", "//", "/today"]) {
      expect(routeRewrite(p, false)).toBeNull();
    }
  });

  it.each([
    ...MARKETING_PATHS,
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
  ])(
    "%s is reachable signed in and signed out (no redirect either way)",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
      expect(routeRedirect(path, false)).toBeNull();
      expect(routeRedirect(path, true)).toBeNull();
    },
  );

  it.each([
    "/plan",
    "/plan/new",
    "/history",
    "/goals",
    "/gyms",
    "/exercises",
    "/feedback",
    "/log/start",
    "/settings",
    "/settings/billing",
    "/settings/whats-new",
    "/admin",
    "/admin/accounts",
    "/api/anything",
    "/pricingx",
    "/blizzy-other",
  ])("%s still requires an auth session (signed out → /login)", (path) => {
    expect(isPublicPath(path)).toBe(false);
    expect(routeRedirect(path, false)).toBe("/login");
  });

  it("still sends a signed-in visitor from the sign-in doors to Today only", () => {
    expect(routeRedirect("/login", true)).toBe("/");
    expect(routeRedirect("/signup", true)).toBe("/");
    // …and Today itself never redirects anywhere (no loop).
    expect(routeRedirect("/", true)).toBeNull();
  });
});

describe("CTA matrix (design §6.9; RD-5/RD-6)", () => {
  const ctx = (
    signedIn: boolean,
    signupMode: MarketingContext["signupMode"],
    billingEnabled: boolean,
  ): MarketingContext => ({ signedIn, signupMode, billingEnabled });

  const rows: [
    MarketingContext,
    string,
    string,
    string | null,
    string | null,
  ][] = [
    // ctx, primary label, primary href, note, pro href
    [ctx(true, "closed", false), "Open Overload", "/", null, null],
    [ctx(true, "invite", false), "Open Overload", "/", null, null],
    [ctx(true, "public", false), "Open Overload", "/", null, null],
    [
      ctx(true, "closed", true),
      "Open Overload",
      "/",
      null,
      "/settings/billing",
    ],
    [
      ctx(true, "invite", true),
      "Open Overload",
      "/",
      null,
      "/settings/billing",
    ],
    [
      ctx(true, "public", true),
      "Open Overload",
      "/",
      null,
      "/settings/billing",
    ],
    [
      ctx(false, "public", false),
      "Create an account",
      "/signup",
      TRIAL_NOTE,
      null,
    ],
    [
      ctx(false, "public", true),
      "Create an account",
      "/signup",
      TRIAL_NOTE,
      "/signup",
    ],
    [
      ctx(false, "invite", false),
      "Join with an invite code",
      "/signup",
      INVITE_NOTE,
      null,
    ],
    [
      ctx(false, "invite", true),
      "Join with an invite code",
      "/signup",
      INVITE_NOTE,
      "/signup",
    ],
    [ctx(false, "closed", false), "Sign in", "/login", CLOSED_NOTE, null],
    [ctx(false, "closed", true), "Sign in", "/login", CLOSED_NOTE, "/login"],
  ];

  it.each(rows)("%o → %s", (context, label, href, note, proHref) => {
    const cta = resolveCta(context);
    expect(cta.primary).toEqual({ label, href });
    expect(cta.note).toBe(note);
    expect(cta.pro?.href ?? null).toBe(proHref);
  });

  it("covers all 12 combinations exactly once", () => {
    const keys = new Set(
      rows.map(([c]) => `${c.signedIn}|${c.signupMode}|${c.billingEnabled}`),
    );
    expect(keys.size).toBe(12);
  });

  it("billing off never yields any action toward subscribing or checkout", () => {
    for (const [c] of rows.filter(([c]) => !c.billingEnabled)) {
      const cta = resolveCta(c);
      expect(cta.pro).toBeNull();
      const actions = [cta.primary, cta.secondary].filter(Boolean);
      for (const a of actions) {
        expect(a!.href).not.toBe("/settings/billing");
        expect(a!.label.toLowerCase()).not.toMatch(
          /subscribe|buy|pay|checkout/,
        );
      }
    }
  });

  it("closed mode never offers signup (and no mode offers a waitlist)", () => {
    for (const [c] of rows) {
      const cta = resolveCta(c);
      const all = [cta.primary, cta.secondary, cta.pro].filter(Boolean);
      for (const a of all)
        expect(a!.label.toLowerCase()).not.toMatch(
          /waitlist|notify|early access/,
        );
      if (!c.signedIn && c.signupMode === "closed") {
        for (const a of all) expect(a!.href).not.toBe("/signup");
        expect(cta.closed).toBe(true);
      }
    }
  });

  it("invite mode says a code is required", () => {
    const cta = resolveCta(ctx(false, "invite", false));
    expect(cta.primary.label).toMatch(/invite code/i);
    expect(cta.note).toMatch(/invite code/i);
  });

  it("a signed-in visitor is always offered the app and never a sign-in", () => {
    for (const [c] of rows.filter(([c]) => c.signedIn)) {
      const cta = resolveCta(c);
      expect(cta.primary.href).toBe("/");
      expect(cta.secondary).toBeNull();
    }
  });

  it("fails closed", () => {
    expect(FAIL_CLOSED_CONTEXT).toEqual({
      signedIn: false,
      signupMode: "closed",
      billingEnabled: false,
    });
    expect(resolveCta(FAIL_CLOSED_CONTEXT).primary.href).toBe("/login");
  });
});

describe("site constants (RD-15)", () => {
  it("uses the owner-confirmed canonical host", () => {
    expect(PUBLIC_SITE_ORIGIN).toBe("https://www.overloadtraining.app");
    expect(canonicalUrl("/")).toBe("https://www.overloadtraining.app/");
    expect(canonicalUrl("/pricing")).toBe(
      "https://www.overloadtraining.app/pricing",
    );
  });

  it("indexes only public pages, never app/auth/admin routes", () => {
    for (const p of INDEXABLE_PUBLIC_PATHS) {
      expect(p === "/" || isPublicPath(p)).toBe(true);
      expect(p).not.toMatch(
        /^\/(login|signup|welcome|settings|admin|api|plan|history)/,
      );
    }
  });

  it("treats only VERCEL_ENV=production as production", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionDeployment({})).toBe(false);
  });
});

jest.mock("next/server", () => ({ connection: jest.fn(async () => {}) }));

describe("robots.txt (RD-15)", () => {
  const original = process.env.VERCEL_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  it("disallows everything outside production", async () => {
    delete process.env.VERCEL_ENV;
    const { default: robots } = await import("@/app/robots");
    expect(await robots()).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });

  it("allows only the public pages in production and points at the sitemap", async () => {
    process.env.VERCEL_ENV = "production";
    const { default: robots } = await import("@/app/robots");
    const r = await robots();
    const rules = r.rules as { allow: string[]; disallow: string };
    expect(rules.disallow).toBe("/");
    expect(rules.allow).toEqual([
      "/$",
      "/pricing",
      "/blizzy",
      "/changelog",
      "/support",
    ]);
    expect(r.sitemap).toBe("https://www.overloadtraining.app/sitemap.xml");
  });

  it("sitemap lists the indexable pages on the canonical origin", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    expect(sitemap().map((e) => e.url)).toEqual(
      INDEXABLE_PUBLIC_PATHS.map(canonicalUrl),
    );
  });
});
