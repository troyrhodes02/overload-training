# Release record: Pitch 21d — App Shell, Design System & Accounts (to Production)

Staging PRs: #215 (feature, OVE-183..187), #221 (OVE-188), #222 (OVE-189), and #223 (OVE-190, a test-only fix found while validating this release). Release branch `release/21d-app-shell-accounts`, cut from `main` at `35c5caf` (the 21c release).

## 1. What Production gains

- **Web API, three new mobile endpoints** under `/api/mobile/v1`, all using the 21c pipeline:
  - `POST /accounts`: native signup through the web's own `signUp`, with every signup defense.
  - `POST /password-reset`: the web's `requestPasswordReset`, with an identical answer for every address.
  - `PUT /me/appearance`: the web's `updateAppearance`, authenticated and scoped.
- **`GET /app-config`** gains `botChallenge`: the Turnstile site key and the public web origin. Both are public values.
- **Password-reset links (web, native, admin)** now pass Supabase `redirectTo` = this deployment's `/auth/confirm` (OVE-189, RD-31). Before, they sent no destination, so the link's target depended only on the email template and the Site URL.
- **Shared package:** the sign-in and billing copy moved there, and the app-version comparison is shared by the API and the app. The web's text is unchanged; every moved string was compared.
- **`apps/mobile`, the iPhone app:**
  - The code ships in the repository, but **nothing builds or publishes it in Production**.
  - Its config refuses every environment except staging, and `eas.json` has only the `development` profiles on the `staging` channel.
  - The EAS project has one channel, `staging`. The repository has no GitHub or EAS workflows. The root script `mobile:update:staging` runs only by hand and publishes only to staging.
  - Vercel builds only the web app. The production build was checked: every `/api/mobile` route is dynamic.
- **No Production mobile build, EAS update, TestFlight upload, or store submission** comes from this release. Those are 21l and human steps.
- **Tests (OVE-190):** an integration test built a trial from a fixed date while the billing screen reads the real clock, so it began failing on 2026-11-15 on `main` and `staging` alike. Test-only; no application code changes.

## 2. Production migrations

**None.** The release diff has no change under `apps/web/prisma` (no migration, no schema change). The new endpoints reuse existing tables: `Profile` (`appearance`), the auth throttle, and the signup and trial rows that web signup already writes.

## 3. Production environment (Vercel)

**No variable is added or changed.** Confirm these existing values in Vercel → Settings → Environment Variables (Production):

| Variable | Needed for | Expected |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | The reset link's fallback destination and `app-config` `botChallenge.origin` | The Production origin, e.g. `https://overloadtraining.app` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The bot challenge on native signup and reset, exactly as on the web | Already set for web signup |
| `TURNSTILE_DISABLED` | — | **Unset.** It is refused in Production anyway |
| `OVERLOAD_SIGNUP_MODE` | Native signup obeys it like the web: `closed` stops both | Your current choice (`public`) |
| `MOBILE_MIN_APP_VERSION`, `MOBILE_LATEST_APP_VERSION`, `MOBILE_MAINTENANCE` | The 21c version gate | Unset (defaults serve every version) |

`OVERLOAD_REDIRECT_HOSTS` is optional and unchanged. It is needed only if Production serves a host that is neither `NEXT_PUBLIC_APP_URL`'s host, its www/apex sibling, nor `*.vercel.app`.

## 4. Production Supabase Auth: the password-reset checkpoint (owner-operated)

**The run did not read or change Production Supabase.** Recovery emails come from Supabase's Reset Password template. It must link to Overload's `/auth/confirm` with a token hash. On staging the email opened the landing page because no destination was sent; OVE-189 fixed the code, and you set the `overload-dev` template.

**Before merging: read, don't change.** Supabase → the Production project → Authentication:

1. **Emails → Reset Password**: note the link's `href`. It is one of:
   - **A.** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`: works today and after the release. No change is required.
   - **B.** `{{ .ConfirmationURL }}` (Supabase's default): reset links land on the home page **today**. Fix it after the deploy (step 3).
   - **C.** `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`: lands on the home page **today**, because the current code sends no destination. The deploy itself fixes it.
2. **URL Configuration**:
   - **Site URL** is the Production origin.
   - **Redirect URLs** include `https://<production host>/**`, plus the `www.` or apex sibling if you serve both. Supabase silently swaps a destination that isn't listed for the Site URL.

**After the deploy, and only after it:**

3. Set **Reset Password** to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery`, the same form as `overload-dev` and the Magic Link template. Keep the subject and text ("Reset your Overload password", link works once, expires in 1 hour).
   - **Required for B.** Recommended for A, for one form everywhere. Nothing to do for C.
   - **Never before the deploy:** the old code sends no destination, so this form would send links to the home page.
4. Run the reset smoke test (§5).

The Magic Link (email verification) template is not affected; verification already sent its destination.

## 5. Production smoke test (after the deploy)

```bash
P=https://<production host>/api/mobile/v1
curl -s $P/app-config
# {"minimumAppVersion":"0.0.0","latestAppVersion":"0.0.0","killSwitches":{…,"maintenance":false},"signupMode":"public","botChallenge":{"provider":"turnstile","siteKey":"…","origin":"https://<production host>"}}
curl -s -i -X PUT -H 'X-Overload-App-Version: 0.1.0' -H 'content-type: application/json' --data '{"appearance":"dark"}' $P/me/appearance | head -1   # 401
curl -s -i $P/accounts | head -1          # 405 (route exists; POST only)
curl -s -i $P/password-reset | head -1    # 405
```

Don't POST to `/accounts` or `/password-reset` with curl: without a real Turnstile token they answer `validation_error`, which is expected and proves nothing more.

**Password reset, end to end, with your own account** (after §4 step 3):

1. On the web, use `/forgot-password` with your own email.
2. The email's link starts with `https://<production host>/auth/confirm?token_hash=`.
3. It opens **Set a new password**. Set one, and you land signed in.
4. Sign out and sign in with the new password.

**Web, signed in as yourself:** sign-in errors read as before ("Wrong email or password."). Settings → Appearance still saves. Plan & Billing reads as before. Signup still shows the challenge.

## 6. Rollback

- **Code:** in Vercel, promote the previous Production deployment (`35c5caf`), or revert the merge commit on `main` through a PR. There is no schema change, so nothing else to undo.
- **If you changed the Reset Password template** (§4 step 3) and then roll back the code, set the template back to form A (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`). The old code sends no destination, so the `{{ .RedirectTo }}` form would send reset links to the home page.
- **Accounts created through the native endpoint** are ordinary accounts. A rollback leaves them as they are.

## 7. Staging verification (owner, 2026-11-14 to 2026-11-15)

Pitch 21d runbook §9 has the full record.

- **Simulator (A):** sign-in, sign-out, navigation; no Unmatched Route, no endless loading.
- **Physical iPhone (B):** the EAS development build installed and launched. The QA account signed in, the session survived force-quit and reopen, and sign-out returned to Welcome.
- **Staging OTA update (C):** opened on the iPhone. Diagnostics showed the expected update and commit. Navigation and auth worked on it.
- **Accounts on staging (D):**
  - Native signup and the duplicate-email refusal.
  - The full password reset: the email arrived, opened the staging web reset form, the new password was set, and the native app signed in with it.
  - Appearance saved to the account and persisted.
- **Unverified (DoD 45):** a phone reboot, more than an hour in the background, an Airplane Mode outage, haptics and VoiceOver, and the Turnstile card in a real web view (staging disables Turnstile on Preview).

## 8. After the release

Synchronize `main` back into `staging` with a normal merge commit through a PR, the same procedure as #214. It needs your go-ahead.
