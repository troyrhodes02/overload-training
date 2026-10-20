# Pitch 9 — Accounts: Signup, Login & Password Reset — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The
autonomous pipeline built, tested, and rehearsed everything below on the
**local** Supabase stack only; it never read or changed production, never set
a production secret, and never opened signup.

**What it does:** puts invite-only signup, email + password login, Settings
(name, timezone), and account deletion into production — in an order that
keeps signup **closed** until every safety condition has been proven in
production.

**Password reset is not part of this release.** It was removed after the run
at the owner's direction (2026-10-19), because it needs a transactional email
provider and Overload sends no email. There is no "Forgot password?" link, no
`/forgot-password`, `/reset-password`, or `/auth/confirm` route, and nothing
to set up in Resend or Supabase SMTP. A lifter who forgets their password is
handled by the owner (§8).

**What changes in the database:** nothing structural. This pitch has **no
migration**. It uses the `profiles` table Multi-User Foundation created.

No secrets appear in this file. Values come from the Supabase and Vercel
dashboards. **Warning:** the repository's `.env` has held production values;
every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Signup state | Reversible? |
| - | ---- | ------------ | ----------- |
| 1 | Prerequisite gate: Multi-User Foundation verified in production | closed | — |
| 2 | Supabase Auth settings check | closed | yes |
| 3 | Vercel: add `SUPABASE_SERVICE_ROLE_KEY` (server, Production) | closed | yes |
| 4 | Review + merge feature PR #56 → deploy | **closed** (no invite code) | yes (instant rollback) |
| 5 | Verify your own account is unchanged | closed | — |
| 6 | Verify account deletion with a throwaway account | closed | **no** (by design, only the throwaway) |
| 7 | Open signup: set `OVERLOAD_INVITE_CODE`, redeploy | **open (invite-only)** | yes (unset + redeploy) |

Do not skip ahead. In particular, **never set `OVERLOAD_INVITE_CODE` before
§1 and §6 have passed** (pitch §11, `.claude/CLAUDE.md`).

§8 (a forgotten password) and §9 (rollback) are for later, as needed.

---

## 1. Prerequisite gate — Multi-User Foundation verified in production

Signup must stay disabled until account isolation has been verified in
production. That verification is the Multi-User Foundation runbook's §7
(`docs/runs/08-multi-user-foundation-runbook.md`): data preserved (counts +
fingerprints), your experience unchanged, isolation proven with a second
admin-created account, and the gate recorded.

- [ ] Multi-User Foundation runbook §7.1–§7.3 all passed in production.
- [ ] The date is recorded in `docs/runs/08-multi-user-foundation-report.md` (§9 asks for it).

**As of this run the repository records no such date.** `main` contains the
Multi-User Foundation code (`1efe0a3`) and a pre-ownership backup file exists
in the repo root, so the rollout may be in progress — but until §7.4 is
recorded, stop here. Nothing below is safe to do without it except §2, which
changes no data.

---

## 2. Supabase Auth settings check (`overload-prod`)

No email provider, SMTP, email template, or URL configuration is needed:
Overload sends no email. Accounts are created already confirmed, so no
confirmation email is ever sent either.

| Setting | Where | Must be |
| ------- | ----- | ------- |
| Allow new users to sign up | Authentication → Sign In / Providers | **OFF — always.** Overload creates invite-gated accounts on the server with the admin API (spec R3); turning this on would let anyone with the public anon key create an account without an invite. |
| Email provider | Sign In / Providers → Email | **enabled.** This is the email + password *login method*, not an email sender; turning it off disables login. |
| Confirm email | Email provider | irrelevant (accounts are created confirmed) — leave as is |
| Minimum password length | Email provider / Password settings | **6** (the app's helper text says "At least 6 characters"; if you change it, change `PASSWORD_MIN_LENGTH` in `src/lib/accounts/validation.ts` to match) |
| Secure password change | Email provider | **ON** (spec R27). The app has no password-change screen, but the auth API does; with this on, a stolen or unattended auth session can't change the password by calling Supabase directly. |

Leave Supabase's built-in email sender alone. Nothing in the app calls it.

---

## 3. Vercel environment (Production)

| Variable | Value | Scope |
| -------- | ----- | ----- |
| `SUPABASE_SERVICE_ROLE_KEY` | `overload-prod` → Project Settings → API Keys → the **secret** (service-role) key | **Production** only, **not** exposed to the browser (no `NEXT_PUBLIC_` prefix) |
| `OVERLOAD_INVITE_CODE` | **leave unset for now** (§7) | — |

Why the service-role key is now needed at runtime (spec R4 — please review):
it is read only by `src/lib/supabase/admin.ts` (server-only), which can do
exactly two things — create a confirmed user after the invite code is
checked, and delete a user's auth identity during account deletion. Guard
tests pin that file and its two importers, and the build's
`verify:client-bundle` check fails if the key appears in browser code.

---

## 4. Deploy

- [ ] Review feature PR **#56** (all ticket PRs #57–#61 integrated, checks green, then the password-reset removal on top). Note R4 (service role) and the guard changes listed in the run report.
- [ ] Commit the owner's `.claude/CLAUDE.md` (still uncommitted on `main`) and decide on the stale root `CLAUDE.md`. Both still describe password reset and an SMTP provider; see the run report's upstream amendments.
- [ ] Merge #56 → Vercel deploys production.
- [ ] Confirm the deploy is the merge commit and finished without errors.

With no `OVERLOAD_INVITE_CODE`, `/signup` shows **"Signup isn't open"** and the
signup action refuses before calling anything.

---

## 5. Your own account is unchanged

On your normal device:

- [ ] Sign in works with your existing password; Today shows today's state as before.
- [ ] Plan, History, Goals, Gyms unchanged.
- [ ] Account menu (⋮) now has **Settings**. Your first and last name are empty (your profile predates names) — fill them in and Save. Timezone shows the zone Multi-User Foundation set; it must be the zone your days follow.
- [ ] `/login` has no "Forgot password?" link, and `/forgot-password` no longer exists (signed out, it redirects to Login).
- [ ] `/signup` shows "Signup isn't open".
- [ ] Sign out → sign in again works.

---

## 6. Account deletion with a throwaway account (pitch AC-4)

Deletion is irreversible by design. Prove it on a throwaway account only,
with a fresh backup and your own account's counts taken first.

1. Supabase → Authentication → Users → **Add user** → any address (it gets
   no email), a password, **Auto Confirm User** on. This is an admin action;
   it does not enable signup. Note its User UID.
2. Back up and record your own account's counts:

```powershell
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/backup-$stamp.dump
docker cp supabase_db_overload:/tmp/backup-$stamp.dump ".\backup-pre-accounts-$stamp.dump"

docker cp docs/runs/09-sql/account-counts.sql supabase_db_overload:/tmp/account-counts.sql
docker cp docs/runs/09-sql/orphans.sql supabase_db_overload:/tmp/orphans.sql
# Your account id: Authentication → Users → your row → User UID
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -v uid=<your id> -At -F"|" -f /tmp/account-counts.sql > owner-before.txt
```

3. In a private window, sign in as the throwaway account and add one small
   thing (e.g. a gym) so there is data to delete.
4. Settings → **Delete account…** → the page lists what will be deleted
   (e.g. "Gyms 1"). Enter a **wrong** password → "That password isn't right."
   and nothing changes.
5. Enter the right password → **Delete account permanently** → you land on
   the login page with "Your account was deleted."
6. Check:

```powershell
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -v uid=<your id> -At -F"|" -f /tmp/account-counts.sql > owner-after.txt
Compare-Object (Get-Content owner-before.txt) (Get-Content owner-after.txt)   # expect: no output
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -v uid=<throwaway id> -At -F"|" -f /tmp/account-counts.sql   # expect: every count 0 (library count unchanged)
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -f /tmp/orphans.sql                                   # expect: no rows
```

- [ ] Authentication → Users: the throwaway user is gone; signing in as it fails.
- [ ] Your account still works and its counts are unchanged.

If the page says **"Your training data was deleted, but closing your account
didn't finish"**: the data is gone but the identity removal failed (usually
the service-role key is missing or wrong in Vercel). Fix §3, sign in as that
account again, and delete again — it finishes without touching anything else.

---

## 7. Open signup (invite-only)

Only after §1 and §6 passed.

1. Generate a long random code (≥ 12 characters; the app treats a shorter one
   as "closed"):
   ```powershell
   [Convert]::ToBase64String((1..18 | ForEach-Object { Get-Random -Maximum 256 }))
   ```
2. Vercel → Production env → `OVERLOAD_INVITE_CODE` = that code (server only,
   no `NEXT_PUBLIC_`). **Redeploy** (env changes need a new deployment).
3. Private window → `/signup`: the form now shows. Submit with a wrong code →
   "That invite code isn't valid." and no user appears in Authentication →
   Users.
4. Send the code to friends privately, and tell them there is **no
   self-service password reset**: if they forget their password, they ask
   you (§8). The roadmap recommends inviting friends after the Onboarding
   Tour (Pitch 11) ships; plan seeding for a friend is an operator task once
   their account exists.

**Rotate** a leaked or old code: change the variable, redeploy. Existing
accounts are unaffected (the code is only checked at signup).
**Close signup again:** delete the variable, redeploy.

---

## 8. A lifter forgot their password (operator task)

There is no in-app reset. You set a temporary password for them directly in
`overload-prod`. This writes production auth data, so it follows the operator
rules in `.claude/CLAUDE.md`: name the account by email, confirm the resolved
account before writing, change one row, and nothing else. It never touches
their training data. **Never** delete and re-create the account instead —
deleting an account destroys its history.

Rehearsed on the local stack (2026-10-19): after the update the old password
is refused (`invalid_credentials`) and the temporary one signs in.

1. Confirm the request really came from them (in person, or a channel you
   already trust). Anyone who can ask you for a reset can take over the
   account.
2. Supabase → **SQL Editor** (`overload-prod`). Resolve the account and check
   it is exactly one row and the right person:

   ```sql
   select id, email, created_at, last_sign_in_at
   from auth.users
   where email = '<their email>';
   ```

3. Set a temporary password on that id only (a long random one; it must be at
   least 6 characters):

   ```sql
   update auth.users
   set encrypted_password = extensions.crypt('<temporary password>', extensions.gen_salt('bf')),
       updated_at = now()
   where id = '<id from step 2>'
   returning id, email;
   ```

   Expect `UPDATE 1` and their id and email back.
4. Optional, if you think the account was compromised: sign out all of their
   devices (each one needs the new password to get back in; an
   already-issued access token keeps working for up to an hour):

   ```sql
   delete from auth.sessions where user_id = '<id from step 2>';
   ```

5. Send them the temporary password privately. Ask them to sign in to check
   it works.

**Known limitation:** Overload has no change-password screen, so they keep
the password you chose until one exists. Choose a long random one and send
it only through a private channel. A "Change password" form in Settings needs
no email provider; it would be a small follow-up pitch if you want lifters to
pick their own.

---

## 9. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. There is no migration, so code rollback is safe. Keep "Allow new users to sign up" OFF. |
| A lifter forgot their password | §8. |
| A friend's deletion stopped at "closing your account didn't finish" | §6's last paragraph: fix the service-role key; the friend retries. |
| A profile without an identity shows up in `orphans.sql` | If it owns no rows, it is safe to remove: `DELETE FROM profiles WHERE user_id = '<id>' AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '<id>')`. If it owns rows, ask the person to sign in again (if their identity exists) and delete from Settings; do not hand-delete history. |
| Account deleted by mistake | Not undoable in the app (by design). The only recovery is the `pg_dump` taken in §6 / your regular backups: restore it into a throwaway local database and re-insert that account's rows by hand. Treat this as an incident. |
| Invite code leaked | Rotate (§7). Review Authentication → Users for unexpected accounts; a stranger's account can be deleted by them or removed by you from the dashboard plus `orphans.sql` cleanup. |
| Service-role key exposed | Supabase → API Keys → roll the secret key; update Vercel; redeploy. |

---

## 10. What was verified (local stack only)

After the password-reset removal, on the feature branch:

- Format, lint, typecheck: pass.
- Unit 39 suites / 617 tests; integration 33 / 407 (incl. the permanent
  isolation suite and `isolation/account-deletion.int.test.ts`: two fully
  populated accounts — deleting one leaves the other and the library
  byte-identical; an injected failure mid-transaction deletes nothing; a
  failed identity removal is finished by a retry).
- Build: no `/forgot-password`, `/reset-password`, or `/auth/confirm` route.
  `verify:client-bundle` OK.
- Default e2e 26 passed, including a check that the old reset routes
  redirect to Login. **Accounts lifecycle e2e 6 passed** against the local
  Supabase stack (`npm run test:e2e:accounts`): wrong invite creates
  nothing; signup → empty Today; a second account sees none of the first's
  data; sign out/in with one message for a wrong password and an unknown
  email; Settings; deletion with wrong then right password, the other
  account untouched.
- §8's SQL rehearsed on a throwaway local user, then removed. The local
  database was unchanged afterwards (1 profile, 1 auth user, 463 sets).
- Production: **not touched.** Everything in §1–§8 is yours to do.
