import type { ReleaseNoteEntry } from "@/lib/release-notes/types";

/**
 * A fixture catalog for What's New tests (spec §14.2). The repository's own
 * RELEASE_NOTES is empty at launch (R8), so tests pass this list explicitly
 * (the catalog parameter) or mock the entries module with it. Dated in the
 * future so every test account's creation floor is before every entry.
 * Newest first, like the real file.
 */
export const RELEASE_NOTES_FIXTURE: readonly ReleaseNoteEntry[] = [
  {
    id: "2099-03-01-exercise-history",
    date: "2099-03-01",
    title: "Exercise history",
    body: "Every lift now has its own page with recent sessions, trends, and personal bests.",
    significant: true,
  },
  {
    id: "2099-02-15-smoother-charts",
    date: "2099-02-15",
    title: "Smoother charts",
    body: "Charts on Goals load faster and keep their shape while they update.",
    significant: false,
  },
  {
    id: "2099-02-01-faster-logging",
    date: "2099-02-01",
    title: "Logging is faster",
    body: "Your last weight is filled in, and you can repeat it across sets with one tap.",
    significant: true,
  },
];

/** The fixture with a newer significant entry added on top (data only). */
export const WITH_NEWER: readonly ReleaseNoteEntry[] = [
  {
    id: "2099-04-01-reps-in-reserve",
    date: "2099-04-01",
    title: "Reps in reserve",
    body: "You can now note how many reps you had left on a set.",
    significant: true,
  },
  ...RELEASE_NOTES_FIXTURE,
];
