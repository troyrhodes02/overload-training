# Landing-page screenshots — provenance, storyboard, and privacy check

**Pitch:** Public Landing Page & Changelog (Pitch 21, repo slug `20-public-landing-page-changelog`), ticket OVE-101.
**Status:** captured 2026-11-04 by the pipeline run. These are **genuine renders of the running app**, not mockups or generated images. The owner's approval of the imagery is still pending (runbook §Screenshots).

## Where they came from

| | |
| --- | --- |
| Environment | The **local Supabase CLI stack** on the run machine (`127.0.0.1:54321/54322`), plus a production build of this branch served on `http://localhost:3100`. **Never production.** Every database and Supabase variable was exported to the local stack, and the demo tools refuse anything else (`scripts/demo/guard.ts`). |
| Account | A local, synthetic account created through the app's **own signup page** (`npm run demo:capture -- signup`), `*.test` email, first name "Demo". It received the normal signup state: 14-day trial, tour due, release notes caught up. No public demo login exists. |
| Data | `scripts/demo/fixture.ts`, fixture **`demo-v1`**, anchor date **2026-11-04**, seeded by `npm run demo:seed` (dry run first, then `--execute --confirm-user`), all through the app's write modules. |
| Capture | `npm run demo:capture -- shots` (Playwright, Chrome, device scale 2). Light and dark × desktop (1280-wide viewport, cropped to the app's content column) and phone (390×844). Views first in every variant; the logging card last, because it starts today's workout through the app. |
| Files | `public/marketing/screens/*.png` (24 files, about 2.1 MB), listed with this provenance in `src/lib/marketing/screenshots.ts`. CI checks that each file exists and that each entry is marked synthetic. |

## Storyboard (also the click-through demo order)

The same five steps work as a recorded Navattic or Supademo-style tour later. No third-party tool or script was added in this pitch, and adopting one needs owner review (runbook).

1. **Today** (`today`): week 4 of Strength Block 2. Barbell Bench Press shows *Progress: Try 185 lb (+5)* with "8 reps on every set, 2 sessions running". Standing Military Press shows *Deload: a set below 6 reps, 2 sessions running*. Incline Dumbbell Press shows nothing, because a hold carries no tag.
2. **The logging card** (`logging`): Barbell Bench Press, "Last time · Oct 28 · 180 × 8, 8, 8", "Try 185 lb today (+5 lb)", set 1 ready.
3. **The call and its evidence** (`exercise`): the bench page's Next time block and records.
4. **One machine, two gyms** (`gym-northside`, `gym-riverside`): Leverage Chest Press. *Stay at 130 lb* at Northside Strength, *Stay at 160 lb* at Riverside Fitness, each gym with its own records.
5. **The trend** (`trend`): estimated 1RM by session over eight sessions, with the scheduled deload week marked.

## Privacy and quality checklist (done for this capture)

- [x] Synthetic data only: fictional "Demo Lifter", fictional gyms (Northside Strength, Riverside Fitness), and library exercise names and images (free-exercise-db, public domain).
- [x] No email address, user id, session token, or URL bar is visible in any image. The account menu is closed.
- [x] No debug overlay: this is a production build, not `next dev`.
- [x] No environment-specific URL or key appears in any image.
- [x] No real lifter's data was read. The capture account was created and seeded on the isolated local database.
- [x] Each capture was compared against its route in light and dark. Today shows "Start workout" in every variant (views captured before the logging step).
- [ ] **Owner:** approve the imagery and captions before production (marketing claims ledger in the runbook).

## Notes found while capturing (for the owner)

- **Existing behavior, not changed:** a machine's "Stay at …" weight comes from the gym baseline, which only corrects when a logged weight differs by more than the 15% margin. A first fixture draft (125 → 130 lb at one gym) produced "Stay at 125 lb" right after a 130 lb session. The fixture now uses one machine weight per gym, so the screenshots are consistent. The underlying behavior is reported in the run report for a later decision.
- The Today screen shows "once gym is set" beside Wide-Grip Lat Pulldown (a cable exercise, gym-variable) before a workout's gym is chosen. That is real app behavior, captured as is.
- Re-capturing needs a **fresh** local account, because the seed never edits or deletes. Every capture run created one more local `*.test` account on the local stack. Those are local only and were never on production.
