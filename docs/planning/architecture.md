# Overload — Architecture Doc

## Tech Stack

**Next.js (App Router) + React + TypeScript** as the application framework, chosen for consistency with the established pattern across other projects, and because a server-first rendering model fits a CRUD-heavy, low-interactivity-complexity app well while keeping the API layer cleanly separable for the mobile app planned in a later phase.

**Supabase (Postgres, Auth, Storage)** as the backing platform. Postgres fits the relational shape of the data — mesocycles, sessions, exercises, logs, and gyms all relate to each other in ways a relational model represents directly, with no need for a document or specialized store. Supabase Auth removes the need to hand-roll authentication for what is ultimately a single user account. Supabase Storage holds the imported exercise library images.

**Prisma** as schema authority and data-access layer over Supabase Postgres, giving type-safe queries and a single source of truth for the schema as it evolves.

**Vercel** as the hosting target, chosen for its native fit with Next.js and zero-ops deployment.

**Recharts** for the progression charts (e1RM trend lines, goal progress visualization), consistent with charting choices made elsewhere and well suited to line-based trend data.

Frontend styling/component approach (Tailwind, a component library, or otherwise) is intentionally left undecided here — it's a visual design decision that belongs to the Phase 5 UI design interview, not this document, and locking it in prematurely would just get revisited there.

## Data Model

**Mesocycle** — name, length in weeks, deload week number, split type (preset identifier or custom), status (active/archived), start date. Has many Sessions.

**Session** — a named workout template (e.g., "Push Day 1") belonging to a Mesocycle, assigned to a day of the week. Has many SessionExercises (join to Exercise, carrying planned set count and target rep range, ordered).

**Exercise** — name, muscle group, equipment type, image reference (nullable for custom exercises), custom flag, soft-delete flag. Referenced by SessionExercise, LoggedExercise, GymExerciseBaseline, and Goal.

**Gym** — name, free-text address, soft-delete flag. Has many GymExerciseBaseline entries.

**GymExerciseBaseline** — links a Gym and an Exercise to a current working-weight baseline, tracked independently per gym for machine-based exercises only; free-weight/plate movements don't need an entry here since they're assumed consistent everywhere.

**LoggedSession** — a record of a completed or in-progress day, referencing the Mesocycle/Session it fulfills, with a date and completion status. Has many LoggedExercises.

**LoggedExercise** — references the Exercise performed (and the Gym, where a baseline is relevant). It carries no stored progress/hold/deload tag and no stored e1RM; both are computed on read from its LoggedSets. Has many LoggedSets.

**LoggedSet** — weight and reps for a single set, editable after creation, with edits triggering a recompute of the parent LoggedExercise's tag.

**Goal** — references an Exercise, target weight, target rep count, status (active/archived), timestamps. Multiple can exist per user, at most one active per Exercise.

**CardioLog** — type and duration, referencing the day it was assigned/logged against. No relationship to the progression system.

## Consistency & State

This is a single-writer system by design — one user, and in practice one active session at a time — so there's no concurrency or conflict-resolution concern to design for. All reads and writes go through standard request/response against Postgres; there's no need for real-time subscriptions, optimistic UI reconciliation across clients, or a sync layer, since offline support was explicitly ruled out as a requirement and the user logs later the same day rather than needing the app to function without connectivity.

The one piece of state that must behave correctly rather than just persist is the progress/hold/deload tag on a LoggedExercise: it's derived, not authoritative, and must always reflect the LoggedSets underneath it — most notably after a past log is edited. The tag is not a value entered by the user, and it is never stored: it, and the e1RM trend, are computed on read as a pure function of the logged sets, the planned rep range, and the mesocycle week. No stored flag and no background job maintains them. Editing a past log therefore corrects every downstream tag and trend automatically, with no recompute path to forget. GymExerciseBaseline is the exception, since it holds per-gym state the logged sets alone cannot reconstruct.

## Auth & Identity

Supabase Auth handles identity, using email/password or a magic-link flow — either is sufficient given there's exactly one account. All application routes are gated behind an authenticated session, managed through Supabase's session-cookie integration for Next.js; there's no public-facing surface beyond the login screen itself. Public signups are disabled in Supabase; the single account is created manually.

Because Prisma connects directly to Postgres, it bypasses row-level security, while Supabase also exposes every table through its public Data API reachable with the anon key. Row-level security is therefore enabled with no policies (deny-all) on every table, so Prisma is the only door into the data and the Data API is closed.

## Authorization

Not applicable — single-user, no roles, no permission distinctions to enforce.

## API Surface

The spine of the API, organized around the PRD's data objects:

- **Mesocycles** — create, read, update, clone-forward.
- **Sessions** — create/update within a mesocycle, duplicate onto another day.
- **Exercises** — search/filter by muscle group, create (custom), soft-delete.
- **Gyms** — create, read, soft-delete.
- **Logged sessions** — create/read by date, mark day complete, resolve a missed day (log late / shift / skip).
- **Logged sets** — create during active logging, edit after the fact (triggers recompute of the parent exercise's tag).
- **Progression** — read the current tag and e1RM trend for a given exercise; this is largely a computed read rather than a stored-and-fetched value.
- **Goals** — create, read progress, archive.
- **Cardio logs** — create, read.

## External Integrations

**free-exercise-db** (public domain exercise dataset with images) is imported once, at build/seed time, into the application's own database and storage rather than queried live — this removes any runtime dependency on an external service's uptime for a core feature.

No mapping/geocoding service is needed, since gym location is captured as a free-text name rather than a pinned geographic point in this version — that's explicitly deferred to the mobile, location-aware phase.

No health-data integration (Apple Health/HealthKit or otherwise) exists in this version. HealthKit specifically is only reachable from a native iOS app, not a website, so it's architecturally impossible for the web MVP regardless of preference — it becomes possible once a native or wrapped mobile app exists, and cardio's data model (type + duration) is deliberately minimal now to avoid rework when that door opens later.

## Environments & Deployment

Local development runs against a separate Supabase development project, with Prisma managing schema migrations across both environments. Production is a single Vercel deployment connected to a production Supabase project — there's no staging tier, which is appropriate given this is a single-user personal tool where the cost of a rare bad deploy is low and a formal staging environment would be pure overhead.

## Non-Functional Requirements

**Scale/performance** — trivial. Single user, low request volume; no capacity planning or query optimization work is warranted beyond normal competent practice.

**Responsiveness** — the web app must work well on a phone browser, since it will be used standing in a gym on a phone before the native mobile app exists. This isn't a "nice to have" — it's the actual primary usage context for the logging journey.

**Offline** — explicitly not required. The user has confirmed that logging later the same day is an acceptable fallback when connectivity is unavailable at a gym.

**Security/compliance** — no special requirements beyond standard practice; this is a single personal account with no sensitive regulated data.

## Biggest Technical Risk

Tuning the gym-baseline auto-correction threshold — the logic that decides whether a logged weight at a given gym differs enough from that gym's current baseline to mean the equipment is genuinely different, versus being an off day, a form issue, or ordinary session-to-session noise. Set the threshold too sensitively and a single rough session corrupts a gym's baseline; set it too loosely and it never corrects when the equipment genuinely does differ. This is a judgment call that will likely need real usage data to tune correctly rather than being solvable analytically up front, and it's the one piece of this system without a well-established convention to lean on — unlike the progression engine, which draws on standard strength-training practice.

## Open Questions

Details the approved docs do not settle. Each must be decided in the controlling pitch and recorded as a named constant or documented decision, not guessed by an implementing agent.

- Progression thresholds: how many consecutive sessions at the top of the rep range trigger a progress call, and how many misses trigger a deload call. Also the weight increment applied on a progress call.
- The load reduction applied during the scheduled deload week.
- What counts as a "noticeable margin" for gym baseline auto-correction.
- Which equipment types count as gym-variable (machine-based) versus consistent everywhere.
- Where the current working weight for an exercise lives. Sessions store planned sets and rep ranges, not weights.
- Where skipped and shifted days are persisted. The Data Model has no home for them, and without one a skipped day would re-prompt on every app open.
- Which e1RM formula is used (Epley or Brzycki). It must be one shared function used by both the trend line and goal progress.
- Login method: email/password or magic link.
- Test runner and test database: neither is chosen. The Foundation spec must pick both, and tests must never run against the Supabase dev or production database.
- Exercise image bucket: whether the Supabase Storage bucket is public or private. The Library & Gyms Setup spec must decide.
- Goals: when a second active goal is created on a lift that already has one, whether it is blocked or replaces the existing goal. The Goals spec must decide.
