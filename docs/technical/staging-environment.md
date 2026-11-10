# Staging: the `staging` branch and its stable URL

**Status:** current (2026-11-09). Builds on `docs/technical/environment-isolation.md` (OVE-111), which this page does not replace.

Staging is a **Git branch plus a stable Vercel URL**, not a new database or service. It exists so unfinished work, Pitch 22 first among it, can be clicked through in a browser with real auth against **synthetic data only**, without going near Production.

## Branches

| Branch | Role | Vercel treats it as | Database |
| --- | --- | --- | --- |
| `main` | **Production.** Only reviewed, deliberately promoted work. | Production | `overload-prod` (`ycxvdiklpefyhdclxyau`), **protected** |
| `staging` | Persistent integration and testing branch. | Preview, with a stable branch URL | `overload-dev` (`vdxrmfadikwzodjljbdi`) |
| `feature/*`, `ove-*`, … | Short-lived work. | Preview, per-branch URL | `overload-dev` |

## Rules

1. **`main` is Production.** Merging into it deploys to Production. Nothing merges there without the owner's explicit approval.
2. **Feature PRs normally target `staging`.** Merging a feature into `staging` is how it becomes testable at the stable URL. It does **not** make the feature releasable.
3. **Promotion to `main` is a separate, deliberate PR**, opened only for features the owner has approved and whose release gates have passed. Open it from a branch cut from `main` that contains just those features (cherry-pick or merge the approved feature branches). **Never merge `staging` into `main` as a whole**: `staging` can hold features that are unfinished or not approved, which is exactly how Pitch 22 reached Production by mistake on 2026-11-09 (#130, reverted by #138).
4. **Keep `staging` current with `main`.** After anything lands on `main`, bring it into `staging` with a merge (`git switch staging && git merge origin/main`, then push). Never force-push `staging`. If it ever diverges badly, make a new branch and move the open PRs onto it.
5. **Preview always uses `overload-dev`.** Never Production. The tripwire in `src/lib/env/deployment-guard.ts` fails any Preview build, and refuses to start any Preview server, whose database or Supabase variable names the Production ref. It only works while Vercel's **Automatically expose System Environment Variables** is on, so that `VERCEL_ENV` is set.
6. **Production data never goes to staging.** No dump, no restore, no export. Staging data is test accounts and the demo fixture.
7. **Feature flags stay off until a gate is passed.** Anything with real cost or irreversible effect (`PLAN_IMPORT_ENABLED`, Stripe, a provider key) is set **only** on the staging branch's scope while it is being tested, and never in Production until its own release gate says so.

## The stable URL

Vercel gives every branch a stable alias of the form `<project>-git-<branch>-<team-slug>.vercel.app`, which always points at the branch's latest deployment. Deployment-specific URLs (`overload-training-<hash>-…`) change on every push and must never be put in Supabase or shared as a test link.

Expected staging URL (confirm it in Vercel → the `staging` deployment → Domains):

```
https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app
```

Vercel Authentication (deployment protection) may sit in front of it; sign in to Vercel in the same browser first. An optional custom domain such as `staging.<your-domain>` can be assigned to the `staging` branch under Settings → Domains → Add → "Connect to a Git branch". Use it if you want a URL that does not require a Vercel login (also turn off protection for that domain only).

### Supabase Auth settings for `overload-dev`

Supabase → `overload-dev` → Authentication → URL Configuration:

- **Site URL:** the staging URL above.
- **Redirect URLs:** the same URL followed by `/**` only. Add no wildcard over `*.vercel.app` or the team slug. Auth links are built from the host the lifter is on, and Supabase's allow-list is the gate, so a single exact entry is enough and nothing else can receive an auth link. Add `http://localhost:3000/**` only if you test locally against `overload-dev`; local development normally uses the local stack.
- Remove stale entries pointing at old feature-branch URLs.

## Vercel configuration

Settings → Environment Variables. **Production values are never touched.** Everything below is scoped to **Preview**; the rows marked *staging only* are scoped to Preview and limited to the branch `staging` ("Select a custom Preview branch").

| Variable | Value | Scope |
| --- | --- | --- |
| `DATABASE_URL` | `overload-dev` transaction pooler (`postgres.vdxrmfadikwzodjljbdi`, port 6543) | Preview |
| `DIRECT_URL` | `overload-dev` session pooler (port 5432) | Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://vdxrmfadikwzodjljbdi.supabase.co` | Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | the `overload-dev` keys | Preview |
| `OVERLOAD_SIGNUP_MODE` | `invite` | Preview |
| `OVERLOAD_INVITE_CODE` | a dev-only code that is not used anywhere else | Preview |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare's published always-pass test key `1x00000000000000000000AA` | Preview |
| `TURNSTILE_SECRET_KEY` | Cloudflare's published always-pass test secret `1x0000000000000000000000000000000AA` | Preview |
| `PLAN_IMPORT_ENABLED` | `true` | **staging only**, once the schema is migrated |
| `ANTHROPIC_API_KEY`, `PLAN_IMPORT_MONTHLY_SPEND_MICROS` | **unset** | everywhere, until provider approval |
| Stripe variables, `OVERLOAD_ADMIN_USER_IDS` | unset, unless testing billing or admin (use dev/test-mode values only) | Preview |

The Turnstile test pair is documented by Cloudflare and always passes. It is not a secret, and it is needed because Preview builds run with `NODE_ENV=production`, so the local Turnstile bypass does not apply.

Do **not** add a Production-scoped `PLAN_IMPORT_ENABLED`. Old Preview deployments keep the variables they were built with, so redeploy `staging` after changing any variable.

## Test accounts

Use the staging site's normal **signup form** with the dev invite code. That goes through the app's real controls (signup mode, invite code, Turnstile, unique username, the trial entitlement) and needs no secret beyond the code. A trial grants Pro for 14 days, which includes the `plan_import` capability, so no comp or admin grant is needed. Use a throwaway address; with "Confirm email" off in `overload-dev`, no email is sent.

Optional synthetic history for that account: `npm run demo:seed -- --user-id <uuid> --confirm-ref vdxrmfadikwzodjljbdi` (dry run), then add `--execute --confirm-user <uuid>`. See `environment-isolation.md`.

There is deliberately **no** script that creates Auth users directly: the auth-admin facade is restricted to the signup and deletion modules, and a bypass would test something other than what users run.

## Smoke test

Run after each `staging` deploy. Nothing here uses real data or a paid provider.

1. **Isolation.** Open the staging URL, sign up, then check in the `overload-dev` dashboard that the new user is in its Auth users and is **not** in Production's (look only at `overload-dev`; never open Production's table to check). Browser network calls go to `https://vdxrmfadikwzodjljbdi.supabase.co` and nowhere else.
2. **Login and logout** with the dev account.
3. **Exercise catalog.** Open the library: 876 exercises, images load.
4. **Plan import entry** (needs `PLAN_IMPORT_ENABLED=true` and the Pitch 22 migrations). `/plan` shows "Import existing plan". With the flag off, it shows "Plan import is temporarily unavailable" instead.
5. **Upload validation.** Add a source: a pasted-text part, then files. A non-plan file type, an oversized file, and a file whose bytes don't match its extension are refused with a plain message.
6. **Ownership.** Sign in as a second dev account: the first account's import session URL returns not-found, never forbidden.
7. **Extraction stops cleanly.** With no spend cap and no provider key, "Extract" ends in the "unavailable" state. No draft, no charge, no provider request.
8. **Discard.** Discard the session: its parts and stored files disappear from the dev bucket.
9. **No writes to Production.** Re-check step 1's isolation after the run.

### What is and is not testable before provider approval

| Testable in the browser now | Needs the provider (blocked) |
| --- | --- |
| Entry point, flag on/off, Pro gating (Free account sees the upgrade note) | Real extraction from pasted text, PDFs, screenshots, handwriting |
| Intake: text, upload, reorder, remove, discard; size and type limits; private bucket | The review screen, field edits, exercise matching, custom-exercise staging |
| Ownership scoping across two accounts | Confirm → plan creation from an imported draft |
| Retention cleanup via `npm run plan-import:cleanup` (dry run; needs `--confirm-ref`) | Spend metering against a real cap, quota behavior under real usage |
| Clean failure when unconfigured | Cost, accuracy and handwriting quality |

Review, edit, matching and confirm are covered by the integration tests with an in-memory mock provider (`tests/integration/import-*.int.test.ts`), but have no browser path until a draft can exist. Enabling the provider needs the owner's spend limit, the consent and data terms decision, and the evaluation gates in `docs/runs/22-workout-plan-import-review-runbook.md`.

## Reusable staging test account

`overload-dev` has signup disabled for the public and the signup form is gated by Turnstile (plus an invite code and a rate limit). **Login is not**: `signInAction` (`src/app/login/actions.ts`) calls `signInWithPassword` with no challenge. Turnstile protects only signup and password recovery. So a test account provisioned directly can sign in on the permanent staging URL with just an email and password.

`scripts/operator/provision-dev-test-user/cli.ts` creates that account, in the development project only:

- one Supabase Auth user (admin API, email pre-confirmed, no email sent) with a CSPRNG password;
- its `Profile` (verified, username `staging_tester`) and `TourProgress` row, as signup creates;
- one **comp** Pro entitlement (reason `tester`, no end date): no Stripe, no billing row, no subscription;
- no training data, no model-API call.

The default login email is `overload-staging-tester@example.com`, a reserved non-routable address, so nothing can ever be mailed to a real person. Pass `--email` to use another.

### Run it

Export the **development** values in the shell (never in `.env`): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Then:

```sh
npx tsx scripts/operator/provision-dev-test-user/cli.ts --confirm-ref vdxrmfadikwzodjljbdi            # dry run
npx tsx scripts/operator/provision-dev-test-user/cli.ts --confirm-ref vdxrmfadikwzodjljbdi --execute  # create
```

Before connecting it requires `--confirm-ref vdxrmfadikwzodjljbdi`, checks all four variables name that project (a service-role key for Production or any other project is refused), refuses Production with no override, and verifies the database identity marker. The password is written to `~/.overload-dev/test-user.txt` (directory `0700`, file `0600`, outside the repo) and never printed; view it with `cat ~/.overload-dev/test-user.txt`. Save it in a password manager.

### Idempotency and password resets

A re-run reuses the existing account, fills in anything missing (profile, comp), and **never changes the password**. To reset it deliberately, open overload-dev in the Supabase dashboard → Authentication → Users, choose the user, and set a new password there (recovery email cannot reach the example.com address), then update the saved file by hand. The tool never deletes an account it did not create in the same run.
