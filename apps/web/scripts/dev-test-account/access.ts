/**
 * The Pro ↔ Free switch for a disposable development test account (Pitch 21g
 * spec §11, RD-16). Operator tooling for `overload-dev` only (the CLI's guards
 * run before this module is reached); never imported by `src/`.
 *
 * The account's plan comes only from Overload's own comp entitlement here:
 *   - `free` sets `revokedAt` on its active comp row(s), the same column the
 *     admin center's revoke sets (an operator action: `revokedByUserId` null);
 *   - `pro` adds a new comp row (reason "tester"), as provisioning does.
 * Nothing is deleted and Stripe is never touched. It refuses an account with
 * an active trial or any billing mirror row, where comp would not be the
 * only source of the plan (the switch would then not do what it says).
 */
import type { PrismaClient } from "@prisma/client";

export type AccessTarget = "pro" | "free";

type Db = Pick<PrismaClient, "entitlement" | "billingAccount" | "$transaction">;

export type AccessPlan = {
  activeComps: number;
  activeTrial: boolean;
  billingRows: number;
  /** What --execute would do. */
  action: "revoke-comp" | "grant-comp" | "nothing";
  refusal: string | null;
};

export async function planAccess(
  db: Db,
  userId: string,
  target: AccessTarget,
  now = new Date(),
): Promise<AccessPlan> {
  const [activeComps, trials, billingRows] = await Promise.all([
    db.entitlement.count({
      where: {
        userId,
        source: "comp",
        revokedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    }),
    db.entitlement.count({
      where: {
        userId,
        source: "trial",
        revokedAt: null,
        endsAt: { gt: now },
      },
    }),
    db.billingAccount.count({ where: { userId } }),
  ]);
  const refusal =
    trials > 0
      ? "This account has an active trial, so switching comp would not change its plan. Use a test account created by this tool."
      : billingRows > 0
        ? "This account has a billing record. This tool never touches billing; use a test account created by this tool."
        : null;
  const action =
    target === "free"
      ? activeComps > 0
        ? "revoke-comp"
        : "nothing"
      : activeComps > 0
        ? "nothing"
        : "grant-comp";
  return {
    activeComps,
    activeTrial: trials > 0,
    billingRows,
    action,
    refusal,
  };
}

/** Apply the plan in one transaction; returns what was done. */
export async function executeAccess(
  db: Db,
  userId: string,
  plan: AccessPlan,
  now = new Date(),
): Promise<AccessPlan["action"]> {
  if (plan.refusal) throw new Error(plan.refusal);
  if (plan.action === "nothing") return "nothing";
  await db.$transaction(async (tx) => {
    if (plan.action === "revoke-comp") {
      await tx.entitlement.updateMany({
        where: { userId, source: "comp", revokedAt: null },
        data: { revokedAt: now },
      });
    } else {
      await tx.entitlement.create({
        data: {
          userId,
          source: "comp",
          plan: "pro",
          startedAt: now,
          endsAt: null,
          compReason: "tester",
          compNote:
            "Development test account: Pro switched on (dev:test-account --access pro)",
        },
      });
    }
  });
  return plan.action;
}
