# Pitch 12 — What's New — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The
autonomous pipeline built and verified everything on the **local** Supabase
stack and an embedded test database only. It never read or changed
production, never set a production secret, and never merged to `main`.

**What it ships:**
- Repository-managed release notes in `src/lib/release-notes/entries.ts`.
- A **What's New** dialog that shows significant release notes an account
  hasn't seen. It shows them once, all together, newest first.
- A permanent **What's New** history page at `/settings/whats-new`, reached
  from Settings → What's New → **See what's new**.

**No release-note entry ships with it** (spec R8). The page launches with its
empty state, and nobody sees a dialog at rollout. The first entry is written
by the Faster Logging UX (Pitch 13) guidance ticket, unless you add one
yourself (§8).

**What changes in the database:** one additive migration,
`prisma/migrations/9e_release_seen`. It creates a new, empty owned table
`release_seen` with:
- one row per account: the newest release note shown, and when
- RLS enabled with no policies
- an immutable-owner trigger
- a CHECK on the entry-id format

**No row is written**, no existing table or column changes, and logged history
isn't touched.

**Rollout behavior (spec R9, R10, R12):**

| Account | What happens |
| ------- | ------------ |
| Any account that exists when 9e is applied (yours, and any friend's) | No `release_seen` row, so it has been shown nothing. With no entries at launch, nothing is unseen and no dialog appears. When a later pitch adds a **significant** entry, it's shown to this account once on its next full page load. |
| An account created through signup after the deploy | While the catalog is empty, it gets no row. Once entries exist, its row starts at the newest entry, so it never sees a backlog. Entries that ship after it signed up are shown normally. |
| Any account, whatever its row says | An entry dated before the account was created is never shown in the dialog (the account floor). |
| A new account whose tour opens by itself | The tour owns that load. What's New waits for a later load (normally there's nothing to show). |

**What does not change:**
- no environment variable, Vercel setting, Supabase Auth setting, or secret
- no email, push, or analytics of any kind
- signup stays exactly as the OVE-50 runbook left it (`OVERLOAD_SIGNUP_OPEN`)
- the onboarding tour is unchanged

**The one ordering rule:** apply the migration **before** the code deploys.
Every signed-in page now reads `release_seen` (the layout asks whether
anything significant is unseen), and signup can write to it. Code that knows
about the table, running against a database without it, fails on every
signed-in page. The reverse order is safe: old code ignores the extra table.

No secrets appear in this file. **Warning:** the repository's `.env` has held
production values, so every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Reversible? |
| - | ---- | ----------- |
| 1 | Prerequisites: production is on the Pitch 11 release and its migrations | — |
| 2 | Back up production | — |
| 3 | Apply `9e_release_seen` to production | yes (§7), but don't |
| 4 | Verify the migration (read-only SQL) | — |
| 5 | Review and squash-merge feature PR **#72** → Vercel deploys | yes (instant rollback) |
| 6 | Manual verification in production | — |

Don't merge #72 before §3–§4 pass. Do §3–§5 back to back.

---

## 1. Prerequisites

- [ ] `main` includes the Onboarding Tour (#68), and it's live in production.
- [ ] Production has every migration up to and including `9d_tour_progress`,
      and **only** `9e_release_seen` pending:

```powershell
# From the repo root, with feat/12-whats-new checked out (do not merge yet).
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"  # Supabase → Connect → Direct
$env:DIRECT_URL   = $env:PROD_DIRECT_URL
$env:DATABASE_URL = $env:PROD_DIRECT_URL   # Prisma CLI only; nothing runs the app here
npx prisma migrate status
```

Expected: "Following migration have not yet been applied: 9e_release_seen"
and nothing else. **If any other migration is listed, stop** and finish the
earlier runbooks first (Pitch 11's `9d_tour_progress`).

---

## 2. Back up production

```powershell
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public-pre-whats-new.dump
docker cp supabase_db_overload:/tmp/prod-public-pre-whats-new.dump "$HOME\overload-backups\prod-public-pre-whats-new-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

Keep the dump outside the repository. Before migrating, note the counts from
query 4 of `docs/runs/12-sql/verify-release-seen.sql`:

```powershell
Get-Content docs/runs/12-sql/verify-release-seen.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

Before the migration, queries 1–3 return nothing or error on the missing
table. That's expected.

---

## 3. Apply the migration

```powershell
npx prisma migrate deploy
```

Expected: "Applying migration `9e_release_seen`", then "All migrations have
been successfully applied." It creates one empty table and takes well under a
second.

---

## 4. Verify the migration

```powershell
Get-Content docs/runs/12-sql/verify-release-seen.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

- [ ] Query 1: `user_id|NO|uuid`, `last_seen_release_id|NO|text`,
      `last_seen_at|NO|timestamptz`, `created_at|NO|timestamptz`,
      `updated_at|NO|timestamptz`
- [ ] Query 2: `t`, `0`, `release_seen_user_id_immutable`, and the constraints
      `release_seen_last_seen_release_id_check`, `release_seen_pkey`,
      `release_seen_user_id_fkey`
- [ ] Query 3: `0`, and an empty breakdown
- [ ] Query 4: identical to the counts you noted in §2

Then clear the shell variables:

```powershell
Remove-Item Env:PROD_DIRECT_URL, Env:DIRECT_URL, Env:DATABASE_URL
```

(The run rehearsed this file on the local stack after applying 9e there. It
returned exactly the lines above, with query 3 = 0.)

---

## 5. Merge and deploy

- [ ] Review feature PR **#72**. Ticket PRs #73–#75 are squashed into it, and
      the run's review findings are addressed (see the run report).
- [ ] Optional, before merging: add an introductory entry (§8). Without one,
      the page launches empty.
- [ ] Squash-merge #72 into `main`. Vercel deploys production.
- [ ] Move OVE-54…OVE-56 to Done.

---

## 6. Manual verification (production)

Your own account:

- [ ] Sign in and reload a few pages. **No What's New dialog** appears
      (nothing is unseen), and the tour doesn't open.
- [ ] Settings shows a **What's New** section between Tour and Delete account,
      with **See what's new**. There's no count and no dot.
- [ ] **See what's new** opens `/settings/whats-new`: "What's New", "Every
      update to Overload, newest first.", and the empty state (or your
      introductory entry, if you added one in §8). **‹ Settings** returns.
- [ ] Phone (≤ 767px) and desktop (≥ 768px), light and dark: the page reads
      cleanly, with no horizontal scrolling.
- [ ] Your training data is unchanged (Today, History, and Goals look as
      before).

Afterwards, query 3 of `verify-release-seen.sql` still shows 0 rows until an
entry exists and someone signs up or is shown the dialog.

The dialog itself is first exercised in production when the first significant
entry ships (Pitch 13). Check then that it appears once for your account,
lists the entry, and doesn't return after a reload.

---

## 7. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. Leave the table in place: the previous code ignores it. |
| #72 was merged before the migration (signed-in pages error) | Apply §3 immediately (it's safe while the new code is live). Or roll back first, then apply §3, then redeploy. |
| An entry was published by mistake | Correct its wording in place, or set `significant: false`. Accounts already shown it won't see it again. **Don't delete it, re-date it, or change its `id`** (each seen point refers to it). |
| Someone should see an entry again | Not a product feature (once means once). A human could run `DELETE FROM release_seen WHERE user_id = '<that account's id>';`, naming the account explicitly. That account would then see every significant entry dated on or after its creation date. Not expected to be needed. |
| You really need the table gone | Only after the code is rolled back to a version that doesn't know about it: `DROP TABLE "release_seen";`, then remove the `9e_release_seen` row from `_prisma_migrations`. This discards only seen state, never training data. |
| Restore from the §2 backup | Never needed for this migration, because it writes no data. |

---

## 8. Publishing and maintaining release notes

Release notes are repository content. There's no editor, and nothing is sent
anywhere. The full contract is spec §8 ("Release-note content contract") and
`docs/planning/method-note.md`. From Pitch 13 on, the `overload-onboarding`
skill writes entries in each pitch's guidance ticket.

**To add an entry** (the whole procedure):

1. Open `src/lib/release-notes/entries.ts` and put a new object at the **top**
   of `RELEASE_NOTES`:

   ```ts
   {
     id: "2026-11-03-faster-logging",          // permanent, kebab-case, YYYY-MM-DD-short-name
     date: "2026-11-03",                       // the day it reaches production
     title: "Logging is faster",               // 1-80 characters, one line
     body: "Your last weight is filled in, and you can repeat it across sets with one tap.", // 1-3 plain sentences
     significant: true,                        // true = shown once in the dialog to accounts that haven't seen it
   },
   ```

2. Run `npm test`. `tests/unit/release-notes-catalog.test.ts` fails if the
   entry breaks a rule:
   - the id isn't a slug, or is a duplicate
   - the date isn't a real date, or isn't newest first
   - the title is empty or too long
   - the body has HTML or links
3. Ship it with the change it describes. Nothing else changes: no component,
   page, migration, or setting.

**Rules:**
- Date an entry with the day it reaches production, never a planned date.
  Don't backdate.
- Mark it `significant` only when it adds a capability, changes behavior
  lifters will notice, or fixes a bug that affected their data or
  recommendations. Everything else gets `false` (page only) or no entry.
- One entry per shipped pitch by default.
- Never delete, re-order, or re-date a published entry, and never change its
  `id`. Fix wording in place.

**Deployment timing.** An entry appears the moment its deploy is live, and
significant entries open the dialog on each account's next full page load.
Because this pitch stops before merge, its own ship date is set by you. If
you want an introductory entry ("Settings now has a What's New page…"), add
it in the same PR, dated the day you merge #72. Mark it `significant: false`
if you don't want existing lifters interrupted for it.

**Public changelog later.** `entries.ts`, `catalog.ts`, `types.ts`, and the
`ReleaseNote` component import nothing private. A future public page can
render `orderedReleaseNotes()` with `<ReleaseNote>` directly. Seen state lives
only in `release_seen`, and nothing public may read it.

---

## 9. What was verified (local stack + embedded test DB only)

Recorded in the run report (`docs/runs/12-whats-new-report.md` §3). In short:

- **Static checks:** format, lint, and typecheck.
- **Unit tests:**
  - content contract (with the shipped catalog as a CI gate)
  - selection
  - guards (single source, public-safe imports, no entry named in the
    mechanism, no email or push)
  - action contract
  - component and page render tests
- **Integration tests:**
  - seen state: shown once, monotonic, together, new account caught up, the
    floor
  - isolation, account deletion, and ownership enforcement
  - the 9e migration rehearsal, plus the RLS and schema suites
- **Build:** production build and the client-bundle secret check.
- **Local stack:**
  - 9e applied with `prisma migrate deploy`
  - `migrate diff` against the schema is empty
  - this runbook's SQL returned the lines in §4
  - the anon Data API is refused for `release_seen`
  - 463 logged sets unchanged
- **Browser:**
  - accounts e2e, including the new What's New suite
  - a dialog walkthrough with temporary, reverted entries: once, together,
    newest first, ordinary entries excluded, the short phone, light and dark,
    the new account, and the second account
  - temporary accounts removed through the app
- **Production:** not touched.
