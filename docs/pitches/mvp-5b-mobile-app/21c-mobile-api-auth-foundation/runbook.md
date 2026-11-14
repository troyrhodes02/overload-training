# Pitch 21c — Mobile API & Auth Foundation: Owner Runbook

**What this slice changed outside the code:** one additive database migration (`9p_mobile_api`), already applied to **overload-dev** by the run. Nothing else: no Vercel setting, no Supabase setting, no Production change, no Expo or Apple step. Three optional server-only environment variables exist for the app version gate; none needs to be set yet.

## 1. Database

| Environment | Status | Who |
| --- | --- | --- |
| overload-dev (staging) | `9o_trial_claims` and `9p_mobile_api` applied by the run on 2026-11-13 with the guarded wrapper | done |
| Production | not applied; applied only when 21c is promoted | you, from the promotion runbook, after a backup |

`9p_mobile_api` adds one owned table, `api_idempotency_keys` (deny-all RLS, no policies, immutable `user_id`, removed with the account), and one enum value, `auth_throttle_action.mobile_api_request`. Nothing is dropped, renamed, or rewritten. `9o_trial_claims` was already in `staging` and `main` but had never been applied to overload-dev, and Prisma applies migrations in order.

To re-check overload-dev at any time (read-only):

```bash
cd apps/web
set -a; . ./.env.local; set +a
npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref vdxrmfadikwzodjljbdi
# expect: "Database schema is up to date!"
```

## 2. Optional environment variables (server-only; leave unset for now)

| Variable | Default when unset | What it does |
| --- | --- | --- |
| `MOBILE_MIN_APP_VERSION` | `0.0.0` | Apps older than this get HTTP 426 `upgrade_required` |
| `MOBILE_LATEST_APP_VERSION` | the minimum | The newest build, shown to the app |
| `MOBILE_MAINTENANCE` | off | `"true"` tells the app to show its maintenance screen; the API keeps serving |

Set them in Vercel's Preview scope only when 21d ships a build. Changing one needs a redeploy.

## 3. Staging check (about 5 minutes)

The stable staging URL is behind Vercel Deployment Protection, so an anonymous request gets Vercel's own login redirect (HTTP 302) or 401 before it reaches Overload (observed on this branch's Preview: 302). Use a protection-bypass token (Vercel → Project → Settings → Deployment Protection → Protection Bypass for Automation) as the `x-vercel-protection-bypass` header, or run the checks against a local production build with `apps/web/.env.local`.

First get a token for the staging tester (`overload-staging-tester@example.com`; the password is in `~/.overload-dev/test-user.txt`). From the repository root:

```bash
cd apps/web && set -a; . ./.env.local; set +a
TOKEN=$(node -e 'const {createClient}=require("@supabase/supabase-js");createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}).auth.signInWithPassword({email:process.argv[1],password:process.argv[2]}).then(r=>console.log(r.data.session.access_token))' overload-staging-tester@example.com '<password>')
```

Then run the three checks:

```bash
BASE=https://<staging-host>/api/mobile/v1      # or http://localhost:3200/api/mobile/v1
BYPASS='x-vercel-protection-bypass: <token>'   # for a local build, use BYPASS='x-noop: 1'

# 1. App config: public, no token
curl -s -H "$BYPASS" $BASE/app-config
# expect {"minimumAppVersion":"0.0.0","latestAppVersion":"0.0.0","killSwitches":{...},"signupMode":"..."}

# 2. No token: a JSON 401, not a login page
curl -s -i -H "$BYPASS" -H 'X-Overload-App-Version: 1.0.0' $BASE/me | head -1
# expect HTTP/... 401, with the body {"error":{"code":"unauthorized",...}}

# 3. A real token: the tester's own Today
curl -s -H "$BYPASS" -H 'X-Overload-App-Version: 1.0.0' -H "Authorization: Bearer $TOKEN" $BASE/today
# expect the tester's greeting, dashboard, and calls (a 200 with JSON)
```

If any check fails, note which one and do not promote 21c.

### What the run already verified live (overload-dev, local production build, 2026-11-13)

Throwaway accounts on `example.com` were used. All passed:

- A valid token works with no cookie (`me`, `today`, `gyms`).
- Each of these gets 401: an expired token, a token after global sign-out, a token after account deletion (no profile reappeared), a forged token, and a malformed header.
- A suspended account gets 403. An old app version gets 426, and a missing version gets 400.
- A Free account with the same history gets the calls locked. A Pro account gets them.
- A second account sees none of the first account's data.
- A burst of 130 requests gets 429 after 120.
- The unknown-path 404 is JSON, and signed-out web pages still redirect to `/login`.

The web's Today page (pending, Free-locked, in progress, and complete with goals), the workout page, Goals, and a history detail rendered the same text and element structure on the `staging` build and on the 21c build.

## 4. Not verified by the run

- Anything on an iPhone, the iOS simulator, Expo, or Hermes (21d).
- The endpoints on the Vercel Preview URL itself (Deployment Protection; the run verified a local production build against overload-dev instead, and that the Preview built).

## 5. Production (at promotion, not now)

- Apply `9o_trial_claims` (if Production lacks it) and `9p_mobile_api` with `prisma migrate deploy` from the promotion runbook, after a backup.
- The mobile API reaches Production only through the promotion workflow; nothing calls it until the 21l beta build.
