# Release: Pitch 21l — TestFlight Beta, release A

**Status:** approved by the owner on 2026-11-26; merged by the run on the owner's instruction.

## What it carries

| Commit on staging | PR | Change |
| --- | --- | --- |
| `93b3c2a` | #344 | Docs: the 21k closeout (staging only until now) |
| `845a486` | #347 (#345, #346) | OVE-255, OVE-260's `me` change, OVE-261, the review fixes, and the 21l docs |
| `805e27f` | #351 | OVE-255 release-review fix: an inconclusive second look is repeated (up to 3), then the phone signs out quietly, so the launch screen never waits forever. Mobile-only |

Selected by cherry-pick onto `main` at `4aacae7`. Apart from this record, the release tree equals `staging` at `845a486` plus `805e27f`. It does **not** carry the "Overload on iPhone" release note (#348): that is release B, merged at the start of the beta (spec RD-25).

## What changes in Production

- **Web and API:** one behavior. `GET /api/mobile/v1/me` no longer holds back What's New and the trial notice for an account due its tour while `MOBILE_TOUR_AUTO_START` is off (it is off). No contract change. The web's own pages are unchanged.
- **The iPhone app's source** gains its Production profile. Nothing reaches a phone until the owner builds it (runbook §3).
- **No migration. No environment variable. No Stripe, Auth, Storage, or RLS change.**

## Compatibility

- The only installed app is the owner's staging development build (0.1.0, runtime `2e4a65d9cd…`). It talks to staging, not Production.
- The `me` change only makes fields that could be null non-null in more cases, and every client already handles both.
- `minimumAppVersion` stays `0.0.0`.
- The isolation suite covers every mobile endpoint, including `GET /me`.

## Verification (on the release branch)

| Check | Result |
| --- | --- |
| Format, lint, typecheck, workspace boundaries | pass (one pre-existing lint warning in `history-week.ts`) |
| Web unit | 2,785 passed |
| Mobile unit | 781 passed (with #351; 6 new) |
| Integration, including cross-account isolation | 1,696 passed in 116 suites (on the release tree before #351, which touches no web file) |
| Web production build and client-bundle scan | pass; no server secret in `.next/static` |
| iOS export, Production and staging | pass; no server secret; each bundle carries only its own anon key |
| Runtime fingerprints | staging `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c` (unchanged); Production `920ec3f2fadf247795ba7876b975db0d35706fec` measured locally (unchanged by #351; the EAS build reports the real one). An earlier record of `e8a58a87…` came from a malformed local command |
| Independent review (feature) | nothing blocking; should-fix items fixed |
| Independent review (release diff) | nothing blocking; one should-fix (the launch screen could wait forever after an inconclusive second look) fixed by #351; nits left |
| Vercel Preview for #347, #351, #349 | pass |

## Deployment checklist (owner)

1. Merge this PR (squash).
2. The run checks:
   - the Production deployment is Ready;
   - `app-config` still answers `tourAutoStart: false`;
   - `GET /me` without a token answers 401;
   - the version gate holds.
3. The run syncs `main` into `staging` with a merge-commit PR.
4. Then runbook §3: the build.

**Rollback:** promote the previous Production deployment in Vercel. Nothing is stored that would need undoing.
