# OVERLOAD — One-Shot Production Promotion

Paste into Claude Code after a feature has been tested and approved on staging. Fill in the feature line first.

---

The following feature has been tested and approved on Overload's permanent staging environment:

Feature / PR / ticket: [INSERT FEATURE, PR, OR TICKET]

Objective: Prepare a safe, isolated Production release PR containing only this approved feature and its necessary dependencies.

Complete the engineering preparation autonomously. Do not merge into Production.

## Phase 1 — Identify approved changes

1. Read `CLAUDE.md`, the environment-isolation documentation, staging documentation, and any relevant feature PRs, requirements, and runbooks.
2. Fetch the latest `main` and `staging`.
3. Identify the exact approved feature changes, including bug fixes made during staging testing.
4. Identify shared dependencies or earlier staging changes required by this feature.
5. Distinguish approved feature changes from unrelated, unfinished, or experimental staging work.
6. If the approved change set cannot be isolated reliably, stop and explain the ambiguity rather than transferring unrelated changes. Prisma migrations are ordered: if an approved migration depends on, or sits after, an unapproved migration, stop and report.

## Phase 2 — Prepare the release branch

1. Start a fresh branch from the latest `origin/main`, named `release/[feature-name]`.
2. Transfer only approved feature changes and necessary dependencies using verified cherry-picks, patches, or another appropriate Git method.
3. Preserve Production-specific settings and existing environment protections.
4. Do not copy development credentials, temporary test fixtures, staging-only bypasses, or environment-specific configuration into Production.
5. Include the required Prisma migration files, feature flags, documentation, and deployment dependencies.
6. Verify that the release implementation matches the approved staging behavior.
7. Ensure no unrelated staging changes are included.

## Phase 3 — Validate Production readiness

Run the applicable:

- Formatting, linting, and type checks.
- Unit and integration tests.
- Production build.
- Security and authorization tests, including the cross-account isolation suite.
- Database migration review.
- Feature-specific acceptance checks.
- Client-bundle secret scan.
- Relevant runbook checks and quality gates.
- If the release includes the mobile API, backward compatibility with the mobile app versions in the wild, the version gate, and the mobile endpoints in the cross-account isolation suite.

Identify:

- Required Production environment variables.
- Required Production migrations.
- Backup and recovery requirements.
- Provider spending and data-consent approvals.
- Scheduled jobs and infrastructure dependencies.
- Any additional release blockers.

Do not interpret a passing staging test as authorization to perform Production database or service changes.

## Phase 4 — Open the release PR

1. Push the release branch.
2. Open a GitHub PR targeting `main`.
3. Confirm its base is `main`, not `staging`.
4. Include a release summary and a link to the original staging PR.
5. Explain how the approved changes were selected.
6. Document tests performed and outstanding limitations.
7. Include an explicit Production deployment checklist.
8. Identify all required owner approvals and manual dashboard actions.

Do not merge the PR.

## Phase 5 — Stop at Production boundaries

Do not:

- Apply Production database migrations.
- Modify Production Supabase Auth, Storage, or RLS.
- Enable paid AI providers or billing integrations.
- Change Production environment variables.
- Publish to the Expo `production` channel, build for or upload to TestFlight, or submit to a store.
- Merge or deploy the release PR.
- Force-push or rewrite protected Git history.
- Reset databases or delete Production data.

Explicit owner approval is required before any Production-affecting operation.

## Final response

Provide:

1. Release PR URL.
2. Exact approved feature scope included.
3. Tests and validation results.
4. Confirmation that no unrelated staging features are included.
5. Production readiness blockers.
6. Required manual configuration and approvals.
7. Recommended order of Production release actions.
8. Post-release verification checklist.
9. Instructions for synchronizing `main` back into `staging` after the release.

Stop after opening the release PR. Wait for the owner to approve the Production release.
