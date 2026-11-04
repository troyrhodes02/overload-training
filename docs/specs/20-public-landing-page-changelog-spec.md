---
version: 1.0.0
status: approved (pipeline run, unattended — Resolved Decisions below)
author: Claude Code pipeline run (Opus 5.5) for William Rhodes
last_updated: 2026-11-04
pitch_reference: pitches/20-public-landing-page-changelog.md (+ appendices A, B, C)
design_reference: docs/design/20-public-landing-page-changelog-design-doc.md
preview_reference: docs/previews/20-public-landing-page-changelog-preview.tsx
prd_reference: docs/planning/prd.md → Public Landing Page & Changelog
architecture_reference: docs/planning/architecture.md
linear_issue: milestone "Public Landing Page & Changelog" (Overload V1); issue ids in docs/runs/20-public-landing-page-changelog-progress.md
---

# Public Landing Page & Changelog — Technical Specification

## 1. Summary

Public Landing Page & Changelog adds a small set of **public, server-rendered marketing pages inside the existing Next.js application**: a landing page served at `/` to signed-out visitors (signed-in lifters still get Today at `/`), `/pricing`, `/blizzy`, `/changelog`, `/privacy`, and `/terms`, all sharing one marketing frame and linking the existing `/support`. Each call to action comes from one pure function of (signed in?, signup mode, billing switch) that the server resolves per request. No page can offer an action the server would refuse.

The core abstraction is **reuse, not new machinery**. The changelog renders the existing repository release-note catalog through the existing `ReleaseNote` component, so it is the same source as What's New. The BLIZZY handoff is a first-party, two-hour, allowlisted campaign cookie, plus one immutable provenance value on the new account's `Profile`, plus a copyable code shown where the existing Plan & Billing screen already offers Subscribe. Stripe's own promotion-code field still applies or refuses the discount. Legal pages render owner-supplied drafts behind a three-state publication gate. Screenshots are real captures of a **synthetic demo account** seeded by a guarded, default-dry-run, loopback-only operator CLI that writes history only through the application's own write modules.

"Working" means: a signed-out visitor at `/` sees the landing page with the action the current mode allows, and nothing else. A signed-in lifter at `/` sees Today. With billing off, no public page and no crafted action call can start a Checkout. Visiting `/blizzy` and then signing up records `blizzy` on that account and nowhere else. `/changelog` and Settings › What's New list the same entries in the same order with the same dates, and no one's seen state changes. The legal pages never present an unapproved draft as policy in force.

## 2. Problem

- The app cannot yet show anything to a signed-out visitor except a login form: `/` redirects to `/login` (`src/lib/auth-routes.ts`). A creator-video viewer has nowhere credible to land.
- The app cannot yet say publicly what is Free, what Pro costs, or whether anyone can join. The signup mode and billing switch are server facts that no public surface reads.
- The app cannot yet tell which campaign led to an account, so the owner cannot tell whether the BLIZZY videos brought anyone.
- Release notes exist only behind sign-in (`/settings/whats-new`), although the catalog was built to be public-safe (What's New spec R21).
- There are no privacy policy or terms pages, and there is no synthetic data to take honest screenshots from. The only seeding tool (`chore/dev-scenario-seeding`, unmerged) predates multi-user and writes `LoggedSet` rows directly.
- **Discovered precondition:** `main` has no billing kill switch. `STRIPE_BILLING_ENABLED` / `isCheckoutEnabled()` exists only in commit `cddd220`, which was pushed to `origin/19-plans-billing-promo-codes` after PR #112 was squash-merged. This feature branch carries it (cherry-pick `b8f07ad`, owner-authored and unchanged), because every billing-aware CTA and the "crafted call cannot open Checkout" guarantee depend on it (RD-3).

Supports PRD → *Public Landing Page & Changelog* (AC1 CTA truth, AC2 one source, edge case: demo-account screenshots) and roadmap Pitch 21. Depends on Public Accounts (signup mode, `/support`) and Plans, Billing & Promo Codes (prices, BLIZZY, checkout, kill switch). Unblocks Pitch 23's landing-to-checkout journey check.

## 3. Scope and non-scope

**In scope**

1. Public routing: signed-out `/` → landing (rewrite, URL stays `/`). Public marketing paths reachable signed in or out. Robots, sitemap, and manifest public.
2. Marketing frame (header, footer, skip link), the CTA matrix, and its streaming server component.
3. Landing (chosen hero concept A plus seven sections), pricing, `/blizzy`, `/changelog`, `/privacy`, `/terms`, and Settings footer links.
4. First-party campaign attribution: cookie set by the proxy on `/blizzy`, recorded once at signup on `Profile.signupCampaign` (migration `9k_signup_campaign`), cookie cleared after signup, one aggregate admin count, export and deletion coverage.
5. BLIZZY code reminder on the existing Plan & Billing screen (display only).
6. SEO: canonical origin `https://www.overloadtraining.app`, per-page metadata, robots (production allows public pages, everything else disallows all), sitemap, `noindex` on unpublished legal pages.
7. Legal content modules built from Appendices B and C, with a three-state publication gate, owner-fact tokens, and a reconciliation checklist (runbook).
8. Demo fixture plus guarded seed CLI plus local-only provisioning helper plus tests. Real screenshots captured from the seeded local stack. Screenshot manifest with provenance. A four-to-six-step capture storyboard.
9. User guidance: one non-significant release note (no tour step).

**Out of scope** (pitch "Out of bounds" and design doc §12): enabling public signup or live billing; any change to prices, trial, grace, coupon eligibility, or entitlement enforcement; pre-applying a Stripe discount; a remaining-redemptions counter; a waitlist, email capture, newsletter, analytics vendor, pixel, or third-party script; a CMS or second changelog; a blog, testimonials, or A/B tests; a public demo login or hosted demo embed; native iOS/Android work; plan import marketing; publishing the legal drafts as approved; production seeding or migration (human steps in the runbook).

**Tempting creep, named:** making the Pro CTA open Checkout directly from `/pricing` (no, RD-6); adding a "notify me" field when signup is closed (no, RD-5); counting anonymous visits server-side (no, RD-9); fixing the account-deletion/Stripe-subscription gap discovered during legal reconciliation (billing behavior, not this pitch; flagged for Pitch 23, OQ-6).

## 4. Core concepts

| Concept | Description |
| --- | --- |
| **Marketing context** | `{ signedIn: boolean, signupMode: "closed" \| "invite" \| "public", billingEnabled: boolean }`, resolved on the server per request from the auth session (`getAuthUser()`, no profile work), `signupMode()`, and `isCheckoutEnabled()`. Never from the browser or a query string. If resolution throws, it fails closed to `{ signedIn: false, signupMode: "closed", billingEnabled: false }`. |
| **CTA resolution** | Pure `resolveCta(ctx)` → `{ primary, secondary, note, closed, pro }` exactly per design §6.9 (12 combinations). The only producer of public CTA labels and targets. |
| **Campaign** | A member of the closed allowlist `CAMPAIGNS = ["blizzy"]`. A campaign is intent, never authorization: it changes copy and provenance, never price or eligibility. |
| **Campaign cookie** | `ovl_campaign`, value `<campaign>.<issuedAtEpochSeconds>`. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on https, `Max-Age=7200`. Set only by the proxy on a GET of `/blizzy`. Read only on the server. Valid iff the campaign is allowlisted and the issue time is within 7200 s in the past (60 s future skew tolerated). Anything else is treated as absent. Deleted after a successful signup. |
| **Signup provenance** | `Profile.signupCampaign: SignupCampaign?`, written once, by the server, inside signup's profile creation, from the validated cookie. Never from a form field. Never written afterwards by any path. Part of the export, removed with the account. |
| **Release-note catalog** | `src/lib/release-notes/{entries,catalog,types}.ts`, unchanged and public-safe by contract. Both `/changelog` and `/settings/whats-new` render `orderedReleaseNotes().map(toReleaseNoteView)` through `ReleaseNote`. |
| **Legal document** | Typed content (`src/lib/legal/`): sections of paragraphs and lists whose inline segments are text or **owner-fact tokens**. `status: "draft" \| "published"` plus an approval record. The rendered state is derived (§6). |
| **Screenshot manifest** | `src/lib/marketing/screenshots.ts`: each shot id → alt, caption, image sources per appearance and device (or `null` = pending), and provenance (`fixtureVersion`, `anchorDate`, `capturedOn`, `route`, `synthetic: true`). |
| **Demo fixture** | `scripts/demo/fixture.ts`: versioned (`DEMO_FIXTURE_VERSION = "demo-v1"`), synthetic facts relative to an `anchorDate`. Two fictional gyms, library exercises by stable `sourceId`, two mesocycles (~8–9 weeks of history), workouts, sets, and one goal. |

Invariants preserved: no stored tag, e1RM, or trend. `LoggedSet` written only by `logSet` (the seed calls it). Owned rows only through the scoped client. RLS unchanged (no new table; `profiles` already deny-all). The capability gate is unchanged, and public pages return no gated result. The billing kill switch is authoritative for every checkout start.

## 5. States and lifecycle

**Legal page state** (pure `legalPageState(doc, facts, env)`):

| Condition | State | Renders | Robots |
| --- | --- | --- | --- |
| `doc.status === "published"` and every fact token used by the doc resolves to a non-empty owner value and `doc.approval` is set | `published` | clean document, "Effective <date>" | index |
| otherwise, and `VERCEL_ENV === "production"` | `finalizing` | holding page (design Screen 5/6, every sentence verified true) | noindex |
| otherwise (local, preview, test) | `draft-preview` | the draft with an `Alert` "Draft for owner review — not in effect" and highlighted fact markers | noindex |

A published doc with a missing fact is a **build failure** (validation throws at module load and a unit test asserts it), never a page with a hole.

**Campaign cookie:** absent → set (GET `/blizzy`) → refreshed (each later GET `/blizzy`, new issue time) → expired (browser `Max-Age`, or server rejects it past 7200 s) or deleted (successful signup). Signed-in visitors' cookies are set the same way. They affect only the Plan & Billing reminder, never provenance.

**Signup provenance:** `null` → `blizzy` at profile creation, terminal. No transition exists after creation: no action, admin operation, or job writes it (the admin gate keeps `status` the only writable Profile field).

## 6. UI integration

The preview is binding. Carried into implementation: the header/footer structure, hero concept A layout (copy 5 / screen 7 from `md`), the section order and copy drafts (design §6 Screen 1 table), the Free-first stacked plan cards with the "Not on sale yet" outline badge, the BLIZZY offer panel (code row with Copy, five conditions, availability line, disclosure directly under the panel), the changelog list identical to the What's New page, the three legal states, the Settings footer links, the Plan & Billing reminder line, button-sized skeletons for streaming CTA areas, and pending screenshot frames.

**Recorded departures from the preview** (RD-21): the preview's header wordmark is a placeholder square plus text, and the build uses the existing `OverloadLockup`. Preview mock screens become real captures, or the pending frame if no capture exists.

### Screens

| Route | File | Data | Actions |
| --- | --- | --- | --- |
| `/` (signed out, rewritten) | `src/app/(marketing)/welcome/page.tsx` | marketing context (streamed), screenshot manifest, newest 3 release notes | links only |
| `/pricing` | `src/app/(marketing)/pricing/page.tsx` | marketing context, `PRICE_DISPLAY`, `TRIAL_DURATION_DAYS`, `BLIZZY` | links only |
| `/blizzy` | `src/app/(marketing)/blizzy/page.tsx` | marketing context, `BLIZZY`, `PRICE_DISPLAY` | Copy code (client island) |
| `/changelog` | `src/app/(marketing)/changelog/page.tsx` | `orderedReleaseNotes()` | none |
| `/privacy`, `/terms` | `src/app/(marketing)/{privacy,terms}/page.tsx` | legal doc, owner facts, `VERCEL_ENV`, support email | none |
| `/settings` (existing) | adds a footer line | none | links |
| `/settings/billing` (existing) | adds the reminder line | `promoReminder` on `BillingScreenDto` | Copy code |
| admin Overview (existing) | adds one count | `signupsFromBlizzy` | none |

`(marketing)/layout.tsx` renders `MarketingHeader` (server; the CTA part is inside `<Suspense>` with a button skeleton), `<main id="main">`, and `MarketingFooter`, plus a skip link. It does **not** render the app shell, the tour, or the What's New dialog. Pages are static except the Suspense-wrapped parts that call `connection()` (required by `cacheComponents: true`).

### Components

| Component | Kind | Contract |
| --- | --- | --- |
| `MarketingHeader`, `MarketingFooter` | server | no props. The header's CTA is a streamed child |
| `ModeCta` | server (async) | `{ placement: "hero" \| "header" \| "free-card" \| "pro-card" \| "offer" }`. Reads the marketing context and renders `resolveCta` output |
| `ScreenshotFrame` | server | `{ shot: ShotId; priority?: boolean }`. `<picture>` with phone source `(max-width: 639px)`, light/dark via `dark:hidden` / `hidden dark:block`, `next/image`-free plain `<img>` with explicit width/height and `loading="lazy"` unless `priority`. Pending frame when sources are null |
| `PlanCard` | server | `{ variant: "free" \| "pro" }` |
| `CopyCode` | client island | `{ code: string }`. `navigator.clipboard.writeText`, icon swap for 2 s, `role="status"` live text, failure message |
| `LegalDocumentView` | server | `{ doc, facts, state }` |
| `ReleaseNote` | reused | unchanged |

### Forms and validation
None on public pages. Signup is unchanged except for the server-read cookie (§10).

### User guidance
No tour step (design §13). One release-note entry, built in the last ticket via `overload-onboarding`: id `<ship-date>-public-changelog`, title "Overload's changelog is now public", body per design §13, `significant: false`. New accounts start caught up (existing `initialReleaseSeen`), and existing accounts' seen pointer is unaffected by a non-significant entry.

### Plan placement and platform impact
Public pages: no account, no capability, no gated result. The Plan & Billing reminder is visible only where `canSubscribe` is already true. Platform: **public web only; native postponed** (pre-resolved decision 1). No `overload-cross-platform` invocation, because the iOS foundation is not in the repository.

## 7. Routing and proxy

`src/lib/auth-routes.ts` (pure, unit-tested) changes:

```ts
export const MARKETING_PATHS = ["/welcome", "/pricing", "/blizzy", "/changelog", "/privacy", "/terms"] as const;
const METADATA_ROUTES = ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"] as const;
// SIGNED_IN_SAFE_PUBLIC gains ...MARKETING_PATHS and ...METADATA_ROUTES.

/** Signed-out "/" renders the landing page at the same URL. */
export const LANDING_PATH = "/welcome";
export function routeRewrite(pathname: string, signedIn: boolean): string | null {
  return !signedIn && pathname === "/" ? LANDING_PATH : null;
}
// routeRedirect("/", false) now returns null (the rewrite handles it).
```

`src/proxy.ts`: after `getUser()`, it (1) applies `routeRedirect` (unchanged semantics for every other path), (2) applies `routeRewrite` via `NextResponse.rewrite`, carrying refreshed cookies as the existing redirect helper does, (3) on `GET /blizzy` sets the campaign cookie on whichever response it returns (`campaignCookieFor(pathname, now, secure)` from `src/lib/marketing/campaign.ts`), (4) keeps the admin 404 rewrite unchanged.

Guarantees, tested: signed-in `/` → no redirect, no rewrite (Today). Signed-out `/` → rewrite to `/welcome`. Every marketing path → no redirect in either state. Every pre-existing protected path → `/login` when signed out. `/login` and `/signup` → `/` when signed in (unchanged). Admin paths unchanged.

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Note |
| --- | --- | --- | --- |
| `Profile` | gains `signupCampaign` | enum `SignupCampaign` | nullable; owned by its own row |

### Enum and updated model

```prisma
/// Public Landing Page & Changelog: the allowlisted campaign a signup came
/// from. A closed set on purpose — adding one is a reviewed migration.
enum SignupCampaign {
  blizzy

  @@map("signup_campaign")
}

model Profile {
  // … existing fields …
  /// Public Landing Page & Changelog: the allowlisted campaign this account
  /// signed up from (first-party cookie set by /blizzy, validated server-side),
  /// or NULL. Written once by signup's profile creation; never updated.
  /// Exported with the profile; deleted with the account.
  signupCampaign SignupCampaign? @map("signup_campaign")
}
```

### Migration `prisma/migrations/9k_signup_campaign/migration.sql` (hand-written, additive, ASCII)

```sql
-- Public Landing Page & Changelog (spec 20 section 8). HAND-WRITTEN, reviewed.
-- Additive only: one enum, one nullable column on the already deny-all RLS
-- "profiles" table. No row written, nothing dropped or renamed.
CREATE TYPE "signup_campaign" AS ENUM ('blizzy');
ALTER TABLE "profiles" ADD COLUMN "signup_campaign" "signup_campaign";
-- RLS: "profiles" already has RLS enabled with no policies; no new table.
```

No new table means no new RLS statement. No index, because the column is read only by the admin aggregate count (`count where signupCampaign = blizzy`) over a small table. This is applied to production **by a human** from the runbook, with a backup first. It is tested here only against embedded Postgres and the local stack.

### Derived fields

| Field | Stored? | Computed from |
| --- | --- | --- |
| CTA (labels, targets, notes) | no | marketing context |
| Legal page state | no | doc status, owner facts, `VERCEL_ENV` |
| `promoReminder` | no | `canSubscribe` and (`profile.signupCampaign === "blizzy"` or a valid campaign cookie) |
| `signupsFromBlizzy` (admin) | no | `count(profiles where signup_campaign = 'blizzy')` |
| Progress/hold/deload, e1RM in screenshots | no | unchanged engine on read |

## 9. Authorization and access control

| Surface | Auth | Account scope | Capability |
| --- | --- | --- | --- |
| Marketing pages | none (public). Read `getAuthUser()` for the `signedIn` boolean only | reads no owned data | none, returns no gated result |
| Campaign cookie (proxy) | none | none, no server record | none |
| Signup provenance write | the signup action, inside the existing flow. The account is the one the auth service just created and signed in | `establishProfile` via `createAccountClient(user.id)` | n/a |
| Plan & Billing reminder | existing `requireAccount()` | own profile only | shown only when `canSubscribe` (billing on) |
| Admin count | existing admin gate (`assertAdmin`). `signupCampaign` added to `PROFILE_ADMIN_FIELDS` as account metadata. Still not writable | aggregate count only | admin allowlist |
| Checkout start | unchanged: `startCheckout` refuses before any Stripe call when `isCheckoutEnabled()` is false | own account | unchanged |
| Demo seed CLI | operator task. Target named by explicit `--user-id` (email optional cross-check) and confirmed. Loopback DB only | `accountFor(userId, base)` scoped client | n/a |

The campaign never authorizes a discount. Stripe Checkout's promotion-code field (monthly only, `allow_promotion_codes: interval === "month"`) and Stripe's coupon rules (first-time, cap) remain the only authority.

## 10. Server surface

No new server actions on public pages. Changes:

```ts
// src/lib/marketing/campaign.ts (pure; imported by proxy and server code)
export const CAMPAIGNS = ["blizzy"] as const;
export type Campaign = (typeof CAMPAIGNS)[number];
export const CAMPAIGN_COOKIE = "ovl_campaign";
export const CAMPAIGN_TTL_SECONDS = 7200;
export function isCampaign(v: unknown): v is Campaign;
export function campaignForPath(pathname: string): Campaign | null;        // "/blizzy" → "blizzy"
export function encodeCampaign(c: Campaign, now: Date): string;              // "blizzy.1730750000"
export function parseCampaign(raw: string | undefined, now: Date): Campaign | null;
export function campaignCookieFor(pathname: string, now: Date, secure: boolean):
  { name: string; value: string; options: { httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean; maxAge: number } } | null;

// src/lib/marketing/cta.ts (pure)
export type MarketingContext = { signedIn: boolean; signupMode: SignupMode; billingEnabled: boolean };
export type CtaAction = { label: string; href: "/" | "/signup" | "/login" | "/settings/billing" };
export type ResolvedCta = { primary: CtaAction; secondary: CtaAction | null; note: string | null; closed: boolean; pro: CtaAction | null };
export function resolveCta(ctx: MarketingContext): ResolvedCta;
export const FAIL_CLOSED_CONTEXT: MarketingContext;

// src/lib/marketing/context.ts (server-only)
export async function getMarketingContext(): Promise<MarketingContext>; // connection(); try { … } catch { return FAIL_CLOSED_CONTEXT }

// src/app/signup/actions.ts — reads the cookie on the server, never a form field
const campaign = parseCampaign((await cookies()).get(CAMPAIGN_COOKIE)?.value, new Date());
const outcome = await signUp({ ...fields, signupCampaign: campaign, throttleKey });
if (outcome.kind === "created") { (await cookies()).delete(CAMPAIGN_COOKIE); redirect("/"); }

// src/lib/accounts/signup.ts — RawSignUp gains `signupCampaign?: unknown`; revalidated with isCampaign()
// src/lib/data/account.ts — establishProfile input gains `signupCampaign?: Campaign | null`,
//   written in the create data and in the lazy-race update data only when non-null.

// src/lib/billing/screen.ts — getBillingScreen(account, opts?: { campaignHint?: Campaign | null })
//   BillingScreenDto gains `promoReminder: "BLIZZY" | null`
//   = canSubscribe && (profile.signupCampaign === "blizzy" || opts.campaignHint === "blizzy") ? BLIZZY.code : null

// src/lib/data/admin/metrics.ts — overview gains signupsFromBlizzy: number (Profile count, gated)
```

Error format is unchanged (`ActionResult`). Public pages throw nothing user-facing. An invalid release-note catalog or an invalid published legal doc fails CI.

## 11. SEO and metadata

- `src/lib/marketing/site.ts`: `PUBLIC_SITE_ORIGIN = "https://www.overloadtraining.app"` (owner-confirmed host, pre-resolved decision 11) and `PUBLIC_PAGES` (paths, titles, descriptions, sitemap inclusion).
- Each public page exports `metadata` with `title`, `description`, `alternates.canonical` (absolute on `PUBLIC_SITE_ORIGIN`; landing canonical `/`, so `/welcome` canonicalizes to `/`), and `openGraph` with title, description, and url. The existing root `opengraph-image.png` is the social image.
- `src/app/robots.ts`: when `VERCEL_ENV === "production"`, allow `/`, `/pricing`, `/blizzy`, `/changelog`, `/support`, and published legal pages. Disallow `/welcome`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/`, `/api/`, `/admin`, `/settings`, and every app route. Otherwise disallow `/`. Points to the sitemap.
- `src/app/sitemap.ts`: the indexable public pages on `PUBLIC_SITE_ORIGIN`. Legal pages are only included when published.
- The root layout description becomes product-accurate: "A strength training log that tells you, per lift, whether to progress, hold, or deload." The manifest's stale "single-user" description is corrected.
- No SEO package (RD-15).

## 12. Legal content

- `src/lib/legal/types.ts`: `Segment = string | { fact: OwnerFactKey }`, `Block = { kind: "p" | "h2"; content: Segment[] } | { kind: "ul"; items: Segment[][] }`, `LegalDoc = { kind: "privacy" | "terms"; title; status: "draft" | "published"; approval: { approvedBy: string; approvedOn: string } | null; blocks: Block[] }`.
- `src/lib/legal/facts.ts`: `OWNER_FACTS: Record<OwnerFactKey, string | null>`, all `null` in this run. Keys: `operatorName`, `contactAddress`, `effectiveDate`, `minimumAge`, `governingLaw`, `refundPolicy`, `retentionStatement`, `creatorDisclosure`.
- `src/lib/legal/privacy.ts`, `terms.ts`: the drafts' text with reviewer notes and brackets removed from the copy itself. Each bracketed owner decision is a fact token. Each verified-false claim is corrected to the code's truth, and each correction is listed in the runbook's reconciliation table. Examples: Storage also holds feedback screenshots; account deletion does not cancel a Stripe subscription; the campaign cookie is exactly `ovl_campaign`, 2 hours, `HttpOnly`, cleared on signup; no analytics vendor exists.
- `src/lib/legal/state.ts`: `legalPageState`, `unresolvedFacts(doc, facts)`, `validatePublished(doc, facts)` (throws if a published doc has unresolved facts or no approval).
- The rendered text never contains `[`/`]` bracket notes. A unit test scans every rendered segment.

## 13. Demo seed and screenshots

### CLI (`scripts/demo/`)

| File | Role |
| --- | --- |
| `fixture.ts` | `DEMO_FIXTURE_VERSION`, `DEMO_MESOCYCLE_MARKER`, gyms (Northside Strength, Riverside Fitness, fictional), exercises by library `sourceId`, two mesocycles, workouts (relative day offsets, gym, sets), one goal. No real identifiers. |
| `guard.ts` | `PRODUCTION_PROJECT_REFS = ["ycxvdiklpefyhdclxyau"]`. `assertSafeEnvironment(env)` throws `DemoSeedRefused` if `DATABASE_URL` is missing. It also throws if `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, or `DEMO_SUPABASE_URL` contains a production ref or a `supabase.co`/`supabase.com` host, or if the `DATABASE_URL` host is not loopback. Runs **before** any connection, in every mode. There is no override flag. |
| `seed.ts` | `inspectDemoTarget(base, userId)` → `{ state: "empty" \| "seeded" \| "conflict", counts, expected }` (reads only the target account's rows through its scoped client). `planDemoSeed`, `executeDemoSeed(base, account, fixture, anchor)` (one `$transaction`; writes via `createGym`, `createMesocycle`, `addSession`, `addSessionExercise`, `activateMesocycle`/lifecycle functions, `startOrResumeWorkout` with historical `scheduledFor`, `logSet`, `completeWorkout`, goal creation). |
| `cli.ts` | `--user-id <uuid>` (required), `--email <addr>` (optional cross-check against `auth.users`), `--anchor YYYY-MM-DD` (default today UTC), `--execute`, `--confirm-user <uuid>` (must equal `--user-id` on execute). Default is DRY RUN. It prints the target host, masked email (`d***@example.test`), fixture version, anchor, the state, and expected counts. It never loads `.env`. |
| `provision-local.ts` | Local-only helper. With `DEMO_SUPABASE_URL` (loopback) and `DEMO_SUPABASE_SERVICE_ROLE_KEY`, it creates the demo auth user through the Supabase Auth admin API (never SQL) and its profile through `establishProfile` (trial, tour, and release-seen exactly as signup). It refuses everything the guard refuses and refuses if the email already exists. It never deletes. |
| `capture.ts` | Playwright capture against a loopback `DEMO_APP_URL`. It signs in as the demo account through the login form, visits the storyboard routes, and saves light/dark × desktop (1280×800) / phone (390×844) PNGs to `public/marketing/screens/`. It refuses non-loopback URLs. |

Idempotency without schema: the target must be **empty** of training data (mesocycles, gyms, custom exercises, logged sessions, goals, planned cardio, cardio logs) to seed. It is **"seeded"** iff exactly one mesocycle pair carries `DEMO_MESOCYCLE_MARKER` (fixture version in the name) and the per-model counts equal the fixture's expected counts, in which case it is a no-op. Anything else is **conflict**, which aborts with nothing written. There is no delete or reset path. Re-capturing means provisioning a fresh local account.

### Fixture story (demo-v1)
"Demo Lifter", Upper/Lower 4 days a week. Block 1 (5 weeks, deload week 5) is archived. Block 2 (6 weeks, deload week 6) is active, with the anchor in week 4. That is about 8½ weeks of history at Northside Strength, with some Riverside Fitness sessions. On the anchor date the unchanged engine, evaluated by an integration test, must yield: Barbell Bench Press **Progress** (top of range two qualifying sessions running, e1RM not flat); Seated Cable Row **hold** (mixed); Overhead Press **Deload** (short of range twice); Chest Press Machine with **different working weights** at the two gyms (baselines from the real `applyBaselineOnCompletion`); a non-linear bench e1RM trend with a marked scheduled-deload week. If a value cannot be produced honestly, the fixture changes, never the engine.

### Storyboard (capture order, 5 steps)
1. Today (week 4, Upper A): calls beside each lift.
2. Logging card for Barbell Bench Press with "Last time".
3. Exercise page: Next time, "Ready to go up", with the evidence line.
4. Chest Press Machine at Northside, then at Riverside (gym selector).
5. e1RM trend with the deload week marked.

Each capture's provenance is written to `src/lib/marketing/screenshots.ts` and `docs/marketing/screenshot-provenance.md`.

## 14. Testing strategy

**Security / privacy (first)**
```text
GIVEN a signed-out request WHEN it targets each pre-existing protected route (/plan, /history, /settings, /log/start, /admin, /feedback …) THEN routeRedirect returns /login
GIVEN signed-out "/" THEN routeRewrite returns /welcome and routeRedirect returns null; GIVEN signed-in "/" THEN both return null
GIVEN each marketing path, signed in or out THEN no redirect
GIVEN a crafted call to startCheckout with STRIPE_BILLING_ENABLED unset THEN DomainError, provider never called (existing test kept green)
GIVEN a public page render WHEN signed in THEN no owned-model query is issued (page imports no data-layer module — static guard)
GIVEN account A signed up from /blizzy and account B organically THEN only A.signupCampaign = blizzy; B reading its own profile/export never sees A's
GIVEN a form field signupCampaign=blizzy without the cookie THEN the profile records null
GIVEN a tampered cookie ("BLIZZY.123", "other.123", "blizzy", "blizzy.abc", "blizzy.<future+1h>", "blizzy.<now-3h>") THEN parseCampaign → null and nothing is recorded
GIVEN the admin gate WHEN admin code updates signupCampaign THEN AdminScopeError (status stays the only writable field)
GIVEN the demo guard WHEN DATABASE_URL (or any listed var) contains ycxvdiklpefyhdclxyau or a supabase.co host, or a non-loopback host THEN DemoSeedRefused before connecting, in dry run and execute
```

**Happy path / integration**
```text
resolveCta: all 12 combinations match design §6.9 exactly; no combination with billing off yields a /settings/billing or Subscribe action; closed never yields /signup
/changelog and /settings/whats-new render the same ids, order, dates, titles, bodies (render both, compare)
Visiting /changelog signed in changes no ReleaseSeen row (page reads no account data — static import guard)
Signup with a valid cookie → Profile.signupCampaign = blizzy; cookie deleted; second signup in the same browser without revisiting → null
Export includes signupCampaign; account deletion removes the profile (existing deletion suite green)
getBillingScreen: promoReminder = BLIZZY only when canSubscribe and (profile campaign or hint); null with billing off
Demo seed (embedded Postgres): dry run writes nothing (row snapshot equal); execute creates exact expected counts; second execute is a no-op; conflict account (has a gym) aborts with nothing written; wrong --confirm-user aborts; other accounts' rows unchanged (snapshot); every LoggedSet came through logSet (no direct loggedSet.create in scripts/demo — static guard); engine on the anchor yields Progress/hold/Deload as specified; Chest Press baselines differ by gym
```

**Validation / edge**
```text
legalPageState: draft in production → finalizing; draft elsewhere → draft-preview; published with any null fact → throws (CI); no rendered segment contains "[" or "]"
Release notes public-safety: no entry body/title contains an email, URL, "admin", "allowlist", "webhook", "RLS", "migration", "OVE-", "Stripe test"
Screenshot manifest: every non-null source file exists under public/; every entry provenance.synthetic === true and names DEMO_FIXTURE_VERSION
Marketing copy banned-phrase check over src/app/(marketing) and src/lib/marketing copy constants (design §6 list; no "!" in copy strings; no plan import mention)
robots: production allows public pages and disallows app routes; non-production disallows all; sitemap lists only indexable pages on PUBLIC_SITE_ORIGIN
```

**UI behavior** (component tests): `CopyCode` copies and announces, and shows the failure path. `ModeCta` renders the resolved labels. Pending frame renders when sources are null. Legal draft alert renders in draft-preview.

**Regression:** full unit and integration suites. Account-isolation guards (`account-isolation-guards`, `account-scope`), invariant guards, admin privacy, billing (webhook signature and idempotency), and export coverage stay green. Signup suite extended, not weakened.

**Manual / unverified (runbook):** real mobile Safari/Chrome rendering, production canonical/robots on the live host, real Stripe Checkout with BLIZZY in test mode on a preview with `STRIPE_BILLING_ENABLED=true`, legal review.

## 15. Acceptance criteria

**CTA truth (P21-AC1, PRD AC1)**
- [ ] Every public CTA comes from `resolveCta`, and the 12-combination test passes.
- [ ] With billing off, no public page renders Subscribe/Pay, and `startCheckout` refuses a crafted call before Stripe.
- [ ] Closed mode renders no signup action and no waitlist. Invite mode states that an invite code is required.
- [ ] Signed-in `/` is Today, and every public page offers "Open Overload". No redirect loop (routing tests).

**Shared release notes (P21-AC2, PRD AC2)**
- [ ] `/changelog` and What's New render identical entries from `orderedReleaseNotes()`, and the public-safety test passes.
- [ ] ReleaseSeen and unread behavior are unchanged (existing What's New suites green). The new entry is non-significant.

**Demo seed and imagery (P21-AC3)**
- [ ] The seed CLI is dry run by default, loopback-only, hard-refuses the production ref, idempotent, and writes `LoggedSet` only via `logSet`, with tests green on embedded Postgres.
- [ ] Screenshots are captured from the seeded local stack, or the landing shows pending frames and the report marks capture blocked. The manifest records synthetic provenance.
- [ ] The storyboard (5 steps) is delivered.

**Public pages and promo handoff (P21-AC4)**
- [ ] Landing, pricing, `/blizzy`, `/changelog`, and `/support` are reachable signed out. Privacy and terms routes exist with the publication gate.
- [ ] `/blizzy` states the five conditions with no counter. The code is copyable. The reminder appears on Plan & Billing only when Subscribe is available. Nothing pre-applies a discount, and annual is untouched.

**Legal drafts (P21-AC5)**
- [ ] Both documents are integrated as reviewable content. Production renders "being finalized" until owner facts and approval are recorded. The reconciliation checklist is in the runbook. No claim of legal approval anywhere.

**Accessible mobile web (P21-AC6)**
- [ ] One `h1` per page, landmarks, skip link, alt text, AA contrast via tokens, 44 px targets, no hover-only actions. Layouts match the preview at 390 and 1280.

**Attribution (P21-AC7)**
- [ ] No-campaign, tampered, expired, repeat-visit, and cross-account tests pass. The cookie holds only the campaign and issue time. Provenance is written once, server-side.

**Copy (P21-AC8)**
- [ ] The claim → evidence → CTA ledger is in the runbook. The banned-phrase check passes. There are no invented metrics or testimonials.

## 16. Explicit non-goals

- ❌ Opening public signup or enabling live billing from this pitch. **Permanent for this pitch** (human launch steps).
- ❌ A pre-applied or page-authorized discount, a redemption counter, or scarcity UI. **Permanent.**
- ❌ Third-party analytics, pixels, embeds, or a server-side visitor record. **Permanent unless a pitch decides it.**
- ❌ A second changelog source or CMS. **Permanent.**
- ❌ Testimonials, a blog, A/B tests, a waitlist. **Deferred** (needs its own pitch).
- ❌ A hosted interactive demo (Navattic/Supademo). **Deferred** (owner decision plus privacy review).
- ❌ Native app pages, store badges, deep links. **Deferred** (iOS postponed).
- ❌ Program generation, AI coaching, social features, ads. **Permanent.**

## 17. Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | Canonical artifact stem `20-public-landing-page-changelog` | repo numbering is roadmap − 1 since iOS Foundation's postponement (18 = Public Accounts, 19 = Billing). No prior artifact or milestone existed | run prompt ("inspect … use that stem"); existing repo convention |
| RD-2 | Web-only. No Capacitor, iOS, or `overload-cross-platform` invocation. Native checks not run, not claimed | owner postponed iOS | pre-resolved decision 1 |
| RD-3 | Cherry-pick the owner's kill switch `cddd220` onto this branch, unchanged | CTA truth and the crafted-call guarantee depend on a server switch that `main` lacks. It is owner-authored and tested, and adds safety without weakening anything | pre-resolved decisions 3 and 10; CLAUDE.md (billing enforcement on the server) |
| RD-4 | Signed-out `/` is rewritten to `/welcome` (landing). Signed-in `/` stays Today. Marketing paths are public in both states | keeps the app entry and no loops. URL stays `/` for SEO | pre-resolved decision 2; pitch rabbit hole 1 |
| RD-5 | CTA matrix per design §6.9. Fail closed. No waitlist or email capture in any mode | truthful CTAs | pre-resolved decisions 3 and 10 |
| RD-6 | Billing-on Pro CTA routes to existing `/settings/billing`, never opens Checkout from a public page | reuses the email-verified Checkout path, no new payment mechanism | pre-resolved decisions 3 and 10 |
| RD-7 | BLIZZY handoff = copyable code on `/blizzy` and on Plan & Billing (monthly only, when Subscribe is available) plus Stripe's own promo field. No `discounts` pre-application | checkout exposes `allow_promotion_codes` (monthly only). Pre-applying needs a promotion-code lookup and changes billing semantics. Limitation reported | pre-resolved decision 5 (fallback clause) |
| RD-8 | Campaign cookie `ovl_campaign`: allowlist `["blizzy"]`, value `campaign.issuedAt`, HttpOnly, Lax, 2 h (`Max-Age` plus server check), set by the proxy on GET `/blizzy`, cleared after signup | session-scale first-party handoff that survives signup → verify → billing within one sitting. Holds no identity. Tamper-proofing is unnecessary because forging it equals visiting `/blizzy` | pre-resolved decision 9. **Bucket C: 2 h is a guess, flagged for owner review** |
| RD-9 | Provenance stored as nullable enum `Profile.signupCampaign`, written once at profile creation from the validated cookie. Migration `9k_signup_campaign` (additive). No visitor-level record | answers "which campaign led to an account" with one value on an already-owned, RLS-closed row. Export and deletion automatic | pre-resolved decision 9; CLAUDE.md first invariant. **Owner privacy item: retained for the life of the account** (OQ-3) |
| RD-10 | Admin Overview shows one aggregate: signups from BLIZZY. `signupCampaign` added to admin-readable Profile metadata, not writable | gives the owner the answer without SQL. Metadata/aggregate only | CLAUDE.md admin boundary |
| RD-11 | Changelog lists every catalog entry. Existing 10 entries reviewed and public-safe. CI public-safety scan added. No `public` flag | the catalog contract already requires public-safe content (What's New R21). A flag would invite a second editorial path | pre-resolved decision 6 |
| RD-12 | Legal pages: three states (published / draft-preview off-production / finalizing in production), fact tokens, `noindex` until published, validation fails the build if a published doc has unresolved facts | never publish draft as policy, while letting the owner review in place | pre-resolved decision 8; P21-AC5 |
| RD-13 | Creator disclosure placed directly under the offer, in draft wording "This is a promotion for Overload offered through the creator BLIZZY." as owner fact `creatorDisclosure`. The draft wording renders until the owner sets it | visible next to promotional copy. Doesn't assert an unknown compensation fact | pre-resolved decision 8 |
| RD-14 | Hero concept A chosen. B → section 2, C → section 4 | core job, true for every visitor | pre-resolved decision 8A; design §6 |
| RD-15 | SEO via Next metadata, `robots.ts`, `sitemap.ts`. Canonical origin constant `https://www.overloadtraining.app`. Robots allow only in `VERCEL_ENV=production`. No SEO package | built-in conventions | pre-resolved decision 11 |
| RD-16 | Demo seed: loopback-only for every mode, hard production-ref and `supabase.co` refusal before connecting, no override flag, never loads `.env`, explicit `--user-id` + `--confirm-user` on execute, empty-or-fingerprint idempotency, no delete path | the repo `.env` points at production. Any remote target is out of scope for this pitch | pre-resolved decisions 7 and 12; Appendix A |
| RD-17 | Seed writes through app write modules (`startOrResumeWorkout` with historical `scheduledFor`, `logSet`, `completeWorkout`, plan/gym/goal modules) in one transaction. The unmerged `chore/dev-scenario-seeding` is not reused | CLAUDE.md Layer 1. That branch predates multi-user and writes `LoggedSet` directly | CLAUDE.md second invariant; Appendix A item 5 |
| RD-18 | ~~Local provisioning helper via the Auth admin API~~ **Amended in OVE-101:** the demo account is created through the app's own `/signup` page on the loopback stack (`npm run demo:capture -- signup`), which is Appendix A's *preferred* path. The admin-API helper could not load the profile module outside Next. Never deletes. | Appendix A allows it in a genuinely isolated environment | Appendix A item 2 |
| RD-19 | Screenshots served as static files under `public/marketing/screens/` via plain `<img>`/`<picture>`, plus a typed manifest with provenance | no image service needed. Explicit dimensions avoid layout shift | design §6; pitch AC3 |
| RD-20 | No tour step. One non-significant release note | design §13 | `overload-onboarding` |
| RD-21 | Header uses the existing `OverloadLockup` instead of the preview's placeholder mark | the repo has a real brand mark. The skill's "no logo" line predates it | existing code |
| RD-22 | Settings gains a footer line Changelog · Privacy · Terms | signed-in lifters need the legal pages reachable | design Screen 8 |
| RD-23 | Account deletion does not cancel a Stripe subscription. Stated truthfully in the terms draft and flagged for Pitch 23, not fixed here | changing billing behavior is out of scope | pitch out-of-bounds; CLAUDE.md scope |

## 18. Open questions (owner; none block implementation)

1. **Legal facts and approval** (blocking *publication* only): operator legal name, contact address, effective date, minimum age (and whether signup must enforce it), governing law and dispute terms, refund position, retention statement, creator disclosure wording, and qualified legal review. Default: legal pages stay "being finalized" in production.
2. **Marketing copy sign-off:** every headline and caption in the claim ledger is a draft until approved.
3. **Attribution retention:** `signupCampaign` lives as long as the account. Confirm, or choose a shorter retention (would need a pitch, since no scheduler exists by design).
4. **Campaign cookie lifetime** (Bucket C: 2 h).
5. **Production signup mode** could not be read from this run (no Vercel access). The CTA logic covers all three values. Confirm the value in the runbook.
6. **Deletion vs. active Stripe subscription** (RD-23): decide the behavior before paid launch (Pitch 23).
7. **Hosted interactive demo** (Navattic/Supademo): adopt or not. Any embed needs a privacy notice update.

## 19. Future considerations

- A new campaign is one enum value (migration) plus one allowlist entry plus one page. Nothing else changes.
- When Plan Import ships (Pitch 22), its landing section and Pro list entry are a copy change gated on the `plan_import` capability actually being wired.
- If the owner later approves a production demo account, the runbook's separate operator procedure applies. The normal `--execute` path cannot reach it.
