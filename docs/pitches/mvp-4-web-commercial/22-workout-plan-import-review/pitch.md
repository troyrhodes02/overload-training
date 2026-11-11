# Overload — Pitch 22: Workout Plan Import & Review

> Version-controlled copy of the approved Linear product pitch (Overload V1 project,
> document `31c72704a9a8`). Retrieved in full on 2026-11-07 for the Pitch 22 pipeline run.
> Companion technical authority lives at `docs/pitches/mvp-4-web-commercial/22-workout-plan-import-review/extraction-blueprint.md`.

**Type:** Feature (complete vertical slice)
**Appetite:** **L** — deliberately expanded from the original text-only pitch to include documents and images; no separate "backend-only" pitch
**Platform:** Next.js web application, including mobile browsers; native iOS/Android deferred
**Plan placement:** Named **Pro plan-import capability**; active 14-day Pro trials and qualifying comp/subscription entitlements may use it; Free accounts retain every existing logging/history/export capability
**Status:** Owner-directed expanded scope; ready for the design → UI preview → spec pipeline, **not approved for production AI enablement**

**Product authority:** Overload Product Brief; PRD → **Workout Plan Import & Review**; Pitch Roadmap → **Pitch 22**; Architecture; `CLAUDE.md` and established specs for Split & Mesocycle Setup, Exercise Library, Public Accounts and Plans & Billing. This pitch explicitly expands the roadmap's original text-only boundary. **Companion technical authority:** *Overload — Pitch 22: Document Intake & Extraction Technical Blueprint* (separate Linear project document). The two documents are meant to be read together, not pasted into one giant pitch.

---

## 1. The problem

A lifter has already done the work of writing a program—often in Notes, a PDF from a coach, a screenshot, or a photo of a paper template. Retyping every training day, exercise, set and rep target into a new tracker is tedious and error-prone. That friction can stop the lifter from using Overload before they ever log a set.

The job is **migration, not programming**: translate what the lifter already wrote into Overload's existing plan structure, preserve uncertainty, make the entire interpretation editable, and only create the plan after the lifter has approved it.

Overload helps a self-programming lifter understand progression from *their* logged work. It is not an AI trainer; this feature must not propose an exercise, training split, loading scheme, or program the source did not contain.

## 2. The bet and appetite

**Bet:** A lifter can bring a recognizable plan into Overload in one short import-and-review journey rather than reconstructing the plan by hand. The import helps conversion during the 14-day, card-free Pro trial without trapping plan data behind Pro later.

**Appetite: L, consciously accepted.** Moving from pasted text to five common input forms increases file security, multimodal extraction, cost, and error handling. Keep it one end-to-end pitch with vertical implementation tickets: every source must reach the **same review-and-confirm flow**. If complexity expands, cut optional polish, broad document-format coverage, and automation—not ownership checks, source fidelity, confirmation, or cost limits. A separate platform or reusable "document AI framework" is not an acceptable side project.

## 3. Solution shape

### 3.1 One import entry point; five source cases

The lifter opens **Import existing plan** from the appropriate plan-creation surface and chooses one or more of:

1. **Paste text** from a notes application or message.
2. **Upload a text-based PDF** containing a training plan.
3. **Upload a scanned PDF** whose plan is present as page images.
4. **Upload one or more screenshots** of a digital plan.
5. **Upload one or more photos**, including a photographed handwritten plan.

On mobile web, file selection and the device's supported photo picker should work without a native app. A mixed set of source parts may be accepted where this helps reconstruct one plan (for example, several ordered screenshots). Unsupported formats must be clearly refused, not silently interpreted as something else. The design/spec will choose concise labels, controls, and how to reorder or remove parts.

### 3.2 Extract only what the source contains

Overload proposes the plan title (if supplied), training day names/order, exercise sequence, sets, reps/rep ranges, weights or percentages, rest/tempo/notes where visible, and explicit supersets/groupings when present. It preserves the **verbatim source** and distinguishes:

* **Present and legible** — a defensible extracted observation.
* **Missing** — no corresponding content appears; leave blank.
* **Ambiguous or unreadable** — show the source and ask the lifter.
* **Derived mechanically** — a transparent normalization, e.g., turning written `3×8` into a three-set prescription; never quietly adding training advice.

A messy document should produce a **partial, reviewable draft**, not a confident but invented plan. A non-workout document should produce a clear "couldn't identify a workout plan" state without creating anything.

### 3.3 Exercise matching and corrections

The extracted exercise name is first presented as written. Overload matches it to the existing shared library using deterministic, account-safe matching. Clear matches can be preselected; ambiguous matches show choices; unknown movements can become custom exercises only after the lifter explicitly chooses to create them. No model-produced exercise ID is trusted. The existing exercise ownership and soft-delete rules remain intact.

### 3.4 Full review before creation

The review shows the **source alongside the proposed plan**, or an accessible source toggle on small screens. The lifter can review, edit, reorder, remove, and resolve every item; see specifically what was unclear; and replace any wrong exercise match. Missing required plan details are blocking and must be supplied deliberately. Optional unknown details remain absent. The action is labeled **Create plan** only when the draft is confirmable.

**No permanent plan, scheduled session, or custom exercise is created before this confirmation.** Temporary private import state is allowed solely to enable review, error recovery, and deletion; it is not a training plan.

### 3.5 Confirm through the existing plan-creation path

Confirmation reuses the same authoritative plan-creation behavior as manual setup; it must not introduce a rival writer that bypasses the current split/mesocycle invariants. Duplicate clicks and retries must not create duplicate plans. Imported prescriptions are **planned work**, never fabricated completed workouts or logged sets. Existing plans, history, gym baselines, and goals must not change.

### 3.6 Reliable, quiet failure handling

The user sees meaningful states: preparing, extracting, ready to review, needs clarification, retryable failure, blocked by usage cap, and complete. An interrupted browser session can safely resume or retry without duplicate processing or an orphaned plan. If the original source is too blurry, too large, encrypted, not a plan, or the model is unavailable, say so without invented details.

### 3.7 Pro entitlement and respectful upgrade experience

Use the existing **named plan-import capability**, enforced on the server before any user upload/storage reservation or paid model call. Paid Pro, active trial, or valid comp grants access. Free users receive only the established quiet, dismissible upgrade note and can still manually build/edit plans, log sessions, see history, and export. Expiry or downgrade must never delete a successfully imported plan.

### 3.8 Resource guardrails, privacy, and deletion

The import is intentionally bounded: input-size/page/type limits, per-account frequency and daily import quotas, an owner-set global monthly AI budget, an emergency server-side kill switch, sensitive-file handling, and time-limited source/draft retention. Uploaded sources and inferred drafts are private, never used in public previews or admin content views, and removed promptly on confirm, discard, or expiry. Raw uploads are not marketing material.

## 4. User journey (representative)

A lifter opens the import tool during the Pro trial, selects two screenshots of a four-day program, orders them correctly, and starts extraction. Overload recognizes each day and the written prescription, but flags `DB row` as a close match between two exercises and leaves an illegible weight blank. In the review, the lifter chooses the intended exercise, enters the missing weight if they wish, corrects a rep range, and creates the plan. The plan appears in the normal Split & Mesocycle experience and is editable there. The original screenshots and temporary draft are deleted according to the published retention behavior.

If the lifter closes the tab while processing, they can return to a recoverable import state or retry. If they leave the draft unfinished, it expires and is removed; no partial plan appears. If their trial expires after successfully importing, the plan remains theirs and normal workout logging continues on Free.

## 5. Included scope (feature contract)

* One entry/flow serving pasted text, text PDFs, scanned PDFs, screenshots, and photos of existing plans.
* Multi-page and ordered multi-image understanding where a single existing plan spans multiple source parts.
* Source-grounded structured extraction, strict validation, visible uncertainty, and no program generation.
* Account-private staging of the source and proposed draft; an editable review experience including source evidence.
* Existing-library matching, ambiguity selection, and explicit custom-exercise creation where necessary.
* Single confirmed creation via existing plan-making invariants; idempotent confirm and safe retry.
* Account/capability enforcement, privacy and retention, size/usage/cost limits, safe disable.
* Accessible, responsive mobile-web flow; actual native iOS not required.
* User guidance using existing tour/What's New conventions; instrumentation limited to privacy-safe operational counts and provider spend.
* Security, regression, real-provider fixture evaluation, documentation, and an operator runbook.

## 6. Explicit exclusions

* **No AI program generation, coaching, training recommendations, inferred missing sets/loads, or automatic changes to a lifter's program.**
* No importing completed performance history, logged sets, PRs, body measurements, or another app's account data; no conversion of a planned weight into a completed logged set.
* No spreadsheet (`.xlsx`/`.csv`) import, web link scraping, Google Drive/Apple Notes integrations, email forwarding, video input, audio transcription, or broad document management.
* No native iOS/Android shell, Camera API integration, App Store flow, or native in-app purchase work. Phone browser file/photo selection is sufficient.
* No cross-account plan sharing, public uploaded plans, publicly accessible demo-source files, or admin inspection of private training content.
* No new LLM-chat screen, chat history, RAG/vector database, custom OCR SaaS by default, general-purpose agent orchestration platform, or elaborate queue fleet.
* No auto-creation of a workout plan from an unfinished draft and no user-generated source ever treated as trusted model instructions.
* No production deployment, API credential changes, real-user uploads, production migration, or model-spend activation by the unattended pipeline.

## 7. Dependencies and operational truth

**Depends on already shipped capabilities:** Public Accounts + verified email/auth; Free/Pro entitlements and trial/comp resolution; Split & Mesocycle Setup; Exercise Library; plan-creation server actions; account-owned Prisma access and deny-all RLS; onboarding guidance.

**Environment constraint:** During recent cutover the Supabase project ref `ycxvdiklpefyhdclxyau` was confirmed as Production and used from local/Preview. Treat any connection to it as live. New schema/migrations may be authored and verified using isolated embedded/local Postgres, **never applied by the run to the shared/production database**. Do not run upload/AI end-to-end testing there.

**Commercial constraint:** Production `STRIPE_BILLING_ENABLED=false` and signup restricted until Launch Readiness. Plan import is an entitlement-gated capability, not a new billing flow. Don't enable live checkout, public signup, or a new pricing tier.

**Platform constraint:** Native iOS is intentionally postponed; responsive mobile-browser support is in scope. Document the existing roadmap's iOS dependency conflict as an upstream amendment, not a reason to build native work in this pitch.

**Technical companion:** The separate **Document Intake & Extraction Technical Blueprint** provides the preferred engineering patterns and guardrails. It is binding implementation direction where compatible with this pitch, the repository's actual architecture, and `CLAUDE.md`. The design/spec stage must check that compatibility rather than adopting hypothetical database tables or API paths blindly.

## 8. Definition of done and traceability

The PRD currently states three acceptance criteria for **Workout Plan Import & Review**, and the original roadmap adds the guardrails. The added media-specific acceptance criteria below are **explicit owner-approved scope expansion**, not claims that the older PRD already listed files.

| ID | Acceptance criterion | Source |
| -- | -- | -- |
| **P22-01** | A normal pasted workout plan becomes an accurate, editable proposed plan with the right days, ordering, exercises, and prescriptions. | PRD AC1; roadmap DoD |
| **P22-02** | Text-based PDF, scanned PDF, screenshot(s), and photo(s) can each produce the **same reviewable draft shape**; errors and low-quality sources are handled without invented content. | Owner-approved expansion |
| **P22-03** | Every extracted fact is linked to defensible evidence/source position when available; source instructions never change model/system behavior. Missing/unclear content remains visibly unresolved. | PRD edge case; roadmap Includes |
| **P22-04** | The lifter can correct all extracted fields, resolve exercise matches, choose custom exercises, and explicitly confirm. Unconfirmed/abandoned sessions never create a permanent plan; stale files/drafts are removed within the approved retention policy. | PRD AC2; roadmap DoD |
| **P22-05** | Confirmed imports use the established plan-creation path, appear correctly in Split & Mesocycle Setup, and are idempotent on retries. Existing logged sets/baselines/history are unchanged. | Existing architecture/invariants; necessary expansion |
| **P22-06** | Free is denied through direct server calls; active Pro/trial/comp can import. After lapse, imported plans remain usable on Free under existing Free capabilities. | Plans & Billing, account/privacy invariants |
| **P22-07** | Server-side rate/usage limits, file caps, owner-configured monthly model budget, kill switch, and real timeout/retry controls stop abuse or runaway spend; disabled/unconfigured mode fails cleanly. | PRD AC3; roadmap guardrails |
| **P22-08** | Account A cannot learn about, read, alter, confirm, or download account B's import/file/draft. RLS denies direct access; no admin surface exposes raw uploads or plans. | Account Ownership & Isolation; `CLAUDE.md` |
| **P22-09** | Mobile-browser and desktop import/review flows are accessible and understandable; the UI preview is faithfully implemented; user guidance and What's New are updated. | Feature journey + UI-bearing workflow |
| **P22-10** | Realistic synthetic fixture evaluation covers all five source cases, ambiguous/handwritten plans and failures, reports measured accuracy, cost and latency; tests separate mocked from real-provider evidence. | Expanded format risk + verification honesty |

**Ship gate:** P22-01 through P22-10 must either have evidence or be openly marked **unverified/blocked**. Do not call untested handwriting or production deletion behavior "passed." The feature PR stops before merge. Owner reviews its cost/retention settings and the runbook before any deployment or live usage.

## 9. Risky rabbit holes and no-gos

1. **"Helpful" invention.** Filling a missing weight or adding a common accessory movement seems user-friendly but violates the entire trust model. Missing is missing.
2. **"Just save the draft as a plan."** This bypasses user confirmation and risks partial state. All imported interpretation stays temporary until explicit approval.
3. **"A model knows the exercise ID."** Matching is a deterministic, validated catalog operation. Ambiguity is shown, not hidden.
4. **"Uploads are harmless."** Untrusted files can be mislabelled, oversized, cross-owned, or contain prompt injection. Server validation and per-user storage boundaries are mandatory.
5. **"The background callback will finish."** Vercel can interrupt in-process work. Processing must have durable state and an explicit recovery path; do not depend on a naked fire-and-forget job.
6. **"One schema fits every periodization plan automatically."** Preserve the existing Overload semantics; anything that cannot map faithfully stays in review and may require manual re-entry instead of inventing a new program model.
7. **"AI spend is negligible."** Photos and multi-page scans can be costly. Fail closed if a mandatory budget configuration is absent.
8. **"We can test using Preview."** Preview may share the production database. Use isolation, fixtures and mocks instead; no production data mutation.

## 10. Required human decisions / pipeline handoff

1. **Global monthly AI spend cap:** the owner sets the dollar budget. The implementation may provide an environment-configured limit but must default to **imports disabled** if the required limit is missing. Do not select the owner's spend risk appetite on their behalf.
2. **Data practices:** confirm uploaded-photo/PDF retention (standing engineering target: delete unconfirmed state within **24 hours**; delete confirmed/discarded raw sources promptly), exact model-provider processing terms, and final Privacy Policy disclosures before enabling real-user uploads.
3. **Format and operational caps:** technical blueprint supplies conservative candidate caps; Claude must validate them against the actual Vercel plan, provider constraints and real-world training templates, record any changes, and surface guessed numeric defaults for owner review.
4. **Manual real-provider evaluation:** obtain synthetic/nonpersonal fixtures, enable a limited sandbox/testing budget only with owner authorization, record provider costs/quality. No production account is used.
5. **Release approval:** review the produced UI, gate, retention, and model provider, then approve the feature PR/migration and staged release separately. The automated pipeline must **not merge**.

## 11. Separation of responsibilities

* **This pitch:** what the lifter experiences, the bounded user value, non-negotiable safety rules, and acceptance criteria.
* **Companion technical blueprint:** preferred normalization, model orchestration, schemas, state management, storage and authorization architecture, tests and operational controls. These are guidance requiring inspection of the actual Overload codebase.
* **Design doc:** screen design, journey, responsive flow, evidence/uncertainty and recovery UX.
* **UI preview:** implementation-grade visual contract for representative states.
* **Spec:** exact repository-native schema, server actions, data flow, limits and integration points grounded in the real code; documents approved deviations from the blueprint.
* **Runbook:** manual provider setup, owner-defined budget, retention/privacy approval, isolated evaluation, production migration and safe rollback, and all deferred launch tasks.
