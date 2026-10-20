/**
 * The What's New page (design doc Screen 4, preview §04–§05; spec §7, R19).
 * The populated case mocks the entries module with data only — the page code
 * is identical for both cases (adding an entry never touches it).
 */

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

async function renderPage(entries?: typeof FIXTURE) {
  if (entries) {
    jest.doMock("@/lib/release-notes/entries", () => ({
      RELEASE_NOTES: entries,
    }));
  }
  // Load React with the page, after resetModules, so both share one copy.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } = await import("@/app/(app)/settings/whats-new/page");
  return renderToStaticMarkup(<Page />);
}

it("launches with the empty state (no entries ship with the mechanism)", async () => {
  const html = await renderPage();
  expect(html).toContain("What&#x27;s New</h1>");
  expect(html).toContain('href="/settings"');
  expect(html).toContain(
    "No updates yet. When something changes in Overload, it&#x27;s listed here.",
  );
  expect(html).not.toContain("<ol");
});

it("lists every entry, significant and ordinary, newest first, the same way", async () => {
  const html = await renderPage(FIXTURE);
  expect(html).not.toContain("No updates yet");
  const history = html.indexOf("Exercise history");
  const charts = html.indexOf("Smoother charts");
  expect(history).toBeGreaterThan(-1);
  expect(charts).toBeGreaterThan(history);
  expect(html.match(/<h2 /g)).toHaveLength(2);
  expect(html).toContain(">Dec 1, 2026</time>");
  expect(html).toContain(">Nov 21, 2026</time>");
  // Significance never changes how an entry looks.
  expect(html).not.toMatch(/significant|badge/i);
});
