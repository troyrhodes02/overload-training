# Pitch 15 — Smarter & Explainable Progression — Runbook

This runbook covers everything a human does outside the codebase to ship Smarter & Explainable Progression. The autonomous run did not merge to `main`. It did not read, write, or migrate `overload-prod`, and it changed no secret, environment variable, Vercel setting, or Supabase setting. Signup is as the OVE-50 runbook left it.

**What ships:**
- every progression call gains two lines — an **action** and its **evidence** — on the exercise card, Today's planned list (evidence only, tagged rows), Today's day-complete summary, and the exercise page:
  - Progress: `Try 190 lb next time (+5 lb)` / `8 reps on every set, 2 sessions running`
  - Hold (still untagged, muted): `Stay at 185 lb next time` / `Last time: 8, 7, 6 of 6–8`
  - Reactive Deload: `Lower the weight next time` / `A set below 8 reps, 2 sessions running` — no amount, because the engine defines none
  - Bodyweight Progress: `Next time, go past 12 reps or make it harder`
  - RIR named only when it changed the call; the deload week: `Deload week: 165 lb (90%)` / `Planned recovery, not a verdict. Calls resume next week.`
- while a workout is in progress, the card's `Try …` number no longer moves as today's sets are logged (spec R9)
- one What's New entry, "Clearer progression calls"

**What changes in the database:** nothing. No migration, column, table, trigger, or RLS change (`git diff main -- prisma/` is empty).

**What does not change:** every progression rule, threshold, and RIR qualifier; scheduled-deload suppression; gym baselines and their correction; the set write path (`logged-sets.ts` is still the only writer); the working-weight source and the card's weight offer; e1RM, goals, the tour.

**Merge behavior:** stop before merge (spec R1). Feature PR **#86** waits for your approval.

---

## 0. Order of operations

| # | Step | Reversible? |
| - | ---- | ----------- |
| 1 | Review #86; open the preview HTML; read the wording catalog (spec §11.2) | — |
| 2 | Pre-merge: set the release note's date (§2) | — |
| 3 | Pre-merge: real-shaped-data check (§3) | — |
| 4 | Squash-merge #86 → Vercel deploys production (§4) | yes (instant rollback) |
| 5 | Post-deploy checks (§5) | — |

There is no migration and no production data step. Nothing needs a backup first, because nothing is written.

---

## 1. Before you review

- Feature PR: https://github.com/troyrhodes02/overload-training/pull/86. Ticket PRs #87–#89 are squash-merged into it.
- Visual contract: open `docs/previews/15-smarter-explainable-progression-preview.html` in a browser (works offline).
- Every sentence, in one table: spec §11.2 (and design doc §4.4). The decisions most worth your eye (report §6): no number on a reactive Deload (R7), the bodyweight wording (R8), the card's as-of-before-today weight (R9), and leaving OVE-61 out (R10).
- Known limit inherited from the working-weight source (OVE-61): if your latest logged set was an **extra** (back-off) set, `Stay at {w}` and `Try {w+5}` use that set's weight. This was already true of `Try …` before this pitch.

## 2. Pre-merge: set the release note's date (required)

`src/lib/release-notes/entries.ts` has the new top entry dated **provisionally** `2026-10-21`, the day it was written. An entry is dated the day it reaches production (What's New spec §8). On the day you merge:

1. On the feature branch, edit the top entry:
   - `date: "YYYY-MM-DD"` → the merge day (your local date)
   - `id: "YYYY-MM-DD-clearer-progression-calls"` → the same date prefix (CI requires the id to start with its date)
   - delete the four-line "PROVISIONAL date" comment
2. Commit (`OVE-68 date the progression release note`), push, and wait for CI.

If you merge on 2026-10-21, only the comment removal is needed. **Never change the date or id after it reaches production.**

The Pitch 13 and Pitch 14 entries are published; leave their dates and ids alone. Their stale PROVISIONAL comments may be deleted (comment-only, changes nothing for anyone).

## 3. Pre-merge: verify with real-shaped data

This pitch writes nothing, but it changes what every lifter is told, so check it against real-shaped history before production. The run did this on the **local** stack (production build, temporary accounts, `e2e/accounts/explainable-progression.spec.ts`). Never point a preview at `overload-prod`.

Locally (needs `npx supabase start`; the configs refuse anything but 127.0.0.1):

```powershell
npm run test:e2e:accounts
```

Or by hand on the local stack (`npm run build; npm start` with `.env.local`), with your own imported plan:

- [ ] Today, before starting: a lift tagged Progress or Deload has one muted evidence line under it; untagged lifts look as before; machines still say `once gym is set`.
- [ ] Start the workout. A Progress lift's card reads `Try … lb today (+5 lb)` with its evidence; the weight box still offers your working weight (not the suggestion).
- [ ] Log a set at the suggested weight: the card's `Try …` line does **not** change.
- [ ] A lift that held: `Stay at … lb today` and `Last time: …` in muted text, no tag, no colour.
- [ ] Finish. Day complete: each lift says what to do **next time**, and the same two lines appear on its exercise page (`trend ›`).
- [ ] History → edit a past set below the top of its range → the exercise page changes to a hold with the corrected reps.
- [ ] A machine/cable lift's evidence ends with ` at <your gym>`; switching the gym selector on its exercise page gives that gym's own call.
- [ ] In a scheduled deload week, no card says Progress, Deload, `Lower`, or `Try … (+5 lb)`; only `Deload week: … (90%)`.
- [ ] Read the wording at 375 px in light and dark: nothing truncated, nothing coloured on a hold.

## 4. Merge and deploy

1. Confirm §2 is done (the release note is dated the merge day).
2. Mark #86 ready (it's a draft), then squash-merge it into `main`. Vercel deploys production.
3. Once production is verified (§5), move OVE-66 through OVE-68 to **Done** in Linear.

## 5. Post-deploy checks (production, your own account)

- [ ] On your next full page load, the **What's new** dialog shows **Clearer progression calls** once. Tap **Got it** and reload: it doesn't come back. Settings → What's New lists it with the date you set.
- [ ] Your existing lifts show the same tags as before the deploy (the calls are unchanged; only the words are new).
- [ ] A lift you know is ready to go up reads `Try … next time (+5 lb)` on its exercise page, and its evidence matches your last two sessions.
- [ ] **Behavior notes**, which are intended changes, not regressions:
  - Ordinary holds now show two muted lines on the card, the day-complete summary, and the exercise page. They still have no tag.
  - The exercise page no longer says `Holding` or `Suggested next:`; the action line replaces both.
  - The day-complete summary no longer shows the short RIR phrase (`at your limit — holding`, `reps to spare`); the full RIR sentence appears as the evidence instead.
  - The card's `Try …` number stays put during the workout (before, logging a set could move it up by 5).

## 6. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → the previous production deployment → **Instant Rollback**. Nothing was written or migrated, so the database needs nothing. |
| A sentence is wrong or misleading | Fix it in `src/lib/progression/recommendation.ts` (the only place sentences live) and its catalog test. Nothing is stored, so every surface follows on the next read. |
| A recommendation contradicts its tag in production | It can't by construction (evidence comes from the branch that decided the call; a mismatch returns no lines in production and throws in tests). If you see one, roll back and file it with the exercise's history. |
| The release note's wording is wrong after it shipped | Correct `title` and `body` in place (never the date or id), or set `significant: false`. |

## 7. Regression testing (what to run, and where)

All of these run locally; none touches production.

```powershell
npx prettier --check . ; npm run lint ; npx tsc --noEmit
npm test                        # unit
npm run test:integration        # embedded throwaway Postgres
npm run test:e2e:accounts       # production build against the LOCAL Supabase stack
npx playwright test             # default e2e
npm run verify:client-bundle    # after a build
```

Key suites for this pitch:
- `tests/unit/progression-evidence.test.ts` — the evidence each engine branch returns
- `tests/unit/progression-recommendation.test.ts` — the wording catalog and the 2,000-history correspondence sweep (words ↔ call; RIR only when it mattered; no weight for bodyweight; no amount on a deload; forbidden phrases)
- `tests/integration/progression-recommendation.int.test.ts` — every surface, gym scope, deload week, mid-workout stability, history correction, and a byte-identical snapshot proving reads write nothing
- `e2e/accounts/explainable-progression.spec.ts`; `faster-logging.spec.ts` (exactly 18 taps / 18 keystrokes, unchanged)
- Guards in `tests/unit/invariant-guards.test.ts` ("recommendations come from the engine, in one voice") and `deliberate-absences.test.ts` (no exercise personalization; the progression vocabulary is the only approved use of "recommend")

## 8. Publishing the release note

The release note is published by the production deploy in §4. Nothing else publishes it: no email, no push. Accounts that existed before the entry's date see the dialog once on their next full page load. Accounts created after it start caught up. After publication the entry is permanent, so only its wording may be corrected (What's New content contract, method note).
