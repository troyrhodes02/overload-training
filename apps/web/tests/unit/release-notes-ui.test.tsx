import { renderToStaticMarkup } from "react-dom/server";
import { ReleaseNote } from "@/components/release-notes/release-note";

/**
 * What's New presentational pieces (design doc Screens 3–4, preview §03–§06;
 * spec §7). Rendered in Node: the entry block, the Settings section, and the
 * page's empty state with the shipped (empty) catalog.
 */

const entry = {
  id: "2026-11-03-faster-logging",
  date: "2026-11-03",
  title: "Logging is faster",
  body: "Your last weight is filled in, and you can repeat it across sets with one tap.",
};

it("ReleaseNote renders the date, title at the requested level, and body", () => {
  const h3 = renderToStaticMarkup(
    <ReleaseNote entry={entry} headingLevel={3} />,
  );
  expect(h3).toContain('<time dateTime="2026-11-03"');
  expect(h3).toContain(">Nov 3, 2026</time>");
  expect(h3).toContain(
    '<h3 class="text-base font-semibold">Logging is faster</h3>',
  );
  expect(h3).toContain(entry.body);
  const h2 = renderToStaticMarkup(
    <ReleaseNote entry={entry} headingLevel={2} />,
  );
  expect(h2).toContain("<h2 ");
  expect(h2).not.toContain("<h3");
});

it("ReleaseNote escapes content (plain text only)", () => {
  const html = renderToStaticMarkup(
    <ReleaseNote entry={{ ...entry, body: "a < b & c" }} headingLevel={2} />,
  );
  expect(html).toContain("a &lt; b &amp; c");
});

it("What's New is a navigation destination (OVE-119), with no count or dot", async () => {
  const { moreNavItems } = await import("@/components/shell/nav-items");
  const item = moreNavItems(false).find(
    (i) => i.href === "/settings/whats-new",
  );
  expect(item?.label).toBe("What's New");
});
