import {
  formatReleaseDate,
  isReleaseDate,
  orderedReleaseNotes,
  ReleaseNotesError,
  toReleaseNoteView,
  validateReleaseNotes,
  type ReleaseNoteEntry,
} from "@/lib/release-notes/catalog";
import { RELEASE_NOTES } from "@/lib/release-notes/entries";

/**
 * What's New — the release-note content contract (spec §8, §12; R5–R7, R25).
 * The first test is the CI gate for every future entry: the repository's own
 * RELEASE_NOTES must satisfy the contract, or the build fails.
 */

const entry = (over: Partial<ReleaseNoteEntry> = {}): ReleaseNoteEntry => ({
  id: "2026-11-03-faster-logging",
  date: "2026-11-03",
  title: "Logging is faster",
  body: "Your last weight is filled in, and you can repeat it across sets with one tap.",
  significant: true,
  ...over,
});

function problems(entries: ReleaseNoteEntry[]): string[] {
  try {
    validateReleaseNotes(entries);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(ReleaseNotesError);
    return [...(error as ReleaseNotesError).problems];
  }
}

it("the repository's RELEASE_NOTES satisfies the content contract", () => {
  expect(() => validateReleaseNotes(RELEASE_NOTES)).not.toThrow();
  expect(orderedReleaseNotes()).toBe(orderedReleaseNotes());
  expect(orderedReleaseNotes()).toEqual(RELEASE_NOTES);
});

it("a valid newest-first list passes unchanged, file order kept on a shared date", () => {
  const list = [
    entry({ id: "2026-12-01-history", date: "2026-12-01" }),
    entry({ id: "2026-11-03-b", date: "2026-11-03", significant: false }),
    entry({ id: "2026-11-03-a", date: "2026-11-03" }),
  ];
  expect(orderedReleaseNotes(list)).toBe(list);
  expect(orderedReleaseNotes(list).map((e) => e.id)).toEqual([
    "2026-12-01-history",
    "2026-11-03-b",
    "2026-11-03-a",
  ]);
});

it.each([
  ["Upper-Case"],
  ["has space"],
  ["trailing-"],
  ["-leading"],
  ["double--dash"],
  [`a${"-b".repeat(40)}`],
  [""],
])("rejects the id %p", (id) => {
  expect(problems([entry({ id })]).join()).toContain("kebab-case slug");
});

it("rejects a duplicate id", () => {
  expect(problems([entry(), entry()]).join()).toContain("more than once");
});

it.each([
  "2026-13-01",
  "2026-02-30",
  "2025-02-29",
  "26-11-03",
  "2026-1-3",
  "",
  "2026-11-03T00:00",
])("rejects the date %p", (date) => {
  expect(problems([entry({ date })]).join()).toContain("real date");
});

it("accepts a leap day, and only a real one", () => {
  expect(isReleaseDate("2028-02-29")).toBe(true);
  expect(isReleaseDate("2000-02-29")).toBe(true);
  expect(isReleaseDate("2100-02-29")).toBe(false);
});

it("rejects a list that is not newest first", () => {
  const list = [
    entry({ id: "older", date: "2026-11-03" }),
    entry({ id: "newer", date: "2026-12-01" }),
  ];
  expect(problems(list).join()).toContain("newest first");
});

it.each([
  [{ title: "" }, "title"],
  [{ title: "   " }, "title"],
  [{ title: "x".repeat(81) }, "title"],
  [{ title: "Two\nlines" }, "title"],
  [{ body: "" }, "body"],
  [{ body: "x".repeat(401) }, "body"],
  [{ body: "Now <b>bold</b>." }, "plain text"],
  [{ body: "See [the page](https://example.com)." }, "plain text"],
  [{ significant: "yes" as unknown as boolean }, "significant"],
])("rejects %p", (over, message) => {
  expect(problems([entry(over)]).join()).toContain(message);
});

it("names every problem at once", () => {
  // id format, id date prefix, title, body
  expect(problems([entry({ id: "Bad", title: "", body: "<x>" })])).toHaveLength(
    4,
  );
});

it("requires the id to start with the entry's own date", () => {
  expect(problems([entry({ id: "routine-swap" })]).join()).toContain(
    "must start with its date (2026-11-03-short-name)",
  );
  expect(
    problems([entry({ id: "2026-11-04-faster-logging" })]).join(),
  ).toContain("must start with its date");
  expect(problems([entry()])).toEqual([]);
});

it("reports a missing or non-object entry instead of crashing", () => {
  const list = [
    entry(),
    null as unknown as ReleaseNoteEntry,
    "x" as unknown as ReleaseNoteEntry,
  ];
  expect(problems(list)).toEqual([
    "entry 1: must be an entry object",
    "entry 2: must be an entry object",
  ]);
});

it("formats dates with no Date, locale, or timezone involved", () => {
  expect(formatReleaseDate("2026-11-03")).toBe("Nov 3, 2026");
  expect(formatReleaseDate("2027-01-01")).toBe("Jan 1, 2027");
  expect(formatReleaseDate("2026-12-31")).toBe("Dec 31, 2026");
  expect(formatReleaseDate("2026-05-09")).toBe("May 9, 2026");
  const tz = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati";
  try {
    expect(formatReleaseDate("2026-12-31")).toBe("Dec 31, 2026");
  } finally {
    process.env.TZ = tz;
  }
});

it("the public view carries exactly id, date, title, and body", () => {
  expect(Object.keys(toReleaseNoteView(entry())).sort()).toEqual([
    "body",
    "date",
    "id",
    "title",
  ]);
});
