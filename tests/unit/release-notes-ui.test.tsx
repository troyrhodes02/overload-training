import { renderToStaticMarkup } from "react-dom/server";
import { ReleaseNote } from "@/components/release-notes/release-note";
import { WhatsNewSection } from "@/components/settings/whats-new-section";

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

it("the Settings section links to the page and shows no count or dot", () => {
  const html = renderToStaticMarkup(<WhatsNewSection />);
  expect(html).toContain("What&#x27;s New</h2>");
  expect(html).toContain("Every update to Overload, newest first.");
  expect(html).toContain('href="/settings/whats-new"');
  expect(html).toContain("See what&#x27;s new");
  // Visible text only: no unread count anywhere in the section.
  const text = html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'");
  expect(text).not.toMatch(/\d/);
});
