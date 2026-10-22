import type { ReleaseNoteEntry } from "./types";

/**
 * THE RELEASE NOTES (What's New spec §8; R5–R8). Every entry lives here and
 * nowhere else: the What's New dialog, the What's New page, and any future
 * public changelog read this list through catalog.ts.
 *
 * Adding an entry is a data change (the `overload-onboarding` skill describes
 * it): put a new object at the TOP of the list, dated the day the change
 * reaches production. Nothing else changes. CI validates the list
 * (tests/unit/release-notes-catalog.test.ts):
 *
 *   - id: permanent kebab-case slug, unique, <= 64, starting with its own
 *     date: YYYY-MM-DD-short-name
 *   - date: YYYY-MM-DD shipping date; the list is newest first, so each date
 *     is <= the one above it (same date: the upper entry is newer)
 *   - title: 1-80 characters, one line
 *   - body: 1-400 characters, one to three plain sentences, no HTML or links
 *   - significant: true only if it should open the dialog
 *
 * Never delete, re-order, or re-date a published entry, and never change its
 * id: every account's seen point refers to it. Correct wording mistakes in
 * place only.
 *
 * What's New launches with no entries (R8): nothing is backdated to fill it.
 */
export const RELEASE_NOTES: readonly ReleaseNoteEntry[] = [
  {
    // Smarter & Explainable Progression (Pitch 15). PROVISIONAL date: written
    // 2026-10-21 while the feature PR waits for approval. Before merging, set
    // `date` and the id's date prefix to the merge day (runbook 15 §2); once it
    // reaches production it is published and never re-dated.
    id: "2026-10-21-clearer-progression-calls",
    date: "2026-10-21",
    title: "Clearer progression calls",
    body: "Every progression call now says what to do and why. Ready to go up shows the weight to try and the sets that earned it, a hold says what to stay at and what's left to earn the next step, and a deload shows the sets that fell short. Overload never changes your plan or your weights.",
    significant: true,
  },
  {
    // RIR Logging & Autoregulation (Pitch 14). PROVISIONAL date: written
    // 2026-10-21 while the feature PR waits for approval. Before merging, set
    // `date` and the id's date prefix to the merge day (runbook 14 §3); once it
    // reaches production it is published and never re-dated.
    id: "2026-10-21-reps-in-reserve",
    date: "2026-10-21",
    title: "Reps in reserve",
    body: "You can now record how many reps you had left on a set, from 0 to 4+, right under the reps. It's optional and adds no taps when you skip it. If you reach the top of your range at 0, Overload holds the weight; if every set had 2 or more to spare, a flat trend no longer holds you back.",
    significant: true,
  },
  {
    // Faster Logging UX (Pitch 13). PROVISIONAL date: written 2026-10-20 while
    // the feature PR waits for approval. Before merging, set `date` and the
    // id's date prefix to the merge day (runbook 13 §2); once it reaches
    // production it is published and never re-dated.
    id: "2026-10-20-faster-workout-logging",
    date: "2026-10-20",
    title: "Faster workout logging",
    body: "Logging a set now takes fewer taps. Each exercise shows what you did last time, your weight carries over from set to set, and the next set is ready for its reps as soon as you log one. Tap a logged set to fix a typo.",
    significant: true,
  },
];
