# Pitch 9 — Accounts: Signup, Login & Password Reset — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The
autonomous pipeline built, tested, and rehearsed everything below on the
**local** Supabase stack only; it never read or changed production, never set
a production secret, and never opened signup.

**What it does:** puts invite-only signup, password recovery by email,
Settings (name, timezone), and account deletion into production — in an
order that keeps signup **closed** until every safety condition has been
proven in production.

**What changes in the database:** nothing structural. This pitch has **no
migration**. It uses the `profiles` table Multi-User Foundation created.

No secrets appear in this file. Values come from the Supabase, Resend, and
Vercel dashboards. **Warning:** the repository's `.env` has held production
values; every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Signup state | Reversible? |
| - | ---- | ------------ | ----------- |
| 1 | Prerequisite gate: Multi-User Foundation verified in production | closed | — |
| 2 | Email: Resend domain + Supabase custom SMTP + reset template | closed | yes |
| 3 | Supabase Auth settings check | closed | yes |
| 4 | Vercel: add `SUPABASE_SERVICE_ROLE_KEY` (server, Production) | closed | yes |
| 5 | Review + merge feature PR #56 → deploy | **closed** (no invite code) | yes (instant rollback) |
| 6 | Verify your own account is unchanged | closed | — |
| 7 | Verify recovery email reaches a non-team address | closed | — |
| 8 | Verify account deletion with a throwaway account | closed | **no** (by design, only the throwaway) |
| 9 | Open signup: set `OVERLOAD_INVITE_CODE`, redeploy | **open (invite-only)** | yes (unset + redeploy) |

Do not skip ahead. In particular, **never set `OVERLOAD_INVITE_CODE` before
§1, §7, and §8 have passed** (pitch §11, `.claude/CLAUDE.md`).

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
recorded, stop here. Nothing below is safe to do without it except §2–§3,
which change no data.

---

## 2. Transactional email (Resend → Supabase custom SMTP)

Supabase's built-in sender only reaches your own team and is capped at two
emails an hour, so password reset needs custom SMTP (Architecture; spec R15).

### 2.1 Sending domain in Resend

1. Create a Resend account (or use yours) → **Domains → Add domain**. Use a
   domain you control, ideally a subdomain such as `mail.<your-domain>`.
2. Add the DNS records Resend shows at your DNS host: the **SPF** (TXT/MX on
   the `send` subdomain) and **DKIM** (TXT `resend._domainkey`) records.
   Add a **DMARC** record if you have none (`_dmarc` TXT, e.g.
   `v=DMARC1; p=none;` to start).
3. Wait until Resend shows the domain **Verified**.
4. **API Keys → Create API key**, permission **Sending access**, restricted
   to that domain. Copy it once; it is the SMTP password. Don't store it in
   the repo or in Vercel — only in Supabase (next step).

### 2.2 Supabase custom SMTP (`overload-prod`)

Authentication → **Emails → SMTP Settings → Enable custom SMTP**:

| Field | Value |
| ----- | ----- |
| Sender email | `no-reply@<verified domain>` |
| Sender name | `Overload` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the Resend API key |

Then Authentication → **Rate Limits**: the email limit becomes adjustable
once custom SMTP is on. A small group needs little; `30` per hour is a
sensible ceiling.

### 2.3 Reset email template

Authentication → **Emails → Templates → Reset Password**:

- **Subject:** `Reset your Overload password`
- **Body:** paste the contents of `supabase/templates/recovery.html` (from the
  feature branch). Its only link is
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.

The app verifies that `token_hash` on its own server route (`/auth/confirm`),
which works even when the email is opened on another device. **Do not use the
default template** — its link returns tokens in the URL fragment, which the
app can't read, and the reset would fail.

### 2.4 URL configuration

Authentication → **URL Configuration**:

- **Site URL:** your production origin, e.g. `https://<your-app-domain>` (no
  trailing slash). The reset link is built from it.
- **Redirect URLs:** add `https://<your-app-domain>/**`.

---

## 3. Supabase Auth settings check (`overload-prod`)

| Setting | Where | Must be |
| ------- | ----- | ------- |
| Allow new users to sign up | Authentication → Sign In / Providers | **OFF — always.** Overload creates invite-gated accounts on the server with the admin API (spec R3); turning this on would let anyone with the public anon key create an account without an invite. |
| Email provider | Sign In / Providers → Email | enabled (login uses it) |
| Confirm email | Email provider | irrelevant (accounts are created confirmed) — leave as is |
| Minimum password length | Email provider / Password settings | **6** (the app's helper text says "At least 6 characters"; if you change it, change `PASSWORD_MIN_LENGTH` in `src/lib/accounts/validation.ts` to match) |
| Email OTP expiration | Email provider | **3600** seconds (the email says the link expires in 1 hour) |
| Secure password change | Email provider | off (reset uses the recovery session) |

---

## 4. Vercel environment (Production)

| Variable | Value | Scope |
| -------- | ----- | ----- |
| `SUPABASE_SERVICE_ROLE_KEY` | `overload-prod` → Project Settings → API Keys → the **secret** (service-role) key | **Production** only, **not** exposed to the browser (no `NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_SITE_URL` | your production origin (if not already set) | Production |
| `OVERLOAD_INVITE_CODE` | **leave unset for now** (§9) | — |

Why the service-role key is now needed at runtime (spec R4 — please review):
it is read only by `src/lib/supabase/admin.ts` (server-only), which can do
exactly two things — create a confirmed user after the invite code is
checked, and delete a user's auth identity during account deletion. Guard
tests pin that file and its two importers, and the build's
`verify:client-bundle` check fails if the key appears in browser code.

---

## 5. Deploy

- [ ] Review feature PR **#56** (all ticket PRs #57–#61 integrated, checks green). Note R4 (service role) and the guard changes listed in the run report.
- [ ] Commit the owner's `.claude/CLAUDE.md` (still uncommitted on `main`) and decide on the stale root `CLAUDE.md` (see the run report's upstream amendments).
- [ ] Merge #56 → Vercel deploys production.
- [ ] Confirm the deploy is the merge commit and finished without errors.

With no `OVERLOAD_INVITE_CODE`, `/signup` shows **"Signup isn't open"** and the
signup action refuses before calling anything.

---

## 6. Your own account is unchanged

On your normal device:

- [ ] Sign in works with your existing password; Today shows today's state as before.
- [ ] Plan, History, Goals, Gyms unchanged.
- [ ] Account menu (⋮) now has **Settings**. Your first and last name are empty (your profile predates names) — fill them in and Save. Timezone shows the zone Multi-User Foundation set; it must be the zone your days follow.
- [ ] `/signup` shows "Signup isn't open".
- [ ] Sign out → sign in again works.

---

## 7. Password recovery reaches a non-team address (pitch AC-3)

The address must **not** be on your Supabase team (that is the whole point of
custom SMTP).

1. Supabase → Authentication → Users → **Add user** → an address you can read
   that is not on the team (e.g. a personal Gmail), a temporary password,
   auto-confirm. (An admin action — it does not enable signup.)
2. In a private window: `/login` → **Forgot password?** → that address →
   **Send reset link**. Expect "Check your email".
3. Also request a reset for an address with **no** account. The page must
   read the same (apart from the address) and take about as long.
4. The email arrives at the non-team address — **in the inbox, not spam**
   (if spam, fix DMARC/DKIM before inviting anyone). From `Overload
   <no-reply@…>`, subject "Reset your Overload password", one button.
5. Open the link (try it on your phone) → "Set a new password" → set one →
   Today shows "Password updated."
6. Open the same link again → "That reset link has expired or was already
   used."
7. Sign out, sign in with the new password. Keep this account for §8.

If the email never arrives: Resend → **Logs** shows whether Supabase handed
it over; Supabase → **Logs → Auth** shows SMTP errors. The app always shows
"Check your email" on purpose (it must not reveal who has an account), so
these logs are where delivery is diagnosed. Server logs record failures by
code only, never the address.

---

## 8. Account deletion with a throwaway account (pitch AC-4)

Deletion is irreversible by design. Prove it on the §7 throwaway account
only, with a fresh backup and your own account's counts taken first.

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

1. As the throwaway account, add one small thing (e.g. a gym) so there is
   data to delete.
2. Settings → **Delete account…** → the page lists what will be deleted
   (e.g. "Gyms 1"). Enter a **wrong** password → "That password isn't right."
   and nothing changes.
3. Enter the right password → **Delete account permanently** → you land on
   the login page with "Your account was deleted."
4. Check:

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
the service-role key is missing or wrong in Vercel). Fix §4, sign in as that
account again, and delete again — it finishes without touching anything else.

---

## 9. Open signup (invite-only)

Only after §1, §7, and §8 passed.

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
4. Send the code to friends privately. The roadmap recommends inviting
   friends after the Onboarding Tour (Pitch 11) ships; plan seeding for a
   friend is an operator task once their account exists.

**Rotate** a leaked or old code: change the variable, redeploy. Existing
accounts are unaffected (the code is only checked at signup).
**Close signup again:** delete the variable, redeploy.

---

## 10. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. There is no migration, so code rollback is safe. Keep "Allow new users to sign up" OFF. |
| Reset emails don't arrive | Resend Logs + Supabase Auth logs (§7). Check domain verification, SMTP password, sender address, Site URL, and that the template is the Overload one. |
| Reset link lands on "expired" every time | The template is the default one (fragment tokens) or Site URL is wrong (§2.3–§2.4). |
| A friend's deletion stopped at "closing your account didn't finish" | §8's last paragraph: fix the service-role key; the friend retries. |
| A profile without an identity shows up in `orphans.sql` | If it owns no rows, it is safe to remove: `DELETE FROM profiles WHERE user_id = '<id>' AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '<id>')`. If it owns rows, ask the person to sign in again (if their identity exists) and delete from Settings; do not hand-delete history. |
| Account deleted by mistake | Not undoable in the app (by design). The only recovery is the `pg_dump` taken in §8 / your regular backups: restore it into a throwaway local database and re-insert that account's rows by hand. Treat this as an incident. |
| Invite code leaked | Rotate (§9). Review Authentication → Users for unexpected accounts; a stranger's account can be deleted by them or removed by you from the dashboard plus `orphans.sql` cleanup. |
| Service-role key exposed | Supabase → API Keys → roll the secret key; update Vercel; redeploy. |

---

## 11. What the autonomous run verified (local stack only)

- Unit 40 suites / 627 tests; integration 33 / 406 (incl. the permanent
  isolation suite and `isolation/account-deletion.int.test.ts`: two fully
  populated accounts — deleting one leaves the other and the library
  byte-identical; an injected failure mid-transaction deletes nothing; a
  failed identity removal is finished by a retry).
- Default e2e 28 passed; **Accounts lifecycle e2e 7 passed** against the local
  Supabase stack with Mailpit (`npm run test:e2e:accounts`): wrong invite
  creates nothing; signup → empty Today; a second account sees none of the
  first's data; sign out/in; reset with identical copy for an unknown
  address, link once, old password fails, other device signed out; Settings;
  deletion with wrong then right password, the other account untouched.
- Build with the invite code and service key set: `verify:client-bundle` OK.
- Production: **not touched.** Everything in §1–§9 is yours to do.
