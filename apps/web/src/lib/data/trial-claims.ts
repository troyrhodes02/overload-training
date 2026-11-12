import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizeEmailKey } from "@/lib/accounts/signup-guards";

/**
 * One trial per person (signup hardening, item 2a). Shipped DARK: signup calls
 * this module ONLY when TRIAL_DEDUPE_ENABLED is true, so with the flag off the
 * `trial_claims` table is never queried and the app runs unchanged against a
 * database that doesn't have it.
 *
 * `trial_claims` is an UN-OWNED system table (like auth_throttle): no account
 * reaches it through the scoped client, RLS is deny-all, and it stores only
 * the SHA-256 of the normalized email key (never the address) plus the id of
 * the account that claimed it. A claim deliberately outlives its account, so
 * deleting and re-creating an account does not restart the trial.
 *
 * No backfill: claims start from the day dedupe is enabled.
 */

function keyHash(email: string): string | null {
  const key = normalizeEmailKey(email);
  return key ? createHash("sha256").update(key).digest("hex") : null;
}

/**
 * Claim the trial for this person. True when this account may have the trial
 * (first claim for the key, or a retry by the same account); false when
 * another account already claimed it. An address with no usable key is
 * treated as unique.
 */
export async function claimTrial(
  email: string,
  accountId: string,
): Promise<boolean> {
  const hash = keyHash(email);
  if (!hash) return true;
  const { count } = await prisma.trialClaim.createMany({
    data: [{ keyHash: hash, claimedBy: accountId }],
    skipDuplicates: true,
  });
  if (count === 1) return true;
  const existing = await prisma.trialClaim.findUnique({
    where: { keyHash: hash },
    select: { claimedBy: true },
  });
  return existing?.claimedBy === accountId;
}

/** Undo this account's claim (a signup that failed after claiming). */
export async function releaseTrialClaim(
  email: string,
  accountId: string,
): Promise<void> {
  const hash = keyHash(email);
  if (!hash) return;
  await prisma.trialClaim.deleteMany({
    where: { keyHash: hash, claimedBy: accountId },
  });
}
