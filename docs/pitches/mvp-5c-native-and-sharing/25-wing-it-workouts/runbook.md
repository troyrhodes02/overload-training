# Pitch 25 — Wing-It Workouts: runbook

What the owner does outside the codebase. The run delivered Pitch 25 to **staging only**. Nothing in this runbook has been done in Production.

## 1. Status

| Step | State |
| --- | --- |
| Migration `9t_wing_it_workouts` on `overload-dev` | Applied by the run (2026-11-27), through `scripts/operator/migrate-dev` |
| Feature merged into `staging` | Done — #361, `6c13019` |
| Staging web deployment | Ready; staging API smoke-checked (§4) |
| Expo **staging** update (runtime `2e4a65d9cd…`) | Published — group `05da3995…` (§4) |
| OVE-273 retest — three consecutive sets on the iPhone | Passed (owner, 2026-11-28) |
| OVE-274 retest — keypad Done, no automatic focus | **Pending (owner)** |
| Owner device check 1 — Wing-It without a plan | **Pending (owner)** |
| Owner device check 2 — Wing-It beside a scheduled workout | **Pending (owner)** |
| Production release (web + migration) | **Not authorized by this run** — a separate owner-run promotion |
| Production Expo update / iOS build / TestFlight | **Not authorized** — not done; TestFlight 1.0.0 (2) is untouched |

## 2. Owner device checks (one at a time, on Overload Dev)

Overload Dev connects to staging. First pull the staging update: open the app, then close it fully and open it again (the update applies on the next launch). In More → About this app, the update id should match §4.

Accounts: disposable `overload-dev` accounts made for these checks. Their passwords are in `~/.overload-dev/accounts/<email>.txt`; copy one without printing it:

```bash
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/<email>.txt | tr -d '\n' | pbcopy
```

### Check 1 — Wing-It without a plan

Account: `p25-owner-noplan@example.com` (no plan; one gym, "P25 Garage").

1. Sign in on Overload Dev and open **Today**. Expect "No active plan." and a filled **Start Wing-It workout** button. (If the onboarding tour opens, skip it.)
2. Tap **Start Wing-It workout**. With one gym it starts straight away.
3. The workout opens empty: "No exercises yet." Tap **Add exercise**, pick any exercise (search works; "All" lists every group).
4. Log two sets with the usual card. After each set a new row opens.
5. Tap **Add exercise** again, pick a second exercise, log a set.
6. Tap **Finish workout**.
7. Open **History**: the week shows "Wing-It workout · Done"; open it and see both exercises and their sets.

**Pass:** a complete spontaneous workout works with no plan.

### Check 2 — Wing-It beside a scheduled workout

Account: `p25-owner-planned@example.com` (an active block; Today has a planned workout, e.g. Upper A on Friday).

1. Open **Today**. Expect the planned workout with **Start workout**, and below it the separate **Wing-It workout** card with **Start Wing-It workout** and "Today's planned workout stays as it is."
2. Tap **Start Wing-It workout**, choose a gym from the sheet, add an exercise, log one or more sets, **Finish workout**.
3. Open **History**: the Wing-It workout is listed on today, after the planned day.
4. Return to **Today**: the planned workout is still there, unchanged (still "Start workout", same exercises and calls), with "✓ Wing-It workout · …" in the Wing-It card.

**Pass:** Wing-It works as an explicit alternative without affecting the plan.

The web behavior was verified by the run (local production build against `overload-dev`, §5). Report any defect by its check number and step.

## 3. Production release (later, separate, owner-authorized)

Not part of this run. When the owner approves Pitch 25 for Production, follow `docs/pipeline/production-promotion-prompt.md`, with these Pitch-25 specifics:

1. **Read-only pre-check** of the Production database (aggregates only, no rows read):
   ```sql
   BEGIN TRANSACTION READ ONLY;
   SELECT count(*) AS sessions,
          count(*) FILTER (WHERE session_id IS NULL OR mesocycle_id IS NULL) AS without_plan_refs
     FROM logged_sessions;
   SELECT count(*) AS exercises,
          count(*) FILTER (WHERE planned_sets IS NULL OR target_rep_min IS NULL OR target_rep_max IS NULL) AS without_snapshot
     FROM logged_exercises;
   ROLLBACK;
   ```
   `without_snapshot` must be 0 (it is NOT NULL today). `without_plan_refs` is informational: the new CHECK does not require them for planned rows.
2. **Backup**, then apply `9t_wing_it_workouts` by hand (`prisma migrate deploy` against `DIRECT_URL`). It is additive: a new enum, two columns (one defaulted), relaxed NOT NULLs, CHECKs, two triggers, one partial unique index, one index. The currently deployed Production code keeps working on the migrated schema (it never writes the new columns, and every row it writes satisfies the constraints).
3. **Web release** of the Pitch 25 commits. Re-date the release note `2026-11-27-wing-it-workouts` (id and date) to the release day first, and keep it out of 21l's release B.
4. **TestFlight 1.0.0 (2)** stays compatible: the API changes are additive, the minimum app version is unchanged, and the old card model was tested against Wing-It answers. On that build a Wing-It workout started on the web can be resumed from Today's unfinished list or History, logged, and finished; it shows "n × 1–1000" as its scheme line (cosmetic). That build also keeps the original set merge fixed at acceptance (spec RD-37): on it, after a set in a Wing-It workout the next set appears only when the workout is reopened (leave and come back). Nothing is lost or duplicated; current builds advance immediately.
5. **Native release** of the Wing-It screens to Production phones is a Production Expo update or a new build — a human step, and not while Apple is reviewing 1.0.0 (2).

**Rollback note.** Rolling the web code back after Wing-It workouts exist leaves those rows in place; older code would show them with odd planned-set text but cannot corrupt them. The migration needs no rollback.

## 4. Staging delivery record

- Feature PR → `staging`: #361, squash `6c1301910f11f2d7e3eeea7bf28d1b0e1a4f4f3d` (tickets #362–#368).
- Staging web: `https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app` (deployment Ready). Smoke: `GET /api/mobile/v1/app-config` 200 and unchanged (`tourAutoStart: false`); `POST /wing-it-workouts`, `GET /workouts/{id}/exercise-candidates`, `GET /today` without a token → JSON 401 (the new routes are deployed, not 404).
- Expo staging update group: `05da3995-4390-4bd4-b8b8-1825dbabf3d4` · iOS update id: `01a21f50-acc6-76b0-a961-f02c7c98e2ee` · built from `6c13019`.
- **Superseded for device checks by the OVE-273 fix below.**
- OVE-273 (owner acceptance: no Set 2 after Set 1 on the iPhone): #370, squash `de57c3ad1f1acb9125b9e9ae28c5b6ded93aa9bf`. Expo staging update group `4b5ad96c-de41-45c2-8952-55fb8eee55b9` · iOS update id `01a21f89-72d8-7692-8848-5ff2b6c7a91d` · built from `de57c3a`. OVE-273 accepted on the iPhone (Set 1 → 2 → 3) on 2026-11-28.
- OVE-274 (owner feedback: keypad "Log set" logged sets when dismissing; auto-focus after a save): #372, squash `5c7058181546b9855840fd98df82928867a26f6c`. Expo staging update group `f91f33a1-bdf8-46c9-9557-997becf6682c` · iOS update id `01a22076-5c31-7572-8f80-f249bbbccfd1` · built from `5c70581`. **Use this update for the remaining device checks.**
- Runtime: `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c` (unchanged) · compatible build: `c22ac9a0` (Overload Dev). No new build is needed.
- Owner accounts (overload-dev, made 2026-11-27): `p25-owner-noplan@example.com` (no plan, gym "P25 Garage"), `p25-owner-planned@example.com` (active block; Friday Upper A, Saturday Lower A).

## 5. What the run verified

See the feature PR description for counts. Browser checks (local production build, `overload-dev`, light 390 px and dark 1280 px): no plan → start → add exercise → log → add mid-workout → finish → Today → History → detail; beside a scheduled Upper A that stays pending with its calls; History lists both; the planned start still works.
