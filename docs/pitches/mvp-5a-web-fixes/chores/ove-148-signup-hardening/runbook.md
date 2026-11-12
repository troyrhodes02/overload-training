# Runbook: signup hardening and one trial per person (OVE-147–151)

Everything in this chore works in Production with **no database change and no new environment variable**. The steps below are optional and owner-run.

## What shipped without any owner action

- **Disposable email domains** are refused at signup. The list is `src/lib/accounts/disposable-domains.ts`; edit it and release to change it.
- **Reserved usernames** are refused at signup. The base list is `RESERVED_USERNAMES` in `src/lib/accounts/validation.ts`; signup-only additions are in `src/lib/accounts/signup-guards.ts`.
- **Global hourly signup cap.** The default is **30 successful signups per rolling hour**.
  - **Change it:** set `OVERLOAD_SIGNUP_HOURLY_CAP` to a positive whole number. It's server-only, and no redeploy of code is needed beyond Vercel's env-change redeploy.
  - **When it trips:** visitors see "Signups are temporarily paused. Please try again soon." and the server logs `signup: hourly signup cap reached (cap N); paused`.
  - **Watch it:** the admin overview shows signups in the last hour and the last 24 hours.
- **Sessions added to an active block** count only from the day they were added, so they no longer create past missed days.

## Optional: turn on one trial per person

One trial per person is **off** until both steps below are done, in this order. Until then the app never reads or writes the new table.

### 1. Apply migration `9o_trial_claims` to Production (human step)

It creates one new, un-owned table, `trial_claims`, with RLS enabled. It is purely additive: no existing table or column changes.

1. Take a **fresh backup** of `overload-prod` (Supabase dashboard → Database → Backups, or `pg_dump`), and note its time.
2. From a shell with the Production `DIRECT_URL` exported for this one command (never in a file), apply pending migrations with the same command used for earlier production migrations:
   ```bash
   npx prisma migrate deploy
   ```
3. Confirm:
   ```sql
   SELECT relrowsecurity FROM pg_class WHERE relname = 'trial_claims';  -- t
   SELECT count(*) FROM trial_claims;                                   -- 0
   ```

**Roll back if needed:** the app does not use the table while the flag is off, so dropping it (`DROP TABLE "trial_claims";` plus deleting the `9o_trial_claims` row from `_prisma_migrations`) is safe until step 2 is done.

### 2. Set `TRIAL_DEDUPE_ENABLED=true` in Vercel Production

**From then on:**
- The first account for a person (email lowercased, `+suffix` removed, dots removed for Gmail and Googlemail) gets the 14-day Pro trial.
- A later account for the same person is created normally on Free, with nothing shown to them.

**What it never does:**
- No backfill: existing accounts keep their trials, and dedupe starts from the day it is enabled.
- The table holds only a SHA-256 of the normalized key, never the address.
- A claim outlives account deletion on purpose, so deleting and re-creating an account does not restart the trial.

**If the flag is set before the migration:** signup fails open. Every account gets its trial and an error is logged, so nothing breaks.

## Not changed by this chore

- **Signup mode.** Making signup open to everyone is a separate owner step: set `OVERLOAD_SIGNUP_MODE=public` in Vercel Production. The `closed` mode still works as an emergency stop.
