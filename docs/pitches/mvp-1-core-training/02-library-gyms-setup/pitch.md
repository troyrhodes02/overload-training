# Overload — Pitch: Library & Gyms Setup

> Source: pulled from Linear document "Overload — Pitch 2: Library & Gyms Setup" (Overload V1), https://linear.app/overload-training/document/overload-pitch-2-library-and-gyms-setup-d6f6008f659c (updated 2026-10-07). Content reproduced verbatim in substance; headings normalized to Markdown.

## Summary

**Type:** Feature
**Appetite:** M — Medium
**Depends on:** Foundation
**Unlocks:** Split & Mesocycle Setup; later Guided Workout Logging
**Primary features:** Exercise Library; Favorites; Gym Management
**Explicitly deferred:** Gym-Specific Weight Tracking behavior

This pitch turns the authenticated but empty Overload foundation into the first genuinely usable product surface.

At completion, the lifter has:

- a persistent exercise catalog imported from `free-exercise-db`;
- exercise images for imported movements;
- a personalized Favorites layer over the full library;
- search and primary muscle-group filtering;
- primary and secondary muscle classifications;
- custom exercise creation;
- archival rather than destructive deletion;
- a persistent gym list with free-text location information;
- gym archival.

This pitch does **not** create a training plan, log a workout, establish working weights, or make progression decisions.

Its job is to establish the durable **exercise vocabulary** and **gym vocabulary** that every later training capability depends on.

---

## Problem

Overload's core job is eventually to tell the lifter whether to progress, hold, or deload based on logged performance against a plan they built themselves.

That job cannot exist until Overload has stable definitions for:

1. what exercise is being performed; and
2. where that exercise is being performed.

The lifter also needs a practical way to navigate a large exercise catalog.

A comprehensive source library is valuable because it means unfamiliar or rarely used exercises remain available, but most lifters repeatedly use a much smaller personal subset. Search is useful when the movement name is known; muscle-group filtering is useful when the training target is known. Neither fully solves the common case of "show me the exercises I actually use."

For that reason, the exercise library needs both:

- a **complete reference catalog**; and
- a **personal Favorites layer**.

The gym list matters for a different downstream reason. The product's second major differentiator is that nominal machine resistance can differ meaningfully between gyms.

This pitch does not yet model those working-weight differences. It establishes the gym identities that later logged workouts and gym-specific baselines can attach to.

---

## Why This Pitch Exists Now

The sequencing is dependency-driven.

Split & Mesocycle Setup cannot build sessions until exercises exist to place into them. The PRD explicitly identifies the Exercise Library as a prerequisite for session construction. Gym Management likewise needs to exist before later workout logging can attribute machine performance to a particular location.

Foundation established: authentication; persistence; application structure; secure data access; deployment.

Pitch 2 is therefore the first vertical feature built on top of that substrate.

The roadmap places Library & Gyms Setup directly before Split & Mesocycle Setup and makes the latter depend on the former.

---

## Appetite

**M — Medium**

The individual management actions are straightforward, but the slice combines several related concerns:

- importing and normalizing an external exercise dataset;
- importing and serving exercise images;
- full-library browsing;
- Favorites;
- search;
- primary muscle-group filtering;
- primary and secondary muscle metadata;
- custom exercise creation;
- exercise archival;
- gym creation and management;
- gym archival;
- mobile-friendly selection surfaces.

This remains a Medium pitch as long as it does **not** absorb: split creation; workout logging; maps/geolocation; exercise recommendation; gym-specific working weights; progression logic.

If any of those enter the slice, scope has escaped the appetite.

---

## Solution Shape

### 1. Exercise Library

Overload gets a persistent exercise library primarily populated from `free-exercise-db`.

The external source is used as an import source, not as a runtime service. The architecture explicitly requires that the dataset and images be imported into Overload's own systems so the application does not depend on that project remaining online.

The library becomes Overload's canonical exercise catalog.

The lifter can:

- browse all exercises;
- search by exercise name;
- filter by primary muscle group;
- view only Favorites;
- combine Favorites with search and muscle-group filters;
- recognize imported exercises by image;
- create missing custom exercises;
- favorite or unfavorite exercises;
- archive exercises they no longer want available for future selection.

### 2. Personal Favorites

Favorites are a personalization layer over the full Exercise Library.

They do not create a separate copy of an exercise and do not change the exercise's underlying classification.

An exercise can simply be marked as part of the lifter's preferred working set.

The primary library modes are conceptually:

- **All Exercises**
- **Favorites**

Favorites then compose with the other library controls. Examples: Favorites + Back; Favorites + Chest; Favorites + search `"press"`; All + Back; All + search `"row"`.

The goal is to let the lifter move quickly between:

- **discovery** — the complete catalog; and
- **routine selection** — the smaller set of exercises they regularly use.

Favorites do not imply that an exercise is active in the current training plan. They mean only:

> this is an exercise the lifter wants easy access to.

There is no automatic favoriting based on usage in this pitch.

### 3. Exercise Muscle Classification

Every Exercise has one **primary muscle group**. It may also have zero or more **secondary muscle groups**. The distinction is intentional.

#### Primary muscle group

Primary muscle group answers:

> What is this exercise principally being performed to train?

| Exercise | Primary muscle |
| -- | -- |
| Bench Press | Chest |
| Lat Pulldown | Back |
| Barbell Row | Back |
| Back Squat | Quads |
| Biceps Curl | Biceps |
| Triceps Pushdown | Triceps |

Primary muscle group is the authoritative classification for:

- normal muscle-group filtering;
- later same-muscle-group exercise swap behavior;
- determining the broad intent of the exercise.

The existing PRD makes same-muscle-group matching a dependency of Exercise Swap. That future feature should match on **primary muscle group only**. A secondary muscle must not make two exercises equivalent substitutions.

For example: Bench Press → Chest primary; Triceps Pushdown → Triceps primary. Bench Press involving the triceps does **not** make Triceps Pushdown a valid chest-movement replacement.

#### Secondary muscle groups

Secondary muscle groups answer:

> Which other muscle groups materially contribute to this movement?

| Exercise | Primary | Secondary |
| -- | -- | -- |
| Bench Press | Chest | Triceps, Shoulders |
| Incline Bench Press | Chest | Shoulders, Triceps |
| Lat Pulldown | Back | Biceps |
| Barbell Row | Back | Biceps |
| Back Squat | Quads | Glutes, Hamstrings |
| Biceps Curl | Biceps | — |
| Triceps Pushdown | Triceps | — |

Secondary muscles are **descriptive metadata in this version**. They may be displayed as supporting context, such as:

> Primary: Chest
> Also trains: Triceps, Shoulders

Secondary muscle groups do **not** initially: expand the normal muscle-group filter; affect exercise-swap eligibility; generate training recommendations; alter progression logic; count toward muscle-volume analysis.

Those may be reconsidered later if actual product use shows value.

This deliberately avoids making a simple "Biceps" filter return every back movement in which the biceps merely assist.

### 4. Exercise Search and Filtering

The exercise library supports three composable selection dimensions:

**Library scope** — All; Favorites.

**Primary muscle group** — for example Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings, Glutes, Calves, Core. The exact approved vocabulary should ultimately match the imported dataset normalization chosen in the spec.

**Name search** — narrows the current library state rather than creating a separate search mode. For example:

> Favorites + Back + `"row"`

should show favorited exercises whose **primary** muscle group is Back and whose name matches the search.

The exact UI—tabs, segmented controls, chips, menus, etc.—belongs to the design-doc stage.

### 5. Imported Exercise Images

Imported exercises display their corresponding exercise images.

The approved architecture uses Supabase Storage for imported exercise assets rather than loading them from the source repository at runtime.

Custom exercises have no image. There is no user image-upload feature in this pitch.

### 6. Custom Exercise Creation

If an exercise is missing from the imported library, the lifter can add it manually.

The original PRD describes custom exercise creation as "name only," but that rule conflicts with later requirements for muscle-group filtering, Exercise Swap, and gym-variable equipment classification. The approved Architecture Doc already treats muscle group and equipment type as part of the Exercise definition.

This pitch therefore intentionally amends the earlier "name only" behavior.

A custom exercise requires: **Name**; **Primary muscle group**; **Equipment type**.

It may additionally have: **Secondary muscle groups** — optional, zero or more.

It does not have: an imported exercise image; a user-uploaded image.

A custom exercise behaves like an imported exercise everywhere else in the application. The difference is provenance and image availability, not functional capability.

### 7. Equipment Classification

Every exercise needs an equipment classification.

This is required now because later Guided Workout Logging uses equipment type to determine whether an exercise should have gym-specific working-weight behavior.

The actual rule for which equipment types are gym-variable remains owned by Guided Workout Logging. Pitch 2's responsibility is only to ensure the classification exists consistently.

The imported source values may require normalization before they become Overload's canonical equipment categories. That mapping belongs in the spec rather than being invented separately by later features.

### 8. Exercise Archival

Removing an exercise is an archival operation. Once archived:

- it disappears from normal future-selection surfaces;
- it is removed from Favorites presentation if appropriate to the selected view;
- its stable identity remains intact;
- later historical references remain valid.

The PRD requires deletion to remove an exercise from future selection without altering historical records. The architecture likewise defines Exercise as a soft-deletable object referenced by later plan, logging, baseline, and goal records.

Pitch 2 establishes that lifecycle from the beginning, even though workout history does not yet exist.

### 9. Gym Management

The lifter can maintain an explicit gym list. A gym is deliberately created through Gym Management rather than implicitly appearing during workout logging.

The lifter can: view existing gyms; add a gym; give the gym a name; optionally record a free-text address/location; archive a gym.

Gym identity matters because later logging will need to distinguish machine performance at different locations. This pitch creates that identity only. It does not establish working weights.

### 10. Gym Location

Gym location is plain user-entered text. There is: no map; no geocoding; no GPS lookup; no place autocomplete; no current-location detection; no distance calculation; no arrival detection.

The Architecture Doc explicitly rejects mapping/geocoding for this version and defines the gym location as free text. The earlier PRD language referring to a "pinned location" is treated as stale.

### 11. Gym Archival

Gym removal is archival, not hard deletion. An archived gym:

- disappears from future normal selection;
- retains stable identity;
- remains compatible with future historical references.

The PRD requires deletion to preserve historical logs while removing the gym from future selection. Workout history does not yet exist, but this pitch must establish the correct lifecycle before it does.

---

## In Scope

### Exercise Library

- one-time `free-exercise-db` import;
- imported exercise persistence;
- imported image persistence;
- full-library browsing;
- Favorites;
- favorite/unfavorite action;
- Favorites filter/view;
- name search;
- primary muscle-group filter;
- composable search + Favorites + muscle filter;
- one required primary muscle group per exercise;
- zero or more optional secondary muscle groups;
- equipment classification;
- custom exercise creation;
- exercise archival;
- archived exercises excluded from future normal selection.

### Custom Exercise

Required: name; primary muscle group; equipment type.
Optional: secondary muscle groups.
Explicitly absent: image.

### Gym Management

- gym list;
- explicit gym creation;
- gym name;
- optional free-text location/address;
- gym archival;
- archived gyms excluded from future selection.

### Supporting states

The design-doc should account for: populated exercise library; loading state; import/seed failure where relevant; no search matches; no Favorites yet; Favorites with results; no results for a selected muscle group; combined filter states; custom exercise creation; validation errors; exercise archival; missing imported image; empty gym list; populated gym list; gym creation; gym archival; phone-browser layouts.

These are supporting interaction states, not additional product features.

---

## Out of Scope

### No Split & Mesocycle Setup

Do not build: mesocycles; splits; workout sessions; day assignments; planned sets; target rep ranges; cloning. Those belong to the following feature pitch.

### No Workout Logging

Do not build: Logged Sessions; active workout state; set entry; completed workouts; workout history; past-log editing; missed-day handling; exercise swapping.

### No Gym-Specific Weight Tracking

Do not create or update: gym/exercise working-weight baselines; first-log baseline establishment; baseline correction; baseline thresholds; current working weight; machine-specific recommendations.

The roadmap explicitly defers this behavior until Guided Workout Logging. A gym existing does not imply that a working-weight baseline exists.

### No Progression Behavior

Do not calculate or display: progress; hold; deload; e1RM; trend lines; weight recommendations.

### No Runtime Exercise Dataset Dependency

Do not query `free-exercise-db` from the live application. The imported catalog becomes Overload's own data.

### No Custom Exercise Images

Custom exercises have no image. Do not: upload one; generate one; search for one; attach an imported exercise's image.

The project's storage rules explicitly limit the exercise image bucket to imported public-domain assets.

### No Maps or Location Intelligence

Do not add: maps; geocoding; latitude/longitude; GPS; proximity sorting; automatic gym detection; arrival notifications.

### No Program Generation

Do not: recommend exercises for a split; auto-build workouts; tell the lifter what movement they should use; infer a routine from Favorites; turn Favorites into a recommended program.

The Brief explicitly says the lifter authors the training program rather than the application.

### No Secondary-Muscle Training Logic

Secondary muscle groups are metadata only in this pitch. Do not use them to: qualify Exercise Swap; calculate muscle volume; count indirect sets; generate fatigue estimates; recommend accessory movements; affect progression; change the main muscle-group filter.

### No Recently Used / Automatic Personalization

Favorites are manually controlled. Do not add: recently used; most used; suggested exercises; auto-favoriting; ranking based on workout history.

Workout history does not exist yet.

---

## Definition of Done

1. **The standard exercise catalog exists locally.** The `free-exercise-db` catalog has been imported into Overload and is browsable with imported images. *Roadmap trace:* dataset imported and browsable with images. *Architecture trace:* imported once into Overload rather than queried at runtime.
2. **Every usable exercise has the classification required by later features.** Every exercise available for future selection has a primary muscle group and an equipment type. Exercises may additionally have secondary muscle groups. Primary muscle group is authoritative for normal muscle-group filtering and later same-muscle-group substitution. This criterion is a deliberate product amendment required to reconcile the original "name-only" custom-exercise language with the approved Exercise model and later swap behavior.
3. **Exercises can be found by name.** The lifter can search the imported/custom library by exercise name. *PRD trace:* Exercise Library requires name search.
4. **Exercises can be filtered by primary muscle group.** The lifter can narrow the library to exercises whose **primary** target matches a selected muscle group. Secondary muscle participation does not cause an exercise to appear under that primary-muscle filter. This pitch clarifies that the PRD's filter means **primary muscle group**.
5. **Exercises can be favorited.** The lifter can favorite and unfavorite any active exercise. Favorites persist. A Favorites library view/filter shows the lifter's manually selected preferred exercises. This is new approved Pitch 2 scope and should be recorded as a product amendment in downstream documentation.
6. **Favorites compose with normal library filters.** Favorites can be combined with primary muscle group and name search. Examples that must be representable: Favorites + Back; Favorites + Chest + `"press"`. The exact visual controls belong to design.
7. **Custom exercises can be created with sufficient classification.** A custom exercise can be created with name; primary muscle group; equipment type; optional secondary muscle groups. It then behaves like an imported exercise except that it has no image. *Original PRD intent:* a manually added exercise should function identically to a library exercise minus the image. The required classification fields are an explicit amendment.
8. **Imported exercises may show secondary muscles.** Where secondary-muscle metadata exists, the application can expose it as descriptive context. Secondary muscles do not change primary filtering, Favorites behavior, or later swap equivalence.
9. **Exercises are archived rather than destructively deleted.** Archiving removes an exercise from normal future selection while preserving stable identity. *PRD trace:* deleting an exercise removes it from future selection without altering historical references.
10. **Gyms can be created and viewed.** A gym can be created with name and optional free-text address/location. It then appears in Gym Management. *Roadmap trace:* a gym addable with name and free-text address.
11. **Gyms are archived rather than destructively deleted.** Archiving removes a gym from future selection while preserving its stable identity. *PRD trace:* gym deletion preserves history while removing the gym from future selection.

---

## Behavioral Rules

**Library filtering.** Normal muscle-group filtering means: exercises whose **primary** muscle group equals the selected group. Secondary muscles do not broaden this result.

**Favorites.** Favorites are manual; persistent; exercise-level; independent of any particular mesocycle; compatible with imported and custom exercises. Favoriting an exercise does not add it to a workout, alter its classifications, imply progression priority, or create a plan.

**Primary muscle.** Primary muscle is the exercise's training-intent classification. It governs library muscle filtering and future Exercise Swap matching.

**Secondary muscles.** Secondary muscles are descriptive. They may help the lifter understand compound movements but do not initially participate in product logic.

**Archived items.** Archived exercises and gyms do not appear in normal selection lists, retain their stable identity, and are not hard-deleted.

---

## Rabbit Holes

1. **Treating `free-exercise-db` as a live API.** Do not. The application owns an imported copy.
2. **Perfecting the entire exercise taxonomy.** The imported source may have inconsistent muscle names, equipment labels, exercise names, and secondary-muscle classifications. Normalize enough to produce one stable Overload vocabulary. Do not turn Pitch 2 into an exhaustive exercise-science ontology project. If source values need mapping, make the mapping explicit and reusable.
3. **Making secondary muscles too powerful.** Letting them drive every filter immediately creates noisy results — a Biceps filter that returns Lat Pulldown, Rows, Pull-Ups, and Curls becomes ambiguous between "exercises for biceps" and "exercises where biceps contribute." Pitch 2 chooses: standard muscle filter = primary muscle only.
4. **Using secondary muscles for swapping.** Do not let Bench Press qualify as a Triceps swap, or Lat Pulldown as a Biceps swap. Future swaps use primary muscle only.
5. **Favorites becoming recommendation logic.** Favorites should not become "recommended for you," "best exercises," auto-generated programming, or usage ranking. They are a manual organizational tool.
6. **Hard-deleting because there is no history yet.** The correct lifecycle must exist before downstream history does. Exercise and Gym are archival from day one.
7. **Building Gym-Specific Weight Tracking early.** Exercise and Gym both existing may make the relationship look ready. It is not. No baseline should exist until real logged training provides one.
8. **Turning address into geolocation.** Free-text location does not justify maps or geocoding.
9. **Adding custom images.** An image-less custom exercise is approved behavior, not an unfinished feature.

---

## No-Gos

Do not: call the source exercise dataset at runtime; hard-delete exercises; hard-delete gyms; generate or upload custom exercise images; add a second image source; add maps; add geocoding; create lat/long fields solely for future use; establish gym baselines; infer working weights; implement workout logging; implement split creation; implement exercise swaps; use secondary muscles for swap matching; use secondary muscles for standard muscle-group filtering; compute training volume from secondary muscles; implement progression; recommend exercises; generate programs; automatically favorite exercises; build Recently Used; build social/shared favorites.

The pipeline guide identifies runtime exercise-dataset calls, hard deletion, custom images, and mapping gym addresses as especially likely scope escapes for this pitch.

---

## Edge Cases the Design and Spec Must Handle

These are known situations the downstream stages should deliberately account for. They are not separate features.

### Exercise Library

- **No Favorites exist.** The Favorites view should clearly communicate that nothing has been favorited yet rather than looking broken.
- **Favorite is archived.** An archived exercise should not continue appearing as a normal actionable Favorite. The spec should decide whether archival implicitly clears the favorite state or merely makes it invisible while archived. That is lifecycle implementation detail, not separate product behavior.
- **Search returns nothing.** The empty state should make it clear no existing exercise matched and expose the already-approved custom-exercise path.
- **Muscle filter returns nothing.** The library should show an understandable empty state.
- **Favorites + muscle filter returns nothing.** Distinguish "no matches under these filters" from a loading or system failure.
- **Imported image unavailable.** The exercise remains usable. The design stage chooses the visual fallback.
- **Custom exercise has no image.** Expected behavior.
- **Duplicate exercise names.** The supplied planning sources do not establish whether exercise names must be unique. The spec must explicitly resolve imported/imported, custom/custom, and custom/imported collisions. Do not assume uniqueness solely for implementation convenience.
- **Secondary muscle duplicates primary.** The spec should prevent nonsensical classification such as Primary: Chest / Secondary: Chest.
- **Duplicate secondary muscle tags.** A secondary muscle should not be listed twice.

### Gym Management

- **Empty gym list.** The first-gym path must be obvious.
- **Duplicate gym names.** No approved source defines whether gym names must be unique. Resolve in the spec.
- **Missing address.** This pitch resolves gym address/location as **optional**. A gym's identity is its explicit record and name, not its address.
- **Archived gym.** It disappears from normal future use while preserving identity.

---

## Dependencies

**Foundation** must already provide: authenticated access; persistence; approved base data model; secure server-side data access; application shell; deployment substrate. Pitch 2 extends rather than redefines those decisions.

**`free-exercise-db`** must be available for the import process. The running application must not depend on its continued availability.

**Supabase Storage.** Imported images use the approved Storage platform. The pipeline's standing decision says the exercise image bucket is public-read and written only through the import/seed path using privileged server-side credentials. This does not create a general-purpose user-upload system.

---

## Downstream Contract

### Split & Mesocycle Setup may assume

- a full exercise library exists;
- Favorites exist;
- name search works;
- primary muscle filtering works;
- imported and custom exercises share the same selection model;
- every selectable exercise has a primary muscle group;
- every selectable exercise has an equipment type;
- exercises may have optional secondary muscles;
- archived exercises are excluded from new selection;
- exercise IDs are stable.

The split builder should not recreate exercise-management logic.

### Guided Workout Logging may assume

- gyms already exist as explicit records;
- archived gyms are excluded from new selection;
- exercise identity is stable;
- gym identity is stable;
- equipment classification exists;
- primary muscle classification exists;
- Exercise Swap can use primary muscle group as its equivalence constraint.

Guided Workout Logging still owns: first gym baseline establishment; baseline correction; gym-variable equipment rules; logged working weights.

---

## Explicit Product Amendments Introduced by This Pitch

These are intentional updates to the earlier planning material and should be reflected upstream before or alongside implementation.

1. **Favorites.** Add to Exercise Library: favorite/unfavorite; persistent Favorites state; Favorites library view/filter; composition with search and primary-muscle filtering. *Reason:* the imported library may be much larger than the lifter's normal working set.
2. **Primary and secondary muscle groups.** Replace the ambiguous singular "muscle group" concept with one required **primary muscle group** and zero or more optional **secondary muscle groups**. Primary muscle controls standard library filtering and future Exercise Swap matching. Secondary muscles are descriptive only in this version.
3. **Custom exercises are not literally "name only".** Custom exercise creation requires name, primary muscle group, and equipment type. Secondary muscles are optional. Custom exercises still have no image. A name-only exercise cannot participate correctly in muscle-group filtering, Exercise Swap, or equipment-dependent gym logic.
4. **Gym location is free text, not pinned geography.** The earlier PRD phrase "pinned location" is superseded for this web MVP by optional free-text location/address with no map/geocoding behavior.

---

## Remaining Source Gaps

1. **Exercise taxonomy normalization.** The imported dataset's exact muscle/equipment labels may not match the product's desired categories. The spec must inspect the real source values and define a canonical mapping. Do not invent parallel classifications in different features.
2. **Duplicate-name policy.** Still unresolved: duplicate exercise names; duplicate gym names. The spec must make these explicit.
3. **Custom exercise editing.** The PRD journey refers to editing custom exercise names/notes, while the roadmap scope only names create and soft-delete, and the Architecture API summary does not clearly include Exercise update. This pitch does not silently add full exercise editing. If editing is intended for MVP, the upstream roadmap should explicitly place it.
4. **"Notes" on custom exercises.** The PRD mentions custom exercise notes, but the Architecture Doc's Exercise definition does not contain a notes concept. Notes remain out of scope unless the planning docs are amended.

---

## Scope Check

Pitch 2 remains a coherent vertical slice. At completion, the lifter can manage the two reusable reference domains required by later training flows:

- **Exercise Library:** browse; search; filter; favorite; classify; create; archive.
- **Gym Management:** list; create; archive.

The data behavior and user-facing management surfaces ship together. This is not merely "add Exercise and Gym tables."

---

## Pitch Completion Test

| Question | Answer |
| -- | -- |
| What does the pitch deliver? | A personalized, searchable exercise catalog and gym list. |
| Does the full source catalog remain available? | Yes. |
| How does the lifter avoid digging through the entire catalog every time? | Favorites. |
| Can Favorites combine with muscle filtering and search? | Yes. |
| What does the normal muscle filter mean? | Primary muscle group only. |
| Can an exercise have other muscles involved? | Yes, as optional secondary muscle metadata. |
| Do secondary muscles make two exercises interchangeable? | No. |
| What controls future Exercise Swap eligibility? | Primary muscle group. |
| What does a custom exercise require? | Name, primary muscle group, and equipment type; secondary muscles are optional. |
| Does a custom exercise have an image? | No. |
| Are exercises and gyms hard-deleted? | No. They are archived. |
| Does this pitch implement gym-specific working weights? | No. |
| Does it implement a training plan or workout logging? | No. |
| Does Overload query `free-exercise-db` at runtime? | No. |
| Does adding a gym use maps or geolocation? | No. |
| Does Favorites generate or recommend a program? | No. |

With those boundaries fixed, the design-doc stage can focus entirely on making library and gym management fast, understandable, and useful on a phone without needing to reinterpret the underlying product model.
