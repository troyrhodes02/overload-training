# Overload Git Branching and Release Workflow

A permanent rule. It applies to every Overload conversation, run prompt, and Claude Code session. The same rule is in `CLAUDE.md`, the ChatGPT project instructions, and the Claude project instructions.

## Three development stages

**Production (`main`)**
- Connected to the Production Supabase project.
- Contains only approved, released functionality.
- Never merge untested features directly into `main`.
- Production migrations, AI-provider activation, billing changes, and destructive operations require explicit owner approval.

**Permanent staging (`staging`)**
- Connected exclusively to the `overload-dev` Supabase project.
- Uses a stable Vercel Preview URL.
- Intended for rapid development, testing, experimentation, and bug fixing.
- Routine development migrations and disposable test-data changes can proceed using the existing environment identity guards (OVE-111).
- Staging is persistent. Never delete or recreate it as part of normal feature delivery.

**Feature branches**
- Branch from the latest `staging`.
- Open feature PRs targeting `staging`, not `main`.
- Merge completed implementation into `staging` for browser testing.
- Keep unfinished features out of Production.

## Production promotion

After the owner approves a feature on staging:

1. Create a fresh release branch from the latest `main`.
2. Transfer only the approved feature changes and their tested fixes, using carefully selected commits, cherry-picks, or an equivalent verified method.
3. Include required dependencies, database migrations, documentation, and feature flags.
4. Compare the resulting release diff with the approved staging implementation.
5. Verify no unrelated staging features or development-only behavior are included.
6. Run applicable quality, security, and Production-readiness checks.
7. Open a release PR targeting `main`.
8. Never merge or deploy the release PR automatically.
9. Report the outstanding Production approvals and the exact owner actions.
10. After the Production release succeeds, synchronize `main` back into `staging` without overwriting unfinished work.

Never open a Production PR directly from the `staging` branch as a shortcut. Never assume that passing staging tests constitutes approval for Production database migrations, provider spending, or external integrations.

## Mobile app releases

The mobile app follows the same stages. Development builds connect to staging, and a run may publish an over-the-air update to the Expo `staging` channel if a staging-only token is configured. Publishing to the Expo `production` channel, building for or uploading to TestFlight, and any store submission are human steps. A release that includes the mobile API also needs a backward-compatibility check against the app versions in the wild, since old versions stay installed.

## Hazard to watch: migration order

Prisma migrations are ordered. A migration for an approved feature may depend on, or sit after, a migration for an unapproved one. If an approved migration cannot be transferred without an unapproved migration, stop and report instead of transferring both.

## Working style

Use one-shot engineering prompts where possible. Complete safe development tasks autonomously, minimize unnecessary approval cycles on staging, and stop at genuine Production safety boundaries.

The owner prefers concise explanations, explicit commands, clear checkpoints, and minimal repetitive infrastructure verification.
