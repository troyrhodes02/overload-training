/**
 * Plans, Billing & Promo Codes — founding-member comp grant (spec §6, RD-10;
 * CLAUDE operator-task rules). Operator tooling: never imported by `src/`, no
 * route, run by a human against production from the runbook.
 *
 * Existing accounts (created before plans shipped) become founding members with
 * complimentary Pro through the SAME comp mechanism the owner uses — not a fake
 * Stripe subscription. The plan is create-only and idempotent: an account that
 * already has an active comp is skipped (the partial unique index is the
 * backstop), nothing is ever deleted, overwritten, or merged, and no training
 * data is touched. A dry run prints exactly who would be granted and writes
 * nothing; --execute applies every grant in one transaction.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export class FoundingMembersRefused extends Error {}

export type FoundingMemberCandidate = { userId: string; createdAtIso: string };

export type FoundingMembersPlan = {
  /** Accounts that would be granted a founding-member comp. */
  toGrant: FoundingMemberCandidate[];
  /** Accounts already carrying an active comp (skipped, idempotent). */
  alreadyComped: FoundingMemberCandidate[];
  /** The cutoff: only accounts created on or before this instant are included. */
  cutoffIso: string;
};

type Db = Pick<PrismaClient, "profile" | "entitlement">;

/**
 * Compute the plan: every Profile created on or before `cutoffIso` that does
 * not already have an active (non-revoked) comp. Reads only; writes nothing.
 */
export async function planFoundingMembers(
  db: Db,
  opts: { cutoffIso: string },
): Promise<FoundingMembersPlan> {
  const cutoff = new Date(opts.cutoffIso);
  if (Number.isNaN(cutoff.getTime())) {
    throw new FoundingMembersRefused(`Invalid cutoff: ${opts.cutoffIso}`);
  }
  const profiles = await db.profile.findMany({
    where: { createdAt: { lte: cutoff } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const activeComps = await db.entitlement.findMany({
    where: { source: "comp", revokedAt: null },
    select: { userId: true },
  });
  const comped = new Set(activeComps.map((e) => e.userId));

  const toGrant: FoundingMemberCandidate[] = [];
  const alreadyComped: FoundingMemberCandidate[] = [];
  for (const p of profiles) {
    const row = { userId: p.userId, createdAtIso: p.createdAt.toISOString() };
    (comped.has(p.userId) ? alreadyComped : toGrant).push(row);
  }
  return { toGrant, alreadyComped, cutoffIso: cutoff.toISOString() };
}

/**
 * Apply the plan: one comp Entitlement per account, create-only, in ONE
 * transaction. skipDuplicates + the active-comp partial unique index make a
 * re-run a no-op. Returns the number actually created.
 */
export async function executeFoundingMembers(
  db: PrismaClient,
  plan: FoundingMembersPlan,
  now: Date = new Date(),
): Promise<{ created: number }> {
  if (plan.toGrant.length === 0) return { created: 0 };
  const data: Prisma.EntitlementCreateManyInput[] = plan.toGrant.map((c) => ({
    userId: c.userId,
    source: "comp",
    plan: "pro",
    startedAt: now,
    compReason: "founding_member",
    // grantedByUserId is null: this is an operator batch, not an admin action.
  }));
  const result = await db.$transaction(async (tx) => {
    const { count } = await tx.entitlement.createMany({
      data,
      skipDuplicates: true,
    });
    return count;
  });
  return { created: result };
}

export function formatPlan(plan: FoundingMembersPlan): string {
  return [
    `Founding-member comp grant (cutoff ${plan.cutoffIso})`,
    `  would grant:     ${plan.toGrant.length}`,
    `  already comped:  ${plan.alreadyComped.length} (skipped)`,
  ].join("\n");
}
