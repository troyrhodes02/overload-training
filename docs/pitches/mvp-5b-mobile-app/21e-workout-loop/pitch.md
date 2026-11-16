# Pitch 21e — Workout Loop

> Source: the approved expansion in Linear, "Pitch 21e — Workout Loop" (Overload V1 project document, updated 2026-11-15). It is copied here unchanged in substance for the pipeline run of 2026-11-15, and it expands `docs/planning/mobile-roadmap.md` → "21e — Workout Loop (L)". Where the audit (`docs/planning/mobile-audit.md`) disagrees with the current code, the code wins: the audit's "21d — workout loop" endpoint table is this slice under the roadmap's later numbering.

**Milestone:** MVP 5B — Mobile App (`mvp-5b-mobile-app`)
**Parent:** Pitch 21 — React Native + Expo Mobile App
**Appetite:** L — Large
**Type:** Feature — first complete native training vertical slice
**UI-bearing:** Yes — native iOS design required
**Client scope:** Native iOS, with supporting mobile API work in the existing web backend
**Plan placement:** Free — workout capture and all-time history
**Prerequisites:** Pitches 21a–21d, including the Production release of 21d; Prescription-Aware Intelligence merged into `staging` (both done: `main` 8e71d35, `staging` 7d58c3a)
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21e-workout-loop/`

---

## 1. Problem

Overload's native iPhone application has authentication, secure sessions, navigation, appearance settings, development builds, and staging updates. But its core training screens remain placeholders. A lifter can sign in on their iPhone but cannot record a strength-training session; they must open the web application to log their sets.

Workout logging is the product's primary daily interaction and the source of the performance history that decides progress, hold, or deload. The native application needs a complete workout from start to finish before further mobile features are worthwhile. This pitch replaces the Today and History placeholders with the first functional native training experience.

### Updated backend context

Prescription-Aware Intelligence changed how the shared backend selects historical working weights and progression evidence when the same exercise appears in different recurring workouts.

- **Saturday — Push:** Barbell Bench Press, 3–5 reps, last comparable working weight 255 lb.
- **Wednesday — Upper:** Barbell Bench Press, 6–8 reps, last comparable working weight 230 lb.

When Wednesday's workout is opened, the native app must not use Saturday's 255 lb because both workouts contain the bench. If Wednesday has comparable history it receives Wednesday's trusted weight; if not, its weight input stays empty, with other history shown as reference only.

**The native application does not decide which historical performances are comparable. The backend and shared business logic own that decision.** This changes the logging integration contract, not the scope of 21e.

### Desired outcome

A lifter can complete a normal planned strength workout entirely on their iPhone: start, log, resume, finish, and review it. The session is immediately consistent with the web application's records, and every prefill and reference respects the backend's Prescription-Aware Intelligence behavior.

## 2. Appetite

**Large (L).** Today's workout, starting and resuming a logged session, recording multiple exercises and sets, completing the workout, a short summary, all-time history, the native UI on the account-scoped backend, and correct trusted-weight, reference-only, and no-weight states. They depend on each other to form a useful loop.

The appetite does not authorize rebuilding every web logging feature or reimplementing Prescription-Aware Intelligence in the app. If the work threatens to exceed L, preserve the ability to complete a normal planned strength workout and defer supporting capabilities to their roadmap slices. Do not split this pitch into backend and frontend pitches; the loop is implemented and verified end to end.

## 3. Solution shape

### A. Today — a real native workout dashboard

Replace the Today placeholder with a functional dashboard. When today's planned session is pending, that workout is the primary action. The lifter sees the date in their account's time zone, the planned session, its exercises with planned set counts and target rep ranges, whether it is pending, in progress, or complete, and a clear action to start or resume.

Follow the web's scheduling semantics; never derive a schedule in the app. After completion, Today stops presenting the workout as unfinished and does not advance to tomorrow's workout. A completed day, a rest day, and an account with no active plan each get a native state. The existing Today tab becomes functional; no competing workout home.

**Prescription-aware integration.** Today uses the backend's representation of the planned session and its existing logged occurrence. It never infers recurring-workout identity from weekday, workout name, or exercise name. A started workout keeps the plan context copied when it started; editing the plan afterwards must not reinterpret it. No new progression insight cards on Today in 21e.

### B. Workout start and resume

Starting the same planned occurrence again resumes the existing session rather than creating a duplicate. Partially completed workouts stay in progress. Leaving the logging screen, switching tabs, backgrounding, force-closing, or temporarily losing connectivity never loses a confirmed set; on return the lifter resumes. There is no offline queue: new writes need a connection and unavailable writes are communicated honestly. The backend keeps the planned context copied at start; the app never creates or mutates recurring-exercise identities.

### C. Guided workout logging card

The native version of the per-exercise logging card: all planned sets together; for each set, weight and reps; the exercise name, planned set count, and target rep range with the shared formatting and validation. Built for the gym: one-handed entry, the right numeric keyboards, few taps, clear focus progression, large targets, immediate confirmation of saved sets, subtle haptics, safe-area and keyboard avoidance. The lifter moves between exercises without losing context. Unsaved input is always distinguishable from a confirmed set; nothing implies a write succeeded before the backend confirms it.

#### C1. Prescription-aware working-weight states

1. **Trusted historical weight.** Wednesday Upper has bench at 230 lb for 6–8 reps from this recurring workout at a comparable prescription. The card may prefill `230 lb` with a source such as `Last time in Upper`. The app does not calculate it or choose the workout.
2. **Reference-only performance.** Saturday Push has 255 lb for 3–5 reps; Wednesday Upper is performed for the first time at 6–8. The weight input is empty; the card may show `Other bench history — Push: 255 lb × 5, planned 3–5 reps`. It is reference only and never becomes the input's value.
3. **No trustworthy weight.** No comparable performance and no useful reference: an empty input; the app never fabricates a starting value.

#### C2. Weight-offer integrity

The client consumes the backend's trusted-weight semantics. It never selects an exercise-wide latest weight, infers a weight from rep ranges, converts e1RM to a load, infers planned RIR, reconstructs gym baselines, treats a reference as a prefill, substitutes another workout's weight, or treats a recommendation as a logged performance. The API distinguishes trusted prefill, reference-only, and nothing. The design and spec inspect the actual implementation before defining the mapping; no parallel mobile-only weight-offer model.

#### C3. Returning to an older prescription

Block 1 at 6–8, Block 2 at 8–10, Block 3 back at 6–8: returning to 6–8 does not revive Block 1's streak or prefill its weight. The backend may show the older performance as reference; the card respects that and implements no compatibility rule.

#### C4. Machine and cable equipment

The backend selects working weights from comparable logged performance, gym-isolated where required. The card consumes the trusted result without restoring the old baseline-first behavior. Native gym selection and the full gym-specific experience are Pitch 21f; 21e uses the existing backend's established gym selection and defaults, and shows an honest limitation or recovery path where a 21f capability is required.

#### C5. Subsequent set entry

Later sets follow the shared set-entry offer rules (after set 1 at 230 lb, set 2 may offer 230 lb). Reuse the shared behavior; a failed or unsaved set is never treated as confirmed.

#### C6. Essential logging correctness

Empty or invalid weight and reps are handled explicitly. Duplicate submissions never create duplicate sets. A failed save never appears successful; a retry never overwrites an unrelated set; logging one set never alters earlier values. A resumed session shows server-confirmed progress. Trusted prefills come only from the backend; references never populate the input; a missing prefill is a valid state. Keep the web's numeric ranges; add no new validation limits.

### D. Workout completion

The lifter completes a planned workout when the backend's definition of completion is satisfied. Completion is durable and retry-safe. Once complete: the session is marked complete, Today reflects it, it appears in History, logged sets are unchanged, and reopening the day creates no second completed workout. Never silently complete an incomplete workout, and no second completion rule in the client. The backend may compute progression outcomes from the recurring identity; the client does not recalculate them. 21e saves the workout correctly and preserves what the backend needs.

### E. Basic session summary

After finishing, a concise native summary — a completion moment, not an analytics dashboard — from the backend's completed-session information. The PRD describes a short summary with a progression chart or goal percentage; the roadmap assigns only a **basic** summary to 21e and the **full** summary to 21g. The design and spec resolve the smallest presentation that satisfies 21e. If the backend provides progression data, the summary must not present a global exercise-wide recommendation that contradicts a recurring-workout-specific assessment; omission is preferable to a misleading call. No substitute progression decision in the client.

### F. All-time workout history

Replace the History placeholder with account-scoped history. The lifter views recent and older sessions, reaches any earlier week, sees workouts from prior blocks, distinguishes completed from planned or incomplete occurrences as the history model supports, opens a workout to inspect its exercises and sets, and returns to Today. **History is all-time**, not limited to the current block or a fixed window. Detail is read-only in this slice. Archived exercises and gyms never hide a session. It must stay efficient for large histories.

**Historical compatibility.** Prescription-Aware Intelligence changes which history is trusted for offers and progression; it never hides or deletes workouts. Native History shows recorded sessions regardless of segment (all three bench blocks stay reachable), never groups old blocks into a new recurring identity, and renders preserved plan context through the backend's representation, not the current plan.

**Boundaries.** The History Calendar feature and the Exercise History Contexts charts are out of scope. 21e History is for finding and reviewing logged sessions.

### G. Shared training records across web and mobile

Both clients use the same records: a set logged on the phone appears on the web, a workout completed on the phone appears in web History, and web workouts appear in native History. No separate workout store, model copy, or progression engine; the mobile API reuses the backend logic and shared contracts. Inspect the merged Prescription-Aware Intelligence contract for the trusted prefill, reference-only performance, unavailable weight, source descriptions, and existing progression and entitlement information; handle an unknown additive value safely rather than as a trusted weight; preserve API versioning. For the same workout, web and native agree on the sets, completion, the offered weight, reference-only status, and account and gym isolation.

### H. Native visual and interaction quality

Follow the 21d design system and native workflow; it must feel built for iPhone. Design explicitly: Today pending, in progress, complete, rest day, no plan; logging with partial sets, trusted weight, reference-only history, no weight; saving, saved, save failure; completion; basic summary; History with workouts, empty, older-history loading; network unavailable. Light, dark, and system appearance; accessible labels, Dynamic Type, VoiceOver; keep the 21d shell and system tabs; never let references crowd the weight-and-reps task.

## 4. Boundaries — out of scope

**Deferred to 21f — Logging Completeness:** native gym selection and gym-baseline management, exercise swap, skip, RIR entry, editing historical sets, editing planned-set counts, native missed-day resolution, cardio logging, and the complete bodyweight and fixed-target experience. Where the backend needs a value governed by these, use its established defaults. The design handles workouts a deferred feature prevents from completing on mobile; never hide or corrupt records to force an edge case through.

**Deferred to 21g — Insights in the Workout:** full Pro recommendations on the card, progress/hold/deload evidence, the scheduled-deload banner, full post-session analytics, expanded e1RM charts, and any mobile purchase or upgrade flow. The backend keeps computing and enforcing progression.

**Separate workout-intelligence features:** Prescription-Aware Intelligence is a prerequisite, not work here (no lineage schema, compatibility rules, segment selection, baseline read behavior, or progression calculations). Also separate: Planned Workout Guidance (target RIR, rest guidance, exercise notes, guidance snapshots), Deload Customization, Exercise History Contexts, and Jump to Exercise. 21e should not preclude nonlinear exercise navigation.

**Later mobile slices:** native plan builder or import, full plan browsing, library management, goal management, wing-it workouts, Watch or Live Activity, offline logging, push notifications, Android, Production-connected builds, TestFlight.

## 5. Foundational invariants

- **A. Account isolation.** Every workout, session, exercise instance, and set belongs to the authenticated account; identity comes from the verified token; every new endpoint is in the cross-account isolation suite; recurring identities stay account-scoped.
- **B. Logged sets are authoritative.** UI state is not; the app never discards, rewrites, or duplicates set data; server transactions and baseline write invariants stay intact; historical plan context is never rewritten by later plan edits.
- **C. No duplicate workouts or sets** from retries, impatient taps, or restarts.
- **D. Server-owned progression and weight offers.** No client progression, compatibility, segments, weight conversion, baselines, or entitlement decisions; a reference is never a trusted suggestion.
- **E. Account-local dates** for Today and week navigation, with the 21d Hermes date behavior.
- **F. Online-only writes.** Previously loaded data may show during an outage where safe; no claim of a save before the server confirms; no offline queue, background sync, or local database.
- **G. Free capture and history.** Logging, trusted prefills, and history are Free; trial expiry never blocks capture; no Pro data in Free responses.

## 6. Definition of done

**Today and session flow:** Today shows the pending workout; the lifter starts it; reopening resumes; a partly logged workout survives leaving and reopening; completing marks it complete; Today shows completion instead of tomorrow; rest, completed, and no-plan states render; a started workout keeps its plan context after later plan edits.

**Set logging:** an exercise opens a native card with all planned sets; weight and reps are saved with the right keyboards; saved entries survive restarts; invalid, empty, and zero inputs are handled per the existing rules; a retry creates no duplicate; failed writes never look successful; one-handed use works with the keyboard open.

**Prescription-aware offers:** the card uses the backend's trusted offer; shows reference-only performance without prefilling; leaves the field empty without trustworthy history; Saturday and Wednesday bench never borrow each other's weights; an incompatible older prescription never prefills; no client estimates from rep ranges or RIR; machine offers follow the backend's gym-scoped behavior; unknown offer information never becomes a weight; no client progression or compatibility calculation.

**Completion and summary:** one completed session; a concise summary; the workout appears in native and web History; completion never modifies logged sets; no contradictory global recommendation.

**All-time history:** existing workouts show; any earlier week is reachable; every block is accessible; details show exercises and sets; archived exercises and gyms never hide sessions; performances outside the current segment stay visible; History is Free.

**Security and correctness:** consistent data across clients and the same weight semantics; isolation tests for every new endpoint; retry-safe session and set creation; progression-engine and baseline write invariants intact; no Production writes from development builds; existing web tests green; API versioning respected.

**Native device acceptance:** a full workout in the iOS Simulator; a full workout on the owner's iPhone against staging; resume after force-close; trusted, reference-only, and empty states reviewed on a real device; light and dark; keyboards, safe areas, targets, and navigation; a compatible staging OTA update reaches the iPhone; the workout confirmed on the staging web app.

## 7. Rabbit holes and risks

1. **Expanding into every logging capability** (absorbing 21f and 21g). Build the normal planned workout first.
2. **Reimplementing Prescription-Aware Intelligence on mobile** from exercise ids, names, or the latest set. Consume backend offers and references.
3. **Treating reference-only data as a prefill.** Keep them distinct in the API and the UI.
4. **Losing or duplicating logged sets.** Server-confirmed writes, existing transactions, retry safety, and regression tests are mandatory.
5. **Native session state drifting from the backend.** The backend owns session and set state; the client reconciles to confirmed responses.
6. **Date and week interpretation** across time zones, daylight saving, and block boundaries. Reuse the account-zone semantics and shared date utilities.
7. **All-time history as a performance problem.** Efficient retrieval, without a new cache, search service, or calendar subsystem.
8. **A polished but slow logging card.** Evaluate typing and confirmation on a physical iPhone; references must not crowd the fields.
9. **Existing workouts with 21f-only behaviors** (bodyweight, fixed targets, swaps, skips, cardio). Represent them honestly; defer unsupported writes.
10. **Incorrectly gating Free features.** Server entitlements stay authoritative; no purchase flow.
11. **Building against an outdated backend.** Start only from staging with Prescription-Aware Intelligence merged.

## 8. Dependencies

21a (workspace), 21b (shared rules, formatting, validation, types, tokens), 21c (auth, version checks, scoped data, API conventions, retry safety), 21d (Expo app, tabs, secure sessions, native primitives, staging EAS workflow), and Prescription-Aware Intelligence (recurring identity, comparable history, trusted prefills, reference-only context, prescription-specific evidence, revised machine reads, additive contract fields). Inspect the merged code and contracts before choosing API additions; confirm the seeded staging QA account suits read/write verification; keep the staging-only build and update restrictions. No Production database, Apple signing, or new commercial service is presumed; the spec identifies any real migration or environment prerequisite.

## 9. Open questions (resolved in the spec)

Q1 Which backend operations the loop reuses, adding only the missing API. Q2 How trusted offers and references are represented and displayed. Q3 The smallest complete native logging interaction. Q4 How partially logged workouts appear. Q5 The basic summary's presentation. Q6 Native history navigation without the History Calendar. Q7 Workouts that depend on a deferred 21f capability. Q8 Failed requests and repeated taps. Q9 Recovery after an interrupted save or restart without offline logging. Q10 Completion and the existing server-side progression and baseline updates. Q11 Efficient all-time history loading. Q12 Which native interactions need owner approval. Q13 The minimum staging-device verification. No money, legal, billing, or privacy-policy decision is anticipated; if one appears, escalate it.

## 10. Implementation guardrails

Do not add another progression engine; implement recurring identity or segment logic in the app; add a mobile-only workout database, offline queues, or sync; change the meaning of a completed workout; recalculate baselines in the client; make capture depend on Pro; remove archived exercises from history; change web logging semantics for the mobile UI's convenience; reintroduce exercise-wide prefills; infer or fabricate weights; build a native plan editor; implement cardio, swap, skip, or RIR entry; implement planned RIR, rest, or notes; implement custom deloads or recurring-context charts; build drag-and-drop exercise order; or distribute a Production-connected build. If a requirement cannot be met within these, document the limitation and defer it deliberately.

## 11. Release and review approach

The normal pipeline, with native review: confirm the prerequisites on staging; write the pitch, design doc, and native design contract; spec and Resolved Decisions; Linear tickets and the feature PR; build the slice end to end; run the security, isolation, training-correctness, and mobile checks; verify the trusted, reference-only, and empty states; review interactively in the iOS Simulator and on the physical iPhone; verify a completed workout against staging and on the staging web app; verify a compatible staging OTA; resolve blocking findings; **merge into `staging` only after the required owner approval and verification.** Production promotion is separate, and no Production-connected native build is distributed.

## 12. Final acceptance scenario

The owner opens Overload Dev on their iPhone with the seeded staging QA account. Today shows the scheduled workout; they start it and open the first exercise, which shows its planned sets, target reps, and the backend's weight context.

- **A — Compatible weight.** Push; bench last logged at 255 lb in this recurring workout at a compatible prescription. The input offers 255 lb; they accept or edit, enter reps, save; the backend confirms.
- **B — Reference only.** Upper; bench at 6–8 with no compatible Upper history. The input is empty; the card may show "Other history — Push: 255 lb × 5, planned 3–5 reps"; the app never enters 255 lb.
- **C — Resume and complete.** Several sets, leave, return: confirmed sets intact, the workout resumes; they finish and see a short summary; Today no longer shows it unfinished; it appears in native History beside earlier weeks and blocks; the staging web app shows the same workout, exercises, sets, and completion.
- **D — Cross-platform.** Opening the same recurring workout on the web uses the same recorded performance and weight context; neither client creates a separate progression history.

**Pitch 21e is done when a lifter can complete an ordinary planned strength workout on their iPhone, with correct prescription-aware weight-entry behavior, and the result matches Overload's web training records without data loss, duplication, or account-isolation violations.**
