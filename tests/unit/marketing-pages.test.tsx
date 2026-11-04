/**
 * Public Landing Page & Changelog — L3 (OVE-98; spec §6, §14; P21-AC1/AC8).
 * The landing and pricing pages render the server-resolved truth for every
 * mode, never offer a way to pay while billing is off, and say nothing the
 * product can't back up.
 */
import fs from "node:fs";
import path from "node:path";
import type { MarketingContext } from "@/lib/marketing/cta";

const mockContext = jest.fn<Promise<MarketingContext>, []>();
jest.mock("@/lib/marketing/context", () => ({
  getMarketingContext: () => mockContext(),
}));

const REPO_ROOT = path.resolve(__dirname, "..", "..");

async function renderHtml(node: React.ReactNode): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server");
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

async function page(which: "welcome" | "pricing", ctx: MarketingContext) {
  mockContext.mockResolvedValue(ctx);
  const mod =
    which === "welcome"
      ? await import("@/app/(marketing)/welcome/page")
      : await import("@/app/(marketing)/pricing/page");
  const Page = mod.default;
  return renderHtml(<Page />);
}

const off = (o: Partial<MarketingContext> = {}): MarketingContext => ({
  signedIn: false,
  signupMode: "invite",
  billingEnabled: false,
  ...o,
});

/** Visible text only (tags stripped), for wording checks. */
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** The visible labels of every link and button. */
const actions = (html: string) =>
  [...html.matchAll(/<(a|button)[^>]*>([\s\S]*?)<\/>/g)].map((m) =>
    text(m[2]).trim(),
  );

describe("landing (design Screen 1)", () => {
  it("leads with hero concept A and one h1", async () => {
    const html = await page("welcome", off());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(text(html)).toContain("You logged the reps. Know what to do next.");
  });

  it("keeps the section order of the claim ledger", async () => {
    const t = text(await page("welcome", off()));
    const order = [
      "You logged the reps",
      "A log tells you what you did.",
      "The call, and the reason.",
      "Machines aren't universal.",
      "A trend, not a list.",
      "Logging is free. The call is Pro.",
      "What Overload won't do.",
      "Recently shipped",
    ].map((s) => t.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows the pending frame (never a mockup) while a shot is uncaptured", async () => {
    const { SHOTS } = await import("@/lib/marketing/screenshots");
    const html = await page("welcome", off());
    if (Object.values(SHOTS).some((s) => s.sources === null)) {
      expect(html).toContain('aria-label="Screenshot not yet captured"');
    }
    expect(html).not.toMatch(/mock/i);
  });

  it.each([
    [off({ signupMode: "public" }), "Create an account", "/signup"],
    [off({ signupMode: "invite" }), "Join with an invite code", "/signup"],
    [off({ signupMode: "closed" }), "Sign in", "/login"],
    [off({ signedIn: true }), "Open Overload", "/"],
  ])("hero action follows the mode %#", async (ctx, label, href) => {
    const html = await page("welcome", ctx);
    expect(html).toContain(`href="${href}"`);
    expect(text(html)).toContain(label);
  });

  it("closed mode offers no signup link at all", async () => {
    const html = await page("welcome", off({ signupMode: "closed" }));
    expect(html).not.toContain('href="/signup"');
    expect(text(html)).toContain("isn't taking new accounts right now");
  });

  it("links the three newest release notes to their changelog anchors", async () => {
    const html = await page("welcome", off());
    const anchors = html.match(/href="\/changelog#[^"]+"/g) ?? [];
    expect(anchors).toHaveLength(3);
  });
});

describe("pricing (design Screen 2)", () => {
  it("lists Free first, then Pro at the display prices", async () => {
    const t = text(await page("pricing", off()));
    expect(t.indexOf("Free")).toBeLessThan(t.indexOf("Pro"));
    expect(t).toContain("$4.99 / month");
    expect(t).toContain("$39.99 / year");
    expect(t).toContain("New accounts get 14 days of Pro, no card.");
  });

  it.each([
    off(),
    off({ signupMode: "public" }),
    off({ signupMode: "closed" }),
    off({ signedIn: true }),
  ])("billing off: Not on sale yet, and no way to pay (%#)", async (ctx) => {
    const html = await page("pricing", ctx);
    const t = text(html);
    expect(t).toContain("Not on sale yet");
    expect(t).toContain("Subscriptions aren't on sale yet");
    // No ACTION toward paying: no link or button labelled for it. (Plan
    // descriptions like "unless you subscribe" are words, not actions.)
    expect(actions(html).join(" | ")).not.toMatch(
      /subscribe|buy|pay|checkout/i,
    );
    expect(html).not.toContain('href="/settings/billing"');
  });

  it("billing on: no 'Not on sale' wording; signed-in Pro action goes to Plan & Billing, not Checkout", async () => {
    const html = await page(
      "pricing",
      off({ signedIn: true, billingEnabled: true }),
    );
    expect(text(html)).not.toContain("Not on sale yet");
    expect(html).toContain('href="/settings/billing"');
    expect(html).not.toMatch(/checkout\.stripe/i);
  });

  it("billing on, signed out, invite: Pro action needs an invite code", async () => {
    const t = text(
      await page(
        "pricing",
        off({ signupMode: "invite", billingEnabled: true }),
      ),
    );
    expect(t).toContain("Join with an invite code");
  });
});

describe("marketing truth (P21-AC8)", () => {
  const MARKETING_FILES = [
    "src/lib/marketing/copy.ts",
    "src/lib/marketing/cta.ts",
    "src/lib/marketing/screenshots.ts",
    "src/app/(marketing)/welcome/page.tsx",
    "src/app/(marketing)/pricing/page.tsx",
    "src/app/(marketing)/changelog/page.tsx",
    "src/components/marketing/mode-cta.tsx",
    "src/components/marketing/marketing-frame.tsx",
    "src/components/marketing/availability.tsx",
    "src/components/marketing/screenshot-frame.tsx",
    "src/components/marketing/copy-code.tsx",
    "src/components/marketing/legal-document.tsx",
    "src/app/(marketing)/blizzy/page.tsx",
    "src/app/(marketing)/privacy/page.tsx",
    "src/app/(marketing)/terms/page.tsx",
    "src/lib/legal/privacy.ts",
    "src/lib/legal/terms.ts",
  ];

  it("uses none of the banned phrases", async () => {
    const { BANNED_PHRASES } = await import("@/lib/marketing/copy");
    for (const file of MARKETING_FILES) {
      let src = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
      // The banned list itself (and the module doc) are the only places the
      // phrases may appear.
      src = src.replace(/export const BANNED_PHRASES[\s\S]*?\] as const;/, "");
      src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const phrase of BANNED_PHRASES) {
        expect([file, phrase, src.toLowerCase().includes(phrase)]).toEqual([
          file,
          phrase,
          false,
        ]);
      }
    }
  });

  it("rendered pages carry no exclamation marks, invented numbers, or social proof", async () => {
    for (const which of ["welcome", "pricing"] as const) {
      const t = text(await page(which, off({ signupMode: "public" })));
      expect(t).not.toContain("!");
      expect(t).not.toMatch(
        /\b\d[\d,]*\+? (lifters|users|members|athletes)\b/i,
      );
      expect(t).not.toMatch(/★|\bstars?\b|testimonial|\brated\b|\breviews?\b/i);
      expect(t).not.toMatch(/limited time|only \d+ left|spots? left|hurry/i);
    }
  });

  it("Pro names only capabilities the code gates today (no plan import, coaching, or generation)", async () => {
    const { PRO_FEATURES, PLANS_SUMMARY } =
      await import("@/lib/marketing/copy");
    const all = [...PRO_FEATURES, PLANS_SUMMARY.pro].join(" ").toLowerCase();
    expect(all).not.toMatch(/import|coach|program|generate|\bai\b/);
  });

  it("Free keeps capture, history, and export, with no ads", async () => {
    const { FREE_FEATURES } = await import("@/lib/marketing/copy");
    const free = FREE_FEATURES.join(" ").toLowerCase();
    for (const word of ["logging", "history", "export", "no ads"]) {
      expect(free).toContain(word);
    }
  });
});

describe("screenshot manifest (RD-19)", () => {
  it("every captured source exists and every entry is synthetic", async () => {
    const { SHOTS } = await import("@/lib/marketing/screenshots");
    for (const shot of Object.values(SHOTS)) {
      expect(shot.alt.length).toBeGreaterThan(20);
      if (!shot.sources) {
        expect(shot.provenance).toBeNull();
        continue;
      }
      expect(shot.provenance?.synthetic).toBe(true);
      expect(shot.provenance?.fixtureVersion).toMatch(/^demo-v\d+$/);
      const images = [
        shot.sources.light.desktop,
        shot.sources.light.phone,
        shot.sources.dark?.desktop,
        shot.sources.dark?.phone,
      ].filter((i): i is NonNullable<typeof i> => Boolean(i));
      for (const img of images) {
        expect(img.src).toMatch(/^\/marketing\/screens\/[a-z0-9-]+\.png$/);
        expect(fs.existsSync(path.join(REPO_ROOT, "public", img.src))).toBe(
          true,
        );
      }
    }
  });
});
