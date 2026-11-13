# Pitch 21b — Shared Package & Contracts: Owner Runbook

**What this slice changed outside the code:** nothing. No migration, no environment variable, no Vercel setting, no Supabase change, no Expo or Apple step. The web app now imports its pure rules from `packages/shared`, and the Vercel build compiles that package as part of the web build (`transpilePackages`), so the existing staging Root Directory (`apps/web`) needs no change.

## 1. Staging check (about 10 minutes)

After the 21b feature PR merges into `staging` and the staging deployment finishes, sign in on the stable staging URL with a test account that has a plan and some logged history (Pro and Free if you have both). Nothing should look or behave differently from before. Check:

1. **Today.** The greeting, today's planned exercises with their rep targets ("3 × 8–10", or "3 × 8" for a single target), and, on a Pro account, the progress / hold / deload calls and their one-line reasons.
2. **Log a set.** Open the workout, log a set. The weight offer reads as before (185, 182.5). Typing 0 reps shows "Enter reps above 0." on the reps field. A weight with three decimals (185.125) shows "Use at most two decimal places."
3. **Edit a past set** from History. The dialog saves, and the set's numbers print as before.
4. **History.** The week list and an earlier week; the days fall on the same dates as before.
5. **An exercise page** (Pro): records, trend, and session lines print the same loads.
6. **Goals.** A goal's target reads "315 lb × 1" style; its percentage is unchanged.
7. **What's New** (Settings → What's New) and **replay the tour** (Settings): same entries, same steps, same words.
8. **Light and dark** appearance: colors unchanged.

If anything differs, note the screen and what changed, and do not promote 21b. The feature PR can be reverted on `staging` with one revert commit; no data was touched.

## 2. Not verified by the run

- Behavior on an iPhone, the iOS simulator, Expo, or Hermes. No mobile code exists yet; 21d verifies that Metro bundles the package, that `Intl` time-zone formatting works on Hermes (audit D-19), and that `process.env.NODE_ENV` is inlined.
- A browser walk-through of the staging deployment (section 1 is that check).

## 3. Production

Nothing to do until 21b is promoted. Promotion follows `docs/pipeline/production-promotion-prompt.md`: the release PR carries the whole slice (there is no migration and no environment change), and the Production build compiles the shared package the same way staging does.
