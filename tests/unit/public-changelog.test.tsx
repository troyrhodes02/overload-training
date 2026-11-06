/**
 * Public Landing Page & Changelog — L2 (OVE-97; spec RD-11, RD-22; P21-AC2).
 * The public changelog and the in-app What's New page render the SAME
 * entries from the ONE catalog, the changelog reads nothing about the
 * visitor, and every published entry is safe to show to the public.
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
    id: "2026-12-01-exercise-history",
    date: "2026-12-01",
    title: "Exercise history",
    body: "Every lift now has its own page.",
    significant: true,
  },
  {
    id: "2026-11-21-smoother-charts",
    date: "2026-11-21",
    title: "Smoother charts",
    body: "Charts on Goals load faster.",
    significant: false,
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

describe("one source (P21-AC2)", () => {
  it("renders exactly the What's New entries, in the same order, with the same dates", async () => {
    const pub = articles(await render("changelog", FIXTURE));
    const app = articles(await render("whats-new", FIXTURE));
    expect(pub).toHaveLength(2);
    expect(pub).toEqual(app);
    expect(pub[0]).toContain('dateTime="2026-12-01"');
    expect(pub[0]).toContain("Exercise history");
    expect(pub[1]).toContain("Smoother charts");
  });

  it("matches What's New for the real repository catalog too", async () => {
    const pub = articles(await render("changelog"));
    const app = articles(await render("whats-new"));
    expect(pub.length).toBe(RELEASE_NOTES.length);
    expect(pub).toEqual(app);
  });

  it("lists significant and ordinary entries alike, each with a permanent anchor", async () => {
    const html = await render("changelog", FIXTURE);
    expect(html).toContain('id="2026-12-01-exercise-history"');
    expect(html).toContain('id="2026-11-21-smoother-charts"');
    expect(html).not.toMatch(/significant/i);
  });

  it("shows the What's New empty-state sentence when there are no entries", async () => {
    const html = await render("changelog", []);
    expect(html).toContain(
      "No updates yet. When something changes in Overload, it&#x27;s listed here.",
    );
    expect(html).not.toContain("<ol");
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
  it("has the Changelog · Privacy · Terms line", () => {
    const src = read("src/app/(app)/settings/page.tsx");
    for (const href of ["/changelog", "/privacy", "/terms"]) {
      expect(src).toContain(`href="${href}"`);
    }
  });
});
