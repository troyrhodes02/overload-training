/**
 * Public Landing Page & Changelog — L2 (OVE-97; spec RD-11 as amended, RD-22;
 * P21-AC2). One catalog, two surfaces: the public changelog renders only the
 * entries whose audience is "public", while the in-app What's New page renders
 * the whole catalog (internal development milestones included). A public entry
 * appears in both, from the same source. Before any public entry exists the
 * changelog shows a pre-launch state. The changelog reads nothing about the
 * visitor, and every entry is safe to show to the public.
 */
import fs from "node:fs";
import path from "node:path";
import { RELEASE_NOTES } from "@/lib/release-notes/entries";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
const importsOf = (src: string) =>
  [...src.matchAll(/(?:import|from)\s+["']([^"']+)["']/g)].map((m) => m[1]);

const CHANGELOG = "src/app/(marketing)/changelog/page.tsx";

const FIXTURE = [
  {
    id: "2026-12-01-launch",
    date: "2026-12-01",
    title: "Overload is live",
    body: "Plan, log, and get the call on every lift.",
    significant: true,
    audience: "public" as const,
  },
  {
    id: "2026-11-21-smoother-charts",
    date: "2026-11-21",
    title: "Smoother charts",
    body: "Charts on Goals load faster.",
    significant: false,
    audience: "internal" as const,
  },
];

afterEach(() => {
  jest.resetModules();
  jest.dontMock("@/lib/release-notes/entries");
});

async function render(
  which: "changelog" | "whats-new",
  entries?: readonly (typeof FIXTURE)[number][],
) {
  if (entries) {
    jest.doMock("@/lib/release-notes/entries", () => ({
      RELEASE_NOTES: entries,
    }));
  }
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } =
    which === "changelog"
      ? await import("@/app/(marketing)/changelog/page")
      : await import("@/app/(app)/settings/whats-new/page");
  return renderToStaticMarkup(<Page />);
}

/** The list of rendered entries, as (id-free) article markup. */
function articles(html: string): string[] {
  return [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map((m) => m[0]);
}

describe("one source, two surfaces (P21-AC2)", () => {
  it("the changelog shows only public entries; What's New shows the whole catalog", async () => {
    const pub = articles(await render("changelog", FIXTURE));
    const app = articles(await render("whats-new", FIXTURE));
    // Changelog: just the public launch entry. What's New: both.
    expect(pub).toHaveLength(1);
    expect(app).toHaveLength(2);
    expect(pub[0]).toContain('dateTime="2026-12-01"');
    expect(pub[0]).toContain("Overload is live");
    expect(pub.join()).not.toContain("Smoother charts");
    expect(app.join()).toContain("Smoother charts");
  });

  it("a public entry is identical on both surfaces (written once)", async () => {
    const pub = articles(await render("changelog", FIXTURE));
    const app = articles(await render("whats-new", FIXTURE));
    const launchOnApp = app.find((a) => a.includes("Overload is live"));
    expect(pub[0]).toEqual(launchOnApp);
  });

  it("every public entry carries its permanent anchor and reveals no metadata", async () => {
    const html = await render("changelog", FIXTURE);
    expect(html).toContain('id="2026-12-01-launch"');
    expect(html).not.toContain('id="2026-11-21-smoother-charts"');
    expect(html).not.toMatch(/significant|audience/i);
  });

  it("shows the pre-launch state when the catalog has no public entries", async () => {
    // The real repository catalog is still all-internal before launch, so the
    // live changelog renders the pre-launch card and no list.
    const html = await render("changelog");
    expect(RELEASE_NOTES.every((e) => e.audience === "internal")).toBe(true);
    expect(html).toContain("Overload is almost here.");
    expect(html).not.toContain("<ol");
    // What's New still lists the full development history for signed-in lifters.
    expect(articles(await render("whats-new")).length).toBe(
      RELEASE_NOTES.length,
    );
  });
});

describe("reads nothing about the visitor", () => {
  it("imports only the public-safe release-note modules and pure site metadata", () => {
    expect(importsOf(read(CHANGELOG)).sort()).toEqual(
      [
        "@/components/release-notes/release-note",
        "@/lib/marketing/site",
        "@/lib/release-notes/catalog",
      ].sort(),
    );
    expect(read(CHANGELOG)).not.toMatch(
      /cookies\(|headers\(|requireAccount|getAuthUser|releaseSeen/,
    );
  });

  it("the site metadata module is pure too", () => {
    const src = read("src/lib/marketing/site.ts");
    for (const spec of importsOf(src)) {
      expect(spec).not.toMatch(
        /server-only|@\/lib\/(db|data|auth|supabase)|@prisma/,
      );
    }
  });
});

describe("every published entry is public-safe (RD-11)", () => {
  const FORBIDDEN: [string, RegExp][] = [
    ["an email address", /[\w.+-]+@[\w-]+\.[\w.]+/],
    ["a URL", /https?:\/\/|www\./i],
    ["the admin area", /\badmin\b|allowlist/i],
    [
      "infrastructure",
      /\bwebhook|\bRLS\b|row-level|migration|supabase|prisma|vercel/i,
    ],
    ["a ticket id", /\bOVE-\d+/],
    ["test-mode billing", /stripe test|test mode|sandbox/i],
  ];

  it.each(RELEASE_NOTES.map((e) => [e.id, e] as const))(
    "%s contains nothing internal",
    (_id, entry) => {
      for (const [what, re] of FORBIDDEN) {
        expect([what, re.test(`${entry.title} ${entry.body}`)]).toEqual([
          what,
          false,
        ]);
      }
    },
  );
});

describe("Settings links to the public pages (RD-22)", () => {
  it("has the Changelog link (legal pages deferred until there's a need)", () => {
    const src = read("src/app/(app)/settings/page.tsx");
    expect(src).toContain(`href="/changelog"`);
    // Privacy/Terms were removed with the rest of the legal surface.
    expect(src).not.toContain(`href="/privacy"`);
    expect(src).not.toContain(`href="/terms"`);
  });
});
