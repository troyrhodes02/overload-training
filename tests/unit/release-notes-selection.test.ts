import {
  isNewer,
  unseenSignificant,
  type ReleaseNoteEntry,
} from "@/lib/release-notes/catalog";

/**
 * What's New — which entries open the dialog (spec §11; R11, R12). Pure:
 * the catalog, the account's seen point, and its creation floor in; the
 * unseen significant entries, newest first, out.
 */

const e = (id: string, date: string, significant = true): ReleaseNoteEntry => ({
  id,
  date,
  title: id,
  body: "Something changed.",
  significant,
});

// Newest first, like the real file.
const CATALOG = [
  e("s4", "2027-03-01"),
  e("o3", "2027-02-15", false),
  e("s2", "2027-02-01"),
  e("s1", "2027-01-10"),
];
const ids = (list: readonly ReleaseNoteEntry[]) => list.map((x) => x.id);
const FLOOR = "2026-10-20";
const at = (seenId: string | null, seenAt: Date | null = new Date()) => ({
  seenId,
  seenAt,
  floor: FLOOR,
});

it("no row: every significant entry from the floor on, newest first; ordinary never", () => {
  expect(ids(unseenSignificant(CATALOG, at(null, null)))).toEqual([
    "s4",
    "s2",
    "s1",
  ]);
});

it("seen at an entry: only the significant entries above it", () => {
  expect(ids(unseenSignificant(CATALOG, at("s2")))).toEqual(["s4"]);
  // Seen at an ordinary entry works the same way.
  expect(ids(unseenSignificant(CATALOG, at("o3")))).toEqual(["s4"]);
});

it("seen at the newest: nothing (shown once)", () => {
  expect(unseenSignificant(CATALOG, at("s4"))).toEqual([]);
});

it("several unseen significant entries come back together, ordinary ones excluded (AC-4)", () => {
  expect(ids(unseenSignificant(CATALOG, at("s1")))).toEqual(["s4", "s2"]);
});

it("an unknown seen id falls back on the UTC date it was last shown something", () => {
  expect(
    ids(
      unseenSignificant(
        CATALOG,
        at("removed-entry", new Date("2027-02-01T23:30:00Z")),
      ),
    ),
  ).toEqual(["s4"]);
});

it("the floor hides entries dated before the account existed, even with no row (AC-3)", () => {
  expect(
    ids(
      unseenSignificant(CATALOG, {
        seenId: null,
        seenAt: null,
        floor: "2027-02-01",
      }),
    ),
  ).toEqual(["s4", "s2"]);
  expect(
    unseenSignificant(CATALOG, {
      seenId: null,
      seenAt: null,
      floor: "2027-03-02",
    }),
  ).toEqual([]);
});

it("an empty catalog has nothing unseen", () => {
  expect(unseenSignificant([], at(null, null))).toEqual([]);
});

it("isNewer compares catalog positions; unknown ids are never newer", () => {
  expect(isNewer(CATALOG, "s4", "s1")).toBe(true);
  expect(isNewer(CATALOG, "s1", "s4")).toBe(false);
  expect(isNewer(CATALOG, "s2", "s2")).toBe(false);
  expect(isNewer(CATALOG, "nope", "s1")).toBe(false);
  expect(isNewer(CATALOG, "s4", "nope")).toBe(false);
});
