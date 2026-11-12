# Docs Sync — One-Shot Prompt

The owner dropped an update pack into the repository root. Send Claude Code the one-line message in the chat that points at this file, or paste this whole prompt.

---

Docs sync for Overload. Docs only: do not change application code, configuration, environment variables, or the schema. Read CLAUDE.md, docs/planning/mobile-audit.md, and docs/planning/pitch-roadmap.md first.

An update pack was just dropped into the repository root. It overwrote these files: `docs/planning/pitch-roadmap.md`, `docs/planning/mobile-roadmap.md`, everything in `docs/pipeline/`, and everything in `.claude/skills/`. It did NOT include `CLAUDE.md`, `docs/planning/product-brief.md`, `docs/planning/prd.md`, or `docs/planning/architecture.md`, which you must update yourself in this task.

Branch from the latest `staging` as `chore/docs-sync`. Open one PR into `staging` and merge it when the checks are green. Never touch `main`. Create one Linear issue per numbered step in Overload V1 and keep statuses current. Decide, don't ask, and record decisions in the PR description. Verify every factual statement you write against the code or the audit, not against the old docs. When the code and a doc disagree, the code wins and the doc is corrected.

1. Check what the drop changed. Run `git status` and `git diff` on the overwritten files. If any overwritten file held repo-specific content that the pack does not carry (a shipped detail, a Resolved Decision, an edit made after the last pack), restore it. Keep the pack's new content. List every conflict you resolved.

2. Open signup. Signup is open to everyone with no invite code. The closed signup mode stays only as an emergency stop. Update CLAUDE.md, product-brief.md, prd.md, architecture.md, `.claude/skills/**`, and `docs/pipeline/**` so none of them says signup is invite-only, requires an invite code, or stays gated until a later pitch. Keep the TestFlight invitations (they are unrelated) and the closed mode. Describe the real signup defenses as they exist in the code: bot challenge, per-IP throttle, disposable-email blocklist, reserved usernames, and the hourly cap.

3. Correct statements the audit found stale, checking each against the code:
   - The scheduled deload is a cadence (`deloadEveryWeeks`, stored in the column `deload_week`), not a "designated week". Fix every doc and skill that says otherwise.
   - Entitlement: the stored sources are trial and comp. Subscription access comes from the `BillingAccount` mirror. Fix architecture.md.
   - A set edit does not trigger a recompute, because derived values are computed on read. Fix architecture.md.
   - Update the architecture data model to match `prisma/schema.prisma`. List every model and the fields that matter, including the ones the old doc omits.
   - Replace the illustrative `logSet` code example in CLAUDE.md with one that matches the real code (the scoped transaction, `applyBaselineOnCompletion`, `weightLbs`, `rir`), with accurate file paths.
   - A swap cannot be saved back to the template. Remove that statement.
   - Storage also holds feedback screenshots and plan-import files, not only exercise images. Fix CLAUDE.md and architecture.md.
   - Password recovery and email exist now. Remove every "none today" or "does not exist" statement about them, and describe the real recovery flow.

4. Update CLAUDE.md's Status paragraph and the rules for what has shipped: web fixes, the audit, and the pre-mobile hardening are done, and the next work is the mobile slices 21a to 21l. Record these behaviors in the right sections: all-time history; a completed workout refuses new sets and swaps; start-workout validates the scheduled date; missed-day resolution is validated; weights have at most two decimal places; web sign-out is session-local; a suspended account can export and delete through a narrow guard and nothing else; email verification is written only by the confirm route; account deletion cancels Stripe subscriptions first; one-trial-per-person dedupe exists behind a flag if it shipped.

5. Mobile alignment. In CLAUDE.md and architecture.md, make the mobile rules match `docs/planning/mobile-roadmap.md`: slices 21a to 21l; the layout (`apps/web`, `apps/mobile`, `packages/shared`) as planned, not yet built; token verification with `getUser(token)`; the proxy exemption for `/api/mobile`; idempotency keys on create endpoints; the `X-Overload-App-Version` header and the 426 `upgrade_required` error; the web-only list; native sign-up and the password-reset request; and that the app receives Pro calls from the API. Do not describe the mobile code as existing.

6. PRD and Brief. In prd.md, update the Mobile App feature to include sign-up and the password-reset request, add all-time history to the history feature, and add the suspended-account export and deletion behavior. In product-brief.md, remove invite-only wording and keep everything else.

7. Consistency pass. Check that every file path mentioned in the docs and skills exists or is clearly planned, that `docs/planning/pitch-roadmap.md` and `mobile-roadmap.md` agree on slice names and folders, that every skill's frontmatter is valid and each SKILL.md is under 500 lines (trim shipped-pitch detail if one is over), and that no document still refers to `.claude/CLAUDE.md`, `docs/runs`, `docs/specs`, `docs/design`, or the slices `21i` as the last one. Run the format check on the docs if the repository configures one.

Final message: the PR link, the list of files changed, the conflicts resolved in step 1, and a short list of any statement you could not verify against the code, with file and line.
