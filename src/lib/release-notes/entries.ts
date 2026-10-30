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
    // Public Accounts, Recovery & Support (Pitch 18; OVE-88, overload-onboarding).
    // Password recovery restores a capability lifters expect and will look for,
    // so it is significant (opens the dialog). PROVISIONAL date: written during
    // the pipeline run on 2026-10-29 while the feature PR is not yet merged.
    // Before merging, set `date` and the id's date prefix to the production-ship
    // day (the contract forbids backdating, so dating = ship day); once it reaches
    // production it is published and never re-dated.
    id: "2026-10-29-reset-password-by-email",
    date: "2026-10-29",
    title: "Reset your password by email",
    body: "Forgot your password? From the sign-in screen, choose Forgot password and we'll email you a link to set a new one. The link works once and expires after an hour.",
    significant: true,
  },
  {
    // Public Accounts, Recovery & Support (Pitch 18; OVE-88, overload-onboarding).
    // A quiet Settings addition that changes no existing behavior, so NOT
    // significant: it belongs in the What's New list, not the modal. Same
    // provisional dating as the entry above; re-date to the ship day at merge.
    id: "2026-10-29-export-your-data",
    date: "2026-10-29",
    title: "Export your data",
    body: "You can download everything in your account — plans, workouts, logged sets, goals, gyms, cardio, and profile — as one file, any time, from Settings. It's private to you and always free.",
    significant: false,
  },
  {
    // Public Accounts, Recovery & Support (Pitch 18; OVE-88, overload-onboarding).
    // A small addition to the signed-out screens, NOT significant: list only.
    // Same provisional dating as the entries above; re-date at merge.
    id: "2026-10-29-help-when-signed-out",
    date: "2026-10-29",
    title: "Get help when you're signed out",
    body: "Can't sign in? A Need help? link on the sign-in and signup screens now points you to a support address.",
    significant: false,
  },
  {
    // Projected e1RM overlay (OVE-80; overload-onboarding). An opt-in extra on
    // an existing chart that changes no existing behavior, so it is NOT
    // significant: it belongs in the What's New list, not the modal. Dated the
    // day it reaches production (the merge day); re-date if the merge slips.
    id: "2026-10-26-projected-rir-trend",
    date: "2026-10-26",
    title: "See a projected trend from your RIR",
    body: "On an exercise's e1RM trend, turn on Projected (RIR) to see a dotted line estimating what you might have had, based on the reps in reserve you logged. It's an estimate for the curious, not a fact and not a target — your real trend, records, and progression never use it.",
    significant: false,
  },
  {
    // Admin Center & Feedback (Pitch 17; overload-onboarding, OVE-78): the
    // lifter-facing change only — the owner-only admin area is never
    // announced. PROVISIONAL date: written 2026-10-22 while the feature PR
    // waits for human approval (stop before merge). Before merging, set `date`
    // and the id's date prefix to the merge day (runbook 17 §6); once it
    // reaches production it is published and never re-dated.
    id: "2026-10-22-send-feedback",
    date: "2026-10-22",
    title: "Send feedback from Overload",
    body: "Found something that needs fixing, or have an idea or a question? Choose Send feedback in the menu at the top to send it straight to the person who runs Overload. Replies aren't sent in the app.",
    significant: true,
  },
  {
    // Exercise History & PR Intelligence (Pitch 16). Dated the day it reaches
    // production: the run merges the feature PR on 2026-10-22 (runbook 16 §2
    // re-dates it if the merge slips to a later day before it ships).
    id: "2026-10-22-exercise-history",
    date: "2026-10-22",
    title: "Exercise history and records",
    body: "Open any exercise to see every session you've logged, your best set, heaviest weight, and rep records, and how the lift is trending. Each session shows the call it led to, and machines and cables keep their records per gym. Viewing it never changes your plan or your weights.",
    significant: true,
  },
  {
    // Smarter & Explainable Progression (Pitch 15). PROVISIONAL date: written
    // 2026-10-21 while the feature PR waits for approval. Before merging, set
    // `date` and the id's date prefix to the merge day (runbook 15 §2); once it
    // reaches production it is published and never re-dated.
    id: "2026-10-21-clearer-progression-calls",
    date: "2026-10-21",
    title: "Clearer progression calls",
    body: "Every progression call now says what to do and why. Ready to go up shows the weight to try and the sets that earned it, a hold says what to stay at and what's left to earn the next step, and a deload says where your sets fell short. Overload never changes your plan or your weights.",
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
