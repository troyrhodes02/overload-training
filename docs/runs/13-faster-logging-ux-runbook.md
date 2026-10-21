# Pitch 13 — Faster Logging UX — Runbook

Everything outside the codebase that a human does to ship Faster Logging UX. The autonomous run never merged to `main`, never touched `overload-prod`, and changed no secret, environment variable, or setting.

**What ships:** the exercise logging card refined (one active set row, the weight carried from set to set, reps always typed, a "Last time" line, focus that follows the lifter, 44/48px targets, logged rows that open the existing correction dialog, `Next: {exercise}`), the machine/cable working weight scoped to the workout's gym, and the first What's New entry ("Faster workout logging").

**What does not change:** no migration, no table, column, trigger, or RLS change; no server action, route, or write module; no environment variable, Vercel setting, Supabase Auth setting, or email; signup stays as the OVE-50 runbook left it; the onboarding tour is unchanged. Writes still go only through `logSetAction` / `editLoggedSetAction`.

**Merge behavior:** stop before merge (spec R3). Feature PR #76 waits for your approval.

---

## 1. Before you review

- Feature PR: https://github.com/troyrhodes02/overload-training/pull/76 (ticket PRs #77–#80 squash-merged into it).
- Visual contract: open `docs/previews/13-faster-logging-ux-preview.html` in a browser (offline). The implementation follows it; two phone-width sizing refinements are recorded as spec R26.
- Measured result (run report §4): the representative workout takes **18 taps instead of 29** (keystrokes 18 vs 28); the card shows **8 controls instead of 12**.

## 2. Pre-merge: set the release note's date (required)

The entry in `src/lib/release-notes/entries.ts` is dated **provisionally** `2026-10-20` (the day it was written). An entry is dated the day it reaches production (What's New spec §8; method note). On the day you merge:

1. On the feature branch, edit the top entry:
   - `date: "YYYY-MM-DD"` → the merge day (your local date).
   - `id: "YYYY-MM-DD-faster-workout-logging"` → the same date prefix (CI requires the id to start with its date).
   - Delete the four-line "PROVISIONAL date" comment above it.
2. Commit (`OVE-60 date the Faster Logging release note`), push, wait for CI.
3. Merge #76.

If you merge on 2026-10-20, only step 1's comment removal is needed. Never change the date or id **after** it has reached production: each account's seen point refers to the id.

Why it matters: an entry dated earlier than an account's creation date is never shown to that account (the account floor, What's New R12), and the history page shows the date.

## 3. Pre-merge: verify with real-shaped data

CLAUDE.md requires anything touching what reaches `LoggedSet` to be verified with real-shaped data before production. The run verified on the **local** Supabase stack (production build, temporary accounts, representative workout seeded through `e2e/accounts/support/representative-workout.ts`). If your Vercel preview for #76 is connected to the Supabase **dev** project, repeat this there; never point a preview at `overload-prod`.

On the preview (or `npm run test:e2e:accounts` locally):

- [ ] Start today's workout at your usual gym. The first card says `Last time · <date> · <sets>`; set 1's weight box holds last time's working weight with `last time` under it; the reps box is empty.
- [ ] Type reps → **Log set**. Set 1 turns into `185 lbs × 8 ✓`; the cursor is in set 2's reps; set 2's weight says `same as set 1`.
- [ ] Change set 2's weight (tap it — the number is selected — type a new one), log it; set 3 offers the new weight.
- [ ] Type reps but don't log; tap Next, Previous, and reload. History (`/history` → the day) shows nothing new.
- [ ] A machine or cable exercise at a gym where you've never done it says `First time on this at <gym>.` and offers no weight.
- [ ] A bodyweight exercise has only a reps box; History shows `18 reps`, never `0 lbs`.
- [ ] Tap a logged set → **Edit set N — …** with the stored values → change reps → Save → `Set updated`; History shows the correction.
- [ ] History → a past day → **edit** still works as before.
- [ ] After the last set of an exercise, **Next: …** is focused; the last exercise shows **Finish workout**.

## 4. Real-device check (human only)

Touch emulation in desktop Chrome does not reproduce a phone's keyboard. On an **iPhone (Safari)** and, if available, an **Android phone (Chrome)**:

- [ ] Weight opens the decimal pad, reps the number pad.
- [ ] After **Log set**, does the keyboard stay up with the cursor in the next set's reps? The design keeps it up (the button doesn't take focus, then focus moves between inputs). If iOS drops it, each later set costs one extra tap (the after-count becomes at most 27 of 29); note it in the PR — it is not a data problem.
- [ ] On Android, the keyboard's action key on reps logs the set; on weight it moves to reps.
- [ ] One-handed: every control on the card is reachable and nothing needs a precision tap; no sideways scrolling at your phone's width.

## 5. Merge and deploy

1. Mark #76 ready (it is a draft), merge (squash) into `main`. Vercel deploys production.
2. No migration to apply. Nothing to configure.
3. Move OVE-57…OVE-60 to **Done** in Linear once production is verified.

## 6. Post-deploy checks (production, your own account)

- [ ] On your next full page load, the **What's new** dialog shows **Faster workout logging** once. **Got it**, reload: it doesn't return. Settings → What's New lists it with the date you set.
- [ ] A friend's account (or a second account of yours) sees it once too; an account created after the deploy does not (it starts caught up).
- [ ] Log one real set and check it in History.
- [ ] Behavior note: a machine/cable exercise at a gym with no baseline and no history there now shows no suggested number (state only), where it used to borrow another gym's weight. That is the intended fix (spec R9–R10), not a regression.

## 7. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. No data migration to undo. Sets logged on the new card are ordinary `LoggedSet` rows and stay valid. |
| Rolled back after lifters saw the entry | Their `release_seen` row names an id the old build doesn't know; What's New treats an unknown id safely (spec R31). Redeploying later shows nothing again to those who saw it. |
| The entry's wording is wrong after it shipped | Correct `title`/`body` in place (never the date or id), or set `significant: false`. |
| A lifter reports a wrong logged number | Correct it from the card (tap the set) or History; corrections use the same path as before. |

## 8. Local cleanup (optional)

The run measured the "before" tap count from a git worktree of `fe34d00` at `C:\Users\wtrho\overload-baseline-fe34d00` (removed at the end of the run if still present: `git worktree remove --force ../overload-baseline-fe34d00`). To re-measure:

```bash
git worktree add --detach ../overload-baseline-fe34d00 fe34d00
cd ../overload-baseline-fe34d00 && npm ci
cp ../overload-training/e2e/accounts/support/representative-workout.ts e2e/accounts/support/
cp ../overload-training/e2e/accounts/tap-count-baseline.spec.ts e2e/accounts/
OVERLOAD_TAP_BASELINE=1 npx playwright test --config playwright.accounts.config.ts e2e/accounts/tap-count-baseline.spec.ts
```

(Local Supabase stack only; the configs refuse anything but 127.0.0.1. A junctioned `node_modules` does not work — Turbopack rejects it.)
