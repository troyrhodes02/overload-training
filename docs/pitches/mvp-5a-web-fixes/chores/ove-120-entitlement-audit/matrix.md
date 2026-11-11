# OVE-120 — Free/Pro entitlement matrix

The audited boundary as of this chore. Free records everything; Pro interprets it. The authority is the Plans & Billing spec (`docs/pitches/mvp-4-web-commercial/19-plans-billing-promo-codes/spec.md`, sections 5, 6, 9 and RD-1). Server code checks capabilities, never a plan name. The capability set is resolved on every read from stored rows by `resolveEntitlement` (`src/lib/entitlements/resolve.ts`) and is never taken from the client.

## Pro capabilities

| Capability | What it covers | Server enforcement | Web surface | Proving tests | Status |
| --- | --- | --- | --- | --- | --- |
| `progression_insights` | Progress, hold, and deload calls; the suggested load; the explanation and evidence; the stall gate; RIR qualifiers; the scheduled-deload 90% load line | `gatePlanned`, `gateOccurrence`, `gateSessionSummary`, `gateHistory` (`src/lib/entitlements/gate.ts`), applied inside `getPlannedProgression`, `getOccurrenceProgression`, `getSessionProgressionSummary`, `getExerciseHistory` | Today list, logging card, day-complete summary, exercise page "Next time" | `entitlement-audit.int` (matrix, serialization), `billing-gating.int`, `gate.test` | Correct. **Fixed:** the summary's marker never fired on Free |
| `e1rm_trends` | e1RM and weight trends, the projected-RIR overlay, best e1RM record | `gateHistory` | Exercise page trend and records | Same, plus `upgrade-note.test` | Correct |
| `exercise_history_intelligence` | Per-session calls, the rep-record frontier | `gateHistory` | Exercise page session list and records | Same | **Fixed:** rep records reached Free |
| `plan_import` | Workout Plan Import & Review | `requireCapability` + kill switch in `guardImport` (every action in `src/app/(app)/plan/import/actions.ts`), `confirmImport`, and the `/plan/import` page | `/plan` entry, `/plan/import` | `plan-import-gating.int`, `entitlement-audit.int` (forged flags, switch off), `isolation/import.int` | Correct. **Fixed:** Free was offered import while it was switched off |

## Free (never gated)

| Feature | Where it is verified |
| --- | --- |
| Plans, splits, mesocycles, sessions | No capability check on any plan write path. `entitlement-audit.int` keeps the mesocycle through a downgrade |
| Exercise library and custom exercises | No capability check |
| Gyms and the gym used in training | No capability check |
| Logging, editing sets, RIR entry, swaps, completing a workout | `entitlement-audit.int` ("a Free account records and corrects training data") |
| Logged history: every set, weight, reps, and RIR | `entitlement-audit.int` (Free read shows every set and RIR; a downgrade leaves the rows byte-identical) |
| Best set, heaviest set, bodyweight most reps, reps trend (reps-only lifts) | `gate.test`, `upgrade-note.test` |
| The not-enough-history line | `gate.test`, `entitlement-audit.int` (identical on both plans) |
| Goals and goal progress, including the e1RM used for it (spec section 5) | Goals read through `getQualifyingSessionE1rms`, which is ungated by design |
| Cardio, export, account, appearance, support, account deletion | No capability check. The export serializes raw records only, with no derived insight |
| The logging card's prefilled weight | The last working weight (Faster Logging UX), not a progression suggestion |

## Plan states

Covered one by one in `entitlement-audit.int` through the real read path, and in `entitlements.test` at the resolver.

| State | Access |
| --- | --- |
| Trial within 14 days | Pro |
| Paid monthly, paid annual | Pro |
| Comp, open-ended or dated and running | Pro |
| Trial expired, no subscription | Free |
| Canceled, paid through the period | Pro until `currentPeriodEnd` |
| Canceled, period over, deletion webhook late | Free (**fixed**: was Pro indefinitely) |
| Canceled, unpaid, incomplete | Free |
| Payment failed, within the 7-day grace | Pro |
| Payment failed, grace over | Free |
| Comp expired or revoked | Falls back to any remaining source (trial, subscription), otherwise Free |
| Renewing subscription past its period end (renewal webhook late) | Pro: Stripe renews it, so a paying lifter is never cut off on a late `invoice.paid` |

## The upgrade marker

`locked` on a DTO is set only when a Pro result was actually withheld. A Free account with no history, or not enough of it, gets the same empty or not-enough-history state as a Pro account, and no upgrade note. Every surface uses the one `UpgradeNote` component (`src/components/billing/upgrade-note.tsx`). It is dismissible per surface, never rendered on the server, and links "Explore Pro" to `/settings/billing`.

## Mobile API

None exists on `staging`: the only route handler is the Stripe webhook. When the versioned mobile API is built, every endpoint that returns progression, trend, record, or session-call data must call the same `get*` read functions above, which already gate. It must not re-derive Pro fields or accept a plan or capability from the request. A Free response must be the same withheld DTO the web receives, including `locked`.
