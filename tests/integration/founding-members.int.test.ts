import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { parseArgs } from "../../scripts/operator/founding-members/cli";
import {
  executeFoundingMembers,
  planFoundingMembers,
} from "../../scripts/operator/founding-members/grant";

/**
 * Plans, Billing & Promo Codes — founding-member comp grant (RD-10). Proves the
 * operator script grants complimentary Pro to existing accounts through the
 * comp mechanism (not a Stripe subscription), is create-only and idempotent,
 * skips accounts that already have an active comp, and changes no training data.
 * The CLI defaults to a dry run.
 */

const future = () => new Date(Date.now() + 60_000).toISOString();

describe("planFoundingMembers", () => {
  it("includes un-comped accounts and skips those with an active comp", async () => {
    const a = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const alreadyPro = await createTestAccount("UTC", undefined, {
      entitlement: "pro",
    }); // default comp

    const plan = await planFoundingMembers(getTestPrisma(), {
      cutoffIso: future(),
    });
    const grantIds = plan.toGrant.map((c) => c.userId).sort();
    expect(grantIds).toEqual([a.userId, b.userId].sort());
    expect(plan.alreadyComped.map((c) => c.userId)).toContain(
      alreadyPro.userId,
    );
  });

  it("writes nothing (a dry run's planning step)", async () => {
    await createTestAccount("UTC", undefined, { entitlement: "none" });
    const before = await getTestPrisma().entitlement.count();
    await planFoundingMembers(getTestPrisma(), { cutoffIso: future() });
    expect(await getTestPrisma().entitlement.count()).toBe(before);
  });
});

describe("executeFoundingMembers", () => {
  it("grants one founding-member comp per account in one transaction, idempotently", async () => {
    const a = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const b = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });

    const plan = await planFoundingMembers(getTestPrisma(), {
      cutoffIso: future(),
    });
    const first = await executeFoundingMembers(getTestPrisma(), plan);
    expect(first.created).toBe(2);

    const comps = await getTestPrisma().entitlement.findMany({
      where: { source: "comp", userId: { in: [a.userId, b.userId] } },
    });
    expect(comps).toHaveLength(2);
    expect(comps.every((c) => c.compReason === "founding_member")).toBe(true);
    expect(comps.every((c) => c.plan === "pro")).toBe(true);
    // Operator batch, not an admin action.
    expect(comps.every((c) => c.grantedByUserId === null)).toBe(true);

    // Re-running the same plan is a no-op (active-comp unique index).
    const second = await executeFoundingMembers(getTestPrisma(), plan);
    expect(second.created).toBe(0);
    expect(
      await getTestPrisma().entitlement.count({ where: { source: "comp" } }),
    ).toBe(2);
  });

  it("creates no Stripe billing rows (comp is not a subscription)", async () => {
    await createTestAccount("UTC", undefined, { entitlement: "none" });
    const plan = await planFoundingMembers(getTestPrisma(), {
      cutoffIso: future(),
    });
    await executeFoundingMembers(getTestPrisma(), plan);
    expect(await getTestPrisma().billingAccount.count()).toBe(0);
  });
});

describe("CLI arguments", () => {
  it("defaults to a dry run with a now cutoff", () => {
    const args = parseArgs([]);
    expect(args.execute).toBe(false);
    expect(typeof args.before).toBe("string");
  });
  it("accepts --execute, an explicit --before, and --confirm-host", () => {
    const args = parseArgs([
      "--before",
      "2026-11-01T00:00:00Z",
      "--execute",
      "--confirm-host",
      "db.example.com",
    ]);
    expect(args).toMatchObject({
      before: "2026-11-01T00:00:00Z",
      execute: true,
      confirmHost: "db.example.com",
      unexpected: [],
    });
  });
});
