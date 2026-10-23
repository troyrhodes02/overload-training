# Pitch 17 — Admin Center & Feedback — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The autonomous pipeline built and verified everything on the **local** Supabase stack and an embedded test database only. It never read or changed production. It never set a production secret or environment variable. It never merged to `main`.

**What it ships:**
- An owner-only, web-only admin area at `/admin`: Overview, Accounts, Feedback, Audit log.
- Suspend and reactivate, enforced on the account's next request.
- A **Send feedback** form for every lifter (⋮ menu and phone menu).
- An append-only audit log of every admin change.
- A date-only "last seen" for each account.

**Not shipped:** admin account deletion. It is halted pending an upstream amendment (spec R7, Linear OVE-79), and the admin area has no delete control.

**What changes in the database:** one additive migration, `prisma/migrations/9g_admin_center_feedback`.
- `profiles` gains `status` (`active`/`suspended`, NOT NULL, default `active`) and `last_active_on` (DATE, nullable). Every existing account becomes `active` with no last-seen date. No other row is written.
- New owned table `feedback`: RLS on, no policies, an immutable-owner trigger, and a CHECK requiring a trimmed message of 1–2000 characters.
- New admin-only table `admin_audit_entries`: RLS on, no policies, no foreign keys. A `BEFORE UPDATE OR DELETE` trigger makes it append-only, and its function is revoked from PUBLIC, anon, and authenticated.
- No table or column is dropped or renamed, and logged history is not touched.

**New environment variable:** `OVERLOAD_ADMIN_USER_IDS` (server-only, **never** `NEXT_PUBLIC_`). Unset means nobody is an admin.

**The one ordering rule:** apply the migration **before** the code deploys. Every signed-in request now reads `profiles.status` and may write `last_active_on`. New code against an old database fails on every signed-in page. The reverse order is safe, because old code ignores the new columns and tables.

No secrets appear in this file. **Warning:** the repository's `.env` has held production values, so every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Reversible? |
| - | ---- | ----------- |
| 1 | Prerequisites: production is on Pitch 16, and only `9g` is pending | — |
| 2 | Back up production, note counts | — |
| 3 | Apply `9g_admin_center_feedback` | yes (§9), but don't |
| 4 | Verify the migration (read-only SQL) | — |
| 5 | Find your auth user id; set `OVERLOAD_ADMIN_USER_IDS` in Vercel → **Production** only | yes |
| 6 | Re-date the release note to the merge day | — |
| 7 | Review and squash-merge feature PR **#94** → Vercel deploys | yes (instant rollback) |
| 8 | Manual verification in production | — |

Do §3–§7 back to back. Don't merge #94 before §3–§4 pass.

---

## 1. Prerequisites

- [ ] `main` includes Exercise History & PR Intelligence (#90), and it is live.
- [ ] Production has every migration up to and including `9f_logged_set_rir`, and only `9g_admin_center_feedback` is pending:

```powershell
# From the repo root, with feat/17-admin-center-feedback checked out (do not merge yet).
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"  # Supabase → Connect → Direct
$env:DIRECT_URL   = $env:PROD_DIRECT_URL
$env:DATABASE_URL = $env:PROD_DIRECT_URL   # Prisma CLI only; nothing runs the app here
npx prisma migrate status
```

Expected: only `9g_admin_center_feedback` is listed as not applied. **If anything else is listed, stop.**

---

## 2. Back up production

```powershell
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public-pre-admin-center.dump
docker cp supabase_db_overload:/tmp/prod-public-pre-admin-center.dump "$HOME\overload-backups\prod-public-pre-admin-center-$(Get-Date -Format yyyyMMdd-HHmm).dump"
Get-Content docs/runs/17-sql/verify-admin-center.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

Keep the dump outside the repository. Before the migration, queries 1–5 return nothing or error on the missing objects, which is expected. **Note the query 6 counts** (`logged_sets`, `logged_sessions`, `mesocycles`, `goals`).

---

## 3. Apply the migration

```powershell
npx prisma migrate deploy
```

Expected: "Applying migration `9g_admin_center_feedback`", then success. It adds two columns with a default and creates two empty tables, which takes well under a second.

---

## 4. Verify the migration

```powershell
Get-Content docs/runs/17-sql/verify-admin-center.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

- [ ] Query 1: `last_active_on|YES|date|` and `status|NO|AccountStatus|'active'::"AccountStatus"`
- [ ] Query 2: `admin_audit_entries|true|0` and `feedback|true|0` (RLS on, zero policies)
- [ ] Query 3: `admin_audit_entries_append_only` and `feedback_user_id_immutable`
- [ ] Query 4: `anon|false` and `authenticated|false`
- [ ] Query 5: `profiles|N|active=N|suspended=0|seen=0`, `feedback|0`, `admin_audit_entries|0`
- [ ] Query 6: identical to the counts you noted in §2

Then clear the shell variables:

```powershell
Remove-Item Env:PROD_DIRECT_URL, Env:DIRECT_URL, Env:DATABASE_URL
```

The run rehearsed this file on the local stack after applying 9g there. Queries 1–4 returned exactly the lines above. The local audit table holds rows left by e2e runs, because it is append-only by design.

---

## 5. Authorize yourself as the admin (human-only)

1. Find **your** auth user id: Supabase dashboard → Authentication → Users → your row → User UID. Copy the UUID. Don't infer it, and don't use anyone else's.
2. Vercel → Project → Settings → Environment Variables → add `OVERLOAD_ADMIN_USER_IDS` = that UUID.
   - **Environment: Production only.** Don't add it to Preview or Development, so previews have no admin.
   - It is server-only. Never create a `NEXT_PUBLIC_` variant.
   - Format: UUIDs separated by commas or whitespace. Anything that isn't a UUID is ignored. Unset or empty means nobody is an admin.
3. An env change takes effect on the next deployment. The merge in §7 is that deployment. To change the list later, edit the variable and redeploy.

To remove someone's admin access: delete their id from the variable and redeploy. They are not-found on their next request after the deploy.

---

## 6. Re-date the release note (before merging)

`src/lib/release-notes/entries.ts` has a **provisional** top entry, `2026-10-22-send-feedback` ("Send feedback from Overload", significant). If you merge on a later day, change both the `date` and the id's date prefix to the merge day. The id must start with its own date (catalog test). Commit it on the feature branch and let CI pass. Once it reaches production it is published: never re-date it, re-id it, or delete it.

---

## 7. Merge and deploy

- [ ] Review feature PR **#94**. Ticket PRs #95–#99 are squashed into it, and the review findings are addressed (see the run report).
- [ ] Squash-merge #94 into `main`. Vercel deploys production.
- [ ] Move OVE-74…OVE-78 to Done. Leave **OVE-79** (admin deletion) blocked.

---

## 8. Manual verification (production)

Do these with **your own account** unless a step says otherwise.

**Admin access and privacy**
- [ ] ⋮ menu shows **Settings · Send feedback · Admin · Sign out**. **Admin** opens `/admin`.
- [ ] Overview: six tiles and six cohort months. "Registered accounts" equals query 5's profile count. Right after deploy, "Active, last 7 days" counts only accounts that have visited since the deploy, because last-seen starts empty.
- [ ] Accounts: every account is listed with name, @username, email, status, joined date, last seen, and tour. Search finds yours by name, username, and email. There is **no plan column**, and no account page shows anything about training.
- [ ] Your own account page reads "Admin accounts can't be suspended here." with no button.
- [ ] Optional, with a second account you control (not a friend's): signed in as it, `/admin` and `/admin/accounts` show "We couldn't find that page.", and its ⋮ menu has no Admin item. The browser's network tab shows status **404**.

**Feedback and audit** (these audit rows are permanent: the log is append-only)
- [ ] ⋮ → **Send feedback** → choose Bug, write "Production check", Send → "Sent. Thanks for telling us."
- [ ] Admin → Feedback shows it under **Open**. Open it, then **Mark handled** → "Marked handled."
- [ ] Admin → Audit log shows "\<your name\> marked feedback handled · \<your name\>" (you are both the admin and the sender).

**Suspension.** Optional and consequential: the target can't use Overload until reactivated.
- [ ] Only with a second account you control: suspend it. In a session already signed in as that account, the next click lands on "Your account is suspended". Reactivate it, and the next click works again. The audit log shows both lines.
- [ ] Never test suspension on a friend's account.

**What's New**
- [ ] On your next full page load, the dialog lists "Send feedback from Overload" once. **Got it** dismisses it, and it doesn't return.

**Data integrity**
- [ ] Re-run `verify-admin-center.sql`. Query 6 counts are unchanged, apart from any workout you logged meanwhile.

---

## 9. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. Leave the migration in place: the previous code ignores the new columns and tables. |
| #94 was merged before the migration (signed-in pages error) | Apply §3 immediately (safe while the new code is live). Or roll back, apply §3, then redeploy. |
| Nobody can reach `/admin` | Check `OVERLOAD_ADMIN_USER_IDS` in Vercel → **Production**: it must hold your exact auth UUID. Redeploy after changing it. |
| An account was suspended by mistake | Admin → that account → **Reactivate account…**. This is audited. If the admin area is unavailable, a human can run, naming the account explicitly: `UPDATE profiles SET status = 'active' WHERE user_id = '<that account id>';` (not audited, so note it in your own records). |
| Feedback spam from one account | Feedback is capped at 10 per account per rolling 24 hours. Suspension is the stronger lever. Don't delete feedback rows by hand: account deletion removes an account's feedback with the rest of its data. |
| An audit row is wrong | It can't be edited or deleted, by design. Record a correcting action instead (for example, reactivate). |
| You really need the schema gone | Only after rolling back to code that doesn't know about it: drop `admin_audit_entries` and `feedback`, drop the two `profiles` columns and the three enums and `overload_reject_change()`, then remove the `9g` row from `_prisma_migrations`. This discards feedback and the audit log, never training data. Not expected to be needed. |
| Restore from the §2 backup | Not needed for this migration, because it writes no training data. |

---

## 10. Human-only actions (the run did none of these)

- Applying `9g` to production (§3), with a backup first (§2).
- Setting `OVERLOAD_ADMIN_USER_IDS` in Vercel Production (§5), using your own verified auth UUID.
- Re-dating the release note to the merge day (§6) and merging #94 (§7).
- Any production suspension or reactivation, and any production feedback handling.
- The upstream amendment that would unblock admin deletion (spec R7, OVE-79). Until it exists, no one builds it.
- Signup is unchanged. `OVERLOAD_SIGNUP_OPEN` stays as the OVE-50 runbook left it.

---

## 11. What was verified (local stack + embedded test DB only)

See the run report (`docs/runs/17-admin-center-feedback-report.md`) for the exact commands and counts:

- unit and integration suites, including the RLS, isolation, admin gate, privacy sentinel, suspension, audit, and metrics tests
- the production build and the client-bundle secret check
- e2e on the local stack: admin boundary 404s, direct action replay, suspend → next request refused, feedback end to end, Send feedback, tour, What's New
- this file's SQL, rehearsed on the local stack
