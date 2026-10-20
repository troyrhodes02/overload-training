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
 *   - id: permanent kebab-case slug, unique, YYYY-MM-DD-short-name, <= 64
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
export const RELEASE_NOTES: readonly ReleaseNoteEntry[] = [];
