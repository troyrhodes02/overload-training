import "server-only";
import type { BillingAccount, CompReason, Entitlement } from "@prisma/client";
import { DomainError, isUniqueViolation, isUuid } from "@/lib/actions/result";
import { computeEntitlement } from "@/lib/entitlements/resolve";
import { BLIZZY } from "@/lib/billing/config";
import type {
  AdminAccountBillingDto,
  AdminBillingOverviewDto,
} from "@/lib/admin/types";
import { adminDb, inAdminTx } from "./db";
import { recordAudit } from "./audit";
import { assertAdmin, type AdminActor } from "./identity";

export type { AdminAccountBillingDto, AdminBillingOverviewDto };

/**
 * Plans, Billing & Promo Codes — the admin complimentary-access controls and
 * read-only billing visibility (spec §9, AC-3). The owner may grant/revoke a
 * comp (audited, in one transaction, never touching Stripe) and READ an
 * account's resolved entitlement + the Stripe mirror. It reads entitlement and
 * billing records only — never training content — through the admin-gated
 * client. A comp is never represented or counted as a paying subscriber.
 */

const ENTITLEMENT_FIELDS = {
  id: true,
  userId: true,
  source: true,
  plan: true,
  startedAt: true,
  endsAt: true,
  compReason: true,
  compNote: true,
  grantedByUserId: true,
  revokedAt: true,
  revokedByUserId: true,
  createdAt: true,
} as const;

const BILLING_FIELDS = {
  userId: true,
  stripeCustomerId: true,
  subscriptionId: true,
  status: true,
  interval: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  graceEndsAt: true,
  priceId: true,
  promoCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function grantComp(
  actor: AdminActor,
  input: {
    targetUserId: string;
    reason: CompReason;
    note?: string | null;
    endsAt?: Date | null;
  },
): Promise<{ granted: true }> {
  assertAdmin(actor);
  if (!isUuid(input.targetUserId)) {
    throw new DomainError("not_found", "Account not found.");
  }
  if (input.reason === "other" && !input.note?.trim()) {
    throw new DomainError("validation_error", "A note is required for Other.");
  }
  if (input.endsAt && input.endsAt.getTime() <= Date.now()) {
    throw new DomainError(
      "validation_error",
      "Pick a future end date or leave it open.",
    );
  }
  return inAdminTx(async (tx) => {
    const exists = await tx.profile.findUnique({
      where: { userId: input.targetUserId },
      select: { userId: true },
    });
    if (!exists) throw new DomainError("not_found", "Account not found.");
    try {
      await tx.entitlement.create({
        data: {
          userId: input.targetUserId,
          source: "comp",
          plan: "pro",
          startedAt: new Date(),
          endsAt: input.endsAt ?? null,
          compReason: input.reason,
          compNote: input.note ?? null,
          grantedByUserId: actor.userId,
        },
        select: { id: true },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "conflict",
          "This account already has complimentary access.",
        );
      }
      throw e;
    }
    await recordAudit(tx, actor, {
      action: "comp_granted",
      targetUserId: input.targetUserId,
    });
    return { granted: true };
  });
}

export async function revokeComp(
  actor: AdminActor,
  targetUserId: string,
): Promise<{ changed: boolean }> {
  assertAdmin(actor);
  if (!isUuid(targetUserId)) {
    throw new DomainError("not_found", "Account not found.");
  }
  return inAdminTx(async (tx) => {
    const { count } = await tx.entitlement.updateMany({
      where: { userId: targetUserId, source: "comp", revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId: actor.userId },
    });
    if (count === 0) return { changed: false };
    await recordAudit(tx, actor, {
      action: "comp_revoked",
      targetUserId,
    });
    return { changed: true };
  });
}

export async function getAccountBilling(
  actor: AdminActor,
  targetUserId: string,
  now: Date = new Date(),
): Promise<AdminAccountBillingDto | null> {
  assertAdmin(actor);
  if (!isUuid(targetUserId)) return null;
  const db = adminDb();
  const [ents, billing] = await Promise.all([
    db.entitlement.findMany({
      where: { userId: targetUserId },
      select: ENTITLEMENT_FIELDS,
    }),
    db.billingAccount.findUnique({
      where: { userId: targetUserId },
      select: BILLING_FIELDS,
    }),
  ]);
  const resolved = computeEntitlement(
    ents as unknown as Entitlement[],
    (billing as unknown as BillingAccount) ?? null,
    now,
  );
  const source: AdminAccountBillingDto["source"] = resolved.sources.includes(
    "subscription",
  )
    ? "subscription"
    : resolved.sources.includes("comp")
      ? "comp"
      : resolved.sources.includes("trial")
        ? "trial"
        : "none";

  const activeComp = ents.find(
    (e) =>
      e.source === "comp" &&
      e.revokedAt === null &&
      (e.endsAt === null || e.endsAt.getTime() > now.getTime()),
  );

  return {
    effectivePlan: resolved.plan,
    source,
    comp: activeComp
      ? {
          reason: activeComp.compReason as CompReason,
          note: activeComp.compNote,
          endsAt: activeComp.endsAt ? activeComp.endsAt.toISOString() : null,
          grantedAt: activeComp.startedAt.toISOString(),
        }
      : null,
    stripe: billing
      ? {
          status: billing.status,
          interval: billing.interval,
          currentPeriodEnd: billing.currentPeriodEnd
            ? billing.currentPeriodEnd.toISOString()
            : null,
          cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
          promoCode: billing.promoCode,
        }
      : null,
  };
}

export async function getBillingOverview(
  actor: AdminActor,
  now: Date = new Date(),
): Promise<AdminBillingOverviewDto> {
  assertAdmin(actor);
  const db = adminDb();
  const [
    activeSubscriptions,
    trials,
    complimentary,
    cancelingAtPeriodEnd,
    paymentProblems,
    redemptions,
  ] = await Promise.all([
    db.billingAccount.count({ where: { status: "active" } }),
    db.entitlement.count({
      where: { source: "trial", revokedAt: null, endsAt: { gt: now } },
    }),
    db.entitlement.count({ where: { source: "comp", revokedAt: null } }),
    db.billingAccount.count({
      where: { status: "active", cancelAtPeriodEnd: true },
    }),
    db.billingAccount.count({ where: { status: "past_due" } }),
    db.promoRedemption.findMany({
      where: { code: BLIZZY.code },
      select: { userId: true, redeemedAt: true },
      orderBy: { redeemedAt: "desc" },
    }),
  ]);

  // Resolve handles for the recent redemptions (metadata only).
  const recentUserIds = redemptions.slice(0, 10).map((r) => r.userId);
  const profiles = recentUserIds.length
    ? await db.profile.findMany({
        where: { userId: { in: recentUserIds } },
        select: { userId: true, username: true },
      })
    : [];
  const handle = new Map(profiles.map((p) => [p.userId, p.username]));

  return {
    activeSubscriptions,
    trials,
    complimentary,
    cancelingAtPeriodEnd,
    paymentProblems,
    promo: {
      code: BLIZZY.code,
      cap: BLIZZY.maxRedemptions,
      redeemed: redemptions.length,
      recent: redemptions.slice(0, 10).map((r) => ({
        handle: handle.get(r.userId) ?? "—",
        date: r.redeemedAt.toISOString().slice(0, 10),
      })),
    },
  };
}
