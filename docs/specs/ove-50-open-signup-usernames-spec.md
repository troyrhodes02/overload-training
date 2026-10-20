---
version: 1.0.0
status: approved (owner request, 2026-10-20)
author: Claude Code
last_updated: 2026-10-20
pitch_reference: none — owner-directed change on top of Accounts (Pitch 9) and Personalization & Navigation Polish (Pitch 10)
design_reference: docs/design/09-accounts-signup-login-password-reset-design-doc.md (Screens 2 and 6, amended here)
linear_issue: OVE-50
---

# Open signup & usernames

## 1. Summary

Anyone can create an Overload account. No invite code is needed. Signup asks for first name, last name, a username, email, and the password typed twice. Every account gets a **username** that is unique across all accounts. It does nothing yet: it is captured now so that a later pitch (friends) can let people be found by it. Settings lets a lifter change their first name, last name, and username.

Two things keep it safe:

- **A server-only signup switch.** `OVERLOAD_SIGNUP_OPEN=true` replaces the invite code. Production stays closed until the owner opens it.
- **Uniqueness enforced by the database.** A unique index plus a CHECK constraint on `profiles.username` mean no race, bug, or direct write can ever produce two identical usernames.

## 2. Scope

**In scope**

- Self-signup without an invite code, behind `OVERLOAD_SIGNUP_OPEN`.
- A "Confirm password" field on signup, checked in the browser and on the server.
- `Profile.username`: required at signup, editable in Settings, unique regardless of case.
- Settings: edit first name, last name, and username (timezone and appearance unchanged).
- Copy no longer calls Overload "invite-only".
- Migration `9c_profile_username` and a production runbook.

**Out of scope (owner: "do not add friends or anything")**

- Friends, following, search, profile pages, showing a username to anyone but its owner.
- Email verification, password reset, password change (still no email provider; Accounts R28).
- Making `username` NOT NULL. Accounts created before this change have none, so a follow-up migration can tighten it once every account has picked one.

## 3. Resolved decisions

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| U1 | The invite gate (`OVERLOAD_INVITE_CODE`, `src/lib/accounts/invite.ts`) is removed. Signup is open to anyone while `OVERLOAD_SIGNUP_OPEN` is exactly `true` (trimmed, case-insensitive), and closed otherwise. | Owner: "I don't want it to be me that has to invite a user." The switch keeps the CLAUDE.md rule that signup stays closed in production until Multi-User Foundation is verified there. Without it, merging would open production signup the moment it deployed. It is also the off switch if abuse appears. | Owner instruction; `.claude/CLAUDE.md` Access model (amendment flagged, §10) |
| U2 | Accounts are still created with the Supabase admin API, and Supabase's own "Allow new users to sign up" stays **OFF**. | With project signup on, the browser's anon key could create auth users directly, skipping the app's checks (names, unique username, profile). The admin path keeps the app the only door. | Accounts R3 |
| U3 | Username rules: trimmed, a leading `@` dropped, lowercased, then `^[a-z0-9_]{3,20}$`. Stored lowercase, so uniqueness ignores case ("Sam" and "sam" are the same name). | Lowercase storage makes a plain unique index enforce case-insensitive uniqueness, with no functional index or citext. The rule is URL-safe and easy to type for the future "find by username". | Owner: "never identical usernames" |
| U4 | The database enforces both uniqueness (`profiles_username_key` unique index) and shape (`profiles_username_format` CHECK). The column is nullable; Postgres allows many NULLs under a unique index. | Application checks can race; the database can't be raced. Nullable because existing accounts have no username, and inventing ones for them would be guessing. | CLAUDE.md layered enforcement |
| U5 | Reserved names are refused: admin, administrator, help, me, moderator, null, official, overload, root, settings, staff, support, system, undefined. | Cheap now, impossible to take back later once friends can see usernames. Reserved names could pass for Overload itself or a route. | Judgment |
| U6 | Signup pre-checks availability (`isUsernameAvailable` in `src/lib/data/usernames.ts`). It is the one cross-account question the app asks, and it answers yes or no only. The unique index stays the authority: losing a race at the profile write is compensated (auth user deleted, auth session cleared) and reported as "That username is taken." | Without the pre-check, a taken username would create and then delete an auth user every time, and "email exists" would be reported before "username taken". Never returning more than a boolean keeps it from leaking anything else about the holder. | CLAUDE.md first invariant |
| U7 | "That username is taken." is shown at signup and in Settings. It reveals that **some** account uses that name, and nothing else. | Inherent to unique usernames: they are meant to be public handles later. No name, id, or data of the holder is revealed. | Owner requirement; CLAUDE.md "never show another account's name" (a username is not shown, only refused) |
| U8 | With no invite gate in front of it, "An account with this email already exists." now tells anyone whether an email has an account. Accepted. | With no email verification, signup can't hide this: the account can't be created, and saying so is the only honest answer. Mitigations: the runbook's Vercel Firewall rate limit on `/signup`, and the off switch. Login still gives one message for an unknown email and a wrong password. | Known risk, flagged for the owner |
| U9 | Confirm password must equal the password exactly (no trimming). Mismatch → "Passwords don't match."; empty → "Enter your password again." Neither password is ever echoed back or logged. | Owner request. Checking on the server too means a scripted post can't skip it. | Owner instruction |
| U10 | Settings requires a username to save. An account created before usernames sees an empty field and picks one on its next save. | One form, one rule. There's no separate "claim your username" flow to build or test. | Judgment |
| U11 | No design doc or UI preview. The change adds fields to two existing screens (Signup, Settings) using existing components and patterns. | Proportional: no new screen, state, or component. Screenshots were checked at phone width in light and dark. | Judgment; flagged in the PR |
| U12 | Abuse controls are operational, not code: a Vercel Firewall rate-limit rule on `POST /signup` (runbook) and the off switch. No CAPTCHA, no app-level rate limiter. | CLAUDE.md rules out a cache or queue layer, which an app-level limiter would need. The admin API has no Supabase rate limit of its own. | CLAUDE.md infrastructure non-goals |

## 4. Data model

```prisma
model Profile {
  // …
  /// Unique handle, stored lowercase (so uniqueness ignores case) and
  /// checked by a database CHECK constraint (^[a-z0-9_]{3,20}$). Nullable only
  /// because accounts created before usernames have none; signup requires it.
  username   String?    @unique
  // …
}
```

```sql
-- prisma/migrations/9c_profile_username/migration.sql
ALTER TABLE "profiles" ADD COLUMN "username" TEXT;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_]{3,20}$');
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");
```

The migration is additive. No table is created (RLS unchanged: on, no policies), no row is rewritten, and logged history is untouched. `prisma migrate diff` from the applied migrations to the schema is empty. Apply it **before** the code deploys: Prisma reads every `profiles` column, so the new code against an unmigrated database fails on every signed-in page.

## 5. Server behavior

**Signup** (`src/lib/accounts/signup.ts`), in order:

1. Closed? → `closed`, nothing touched.
2. Field rules, all reported together: names 1–50, username shape and reserved names, email shape, password present, confirmation present and equal.
3. `isUsernameAvailable(username)` → taken → field error, nothing created.
4. `createConfirmedUser` (admin API). Email exists → `email_taken`; weak password → field error.
5. Sign in, then `establishProfile` with names, username, and the device timezone.
6. Any failure after step 4 → delete the auth user, clear the auth session. A username lost to a race reports "That username is taken."; anything else reports "unexpected".

**Settings** (`updateProfile`): parses names, username, and timezone, then `updateMany` scoped to the acting account. A unique violation becomes `conflict` / "That username is taken." on the username field. Re-saving your own username is not a conflict. Changing it frees the old name immediately.

**Signup switch** (`src/lib/accounts/signup-gate.ts`): the only reader of `OVERLOAD_SIGNUP_OPEN` (guard test). The variable is server-only and is in the client-bundle scan's forbidden list.

## 6. Validation

| Field | Rule | Message |
| ----- | ---- | ------- |
| username | empty | Choose a username. |
| username | a character outside a–z, 0–9, `_` (after lowercasing) | Use only letters, numbers, and underscores. |
| username | fewer than 3 or more than 20 characters | Use 3 to 20 characters. |
| username | reserved | That username isn't available. |
| username | held by another account | That username is taken. |
| confirmPassword | empty | Enter your password again. |
| confirmPassword | differs from password | Passwords don't match. |

Helper text under both username fields: "3–20 characters: lowercase letters, numbers, and underscores." Settings lowercases as you type. Signup lowercases on save.

## 7. UI changes

- **Signup:** no invite-code field. Order: First name, Last name, Username (helper text), Email, Password, Confirm password. After a server error both password fields are cleared and the first problem is focused. Closed state: "Signup isn't open. New accounts can't be created right now. If you already have one, sign in."
- **Login footer:** "New to Overload? Create an account".
- **Settings → Profile:** a Username field between the names and the read-only email. Save is enabled when anything differs from what's saved, compared normalized.
- **Metadata description:** "A strength training tracker."

## 8. Testing

- **Unit:**
  - the switch (only `true` opens; an old invite code doesn't);
  - username normalization, shape, reserved names, and agreement with the database regex;
  - signup orchestration: closed, every missing field, confirm mismatch, malformed/reserved/taken username before any account is created, the race compensated, no personal data logged;
  - the action echoes no password;
  - guard tests: the switch is read only by the gate, no invite code anywhere, only signup asks about availability.
- **Integration** (isolation suite, `profile.int.test.ts` + `schema.int.test.ts`):
  - B can't take, change, or read A's username, in any case;
  - re-save isn't a conflict, and a rename frees the old name;
  - the availability check returns only a boolean;
  - many NULLs coexist;
  - the database refuses duplicate, uppercase, and malformed values;
  - two concurrent saves of one name: exactly one wins;
  - signup's profile write with a taken name creates nothing, and leaves a lazily made profile untouched;
  - the column, index, and CHECK exist.
- **E2E (local stack):**
  - signup has no invite field;
  - mismatched passwords create nothing;
  - signup with a capitalized username stores it lowercase;
  - email taken; username taken (any case) creates nothing;
  - Settings renames the username, another account can't take it, and the old name is freed;
  - the default suite proves signup is closed without the switch.

## 9. Acceptance criteria

- [x] Signup creates an account with first name, last name, username, email, and a password typed twice; no invite code.
- [x] Signup is closed unless `OVERLOAD_SIGNUP_OPEN=true`.
- [x] No two profiles can share a username, regardless of case, enforced by the database.
- [x] Settings edits first name, last name, and username; a taken username is refused with "That username is taken."
- [x] A failed signup leaves no auth user and no profile.
- [x] The isolation suite covers `Profile.username`.

## 10. Upstream amendments (not made here)

- `.claude/CLAUDE.md`, still uncommitted:
  - opening paragraph ("It is invite-only and used by a small group of friends");
  - Stack/Secrets ("the invite code");
  - Access and registration model ("requires a valid invite code", "open without the invite gate", "loosen the invite gate");
  - Product boundaries ("Not a public product. Invite-only … no … open signup");
  - Testing item 6 ("signup rejects a missing or wrong invite code");
  - the stop condition "open without the invite gate".
  
  These should describe open self-signup behind `OVERLOAD_SIGNUP_OPEN`, and usernames. The data-model list should note `Profile.username`.
- PRD / Roadmap / Pitch 9 doc: the invite requirement is superseded.
- `overload-ui-design` skill's Login guidance and single-user wording (already stale, Accounts R19).

## 11. Open questions

1. *(non-blocking)* **Abuse.** Open signup has no CAPTCHA. Default: the Vercel Firewall rate limit plus the off switch. Revisit if junk accounts appear.
2. *(non-blocking)* **Tightening `username` to NOT NULL.** Once every account has one, a follow-up migration can make it required.
