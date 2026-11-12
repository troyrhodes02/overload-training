import { randomUUID } from "node:crypto";
import { establishProfile } from "@/lib/data/account";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { accountFor } from "@/lib/data/operator";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/config";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * Plans, Billing & Promo Codes — the 14-day trial is created AT SIGNUP (RD-3),
 * and only there. A new account (through establishProfile, the signup path)
 * gets a trial and resolves Pro. An account that predates billing has no
 * Entitlement row and correctly resolves Free — it is NOT retroactively given a
 * trial; existing accounts become Pro via the founding-member comp (B6) or an
 * admin comp grant. This pins the behavior the preview surfaced (a pre-billing
 * account showing Free, which is expected, not a bug).
 */

describe("trial at signup", () => {
  it("establishProfile creates a 14-day Pro trial, and the account resolves Pro", async () => {
    const userId = randomUUID();
    await establishProfile(
      { id: userId },
      {
        firstName: "Tess",
        lastName: "Trial",
        username: `t_${userId.slice(0, 8)}`,
        timeZone: "UTC",
      },
    );

    const ents = await getTestPrisma().entitlement.findMany({
      where: { userId },
    });
    expect(ents).toHaveLength(1);
    expect(ents[0].source).toBe("trial");
    expect(ents[0].plan).toBe("pro");
    expect(ents[0].endsAt).not.toBeNull();
    const days = Math.round(
      (ents[0].endsAt!.getTime() - ents[0].startedAt.getTime()) / 86_400_000,
    );
    expect(days).toBe(TRIAL_DURATION_DAYS);

    const resolved = await resolveEntitlement(
      await accountFor(userId),
      new Date(),
    );
    expect(resolved.plan).toBe("pro");
    expect(resolved.displayState).toBe("trial");
    expect(resolved.trialDaysLeft).toBeGreaterThan(0);
  });

  it("is idempotent: a re-run does not create a second trial", async () => {
    const userId = randomUUID();
    const input = {
      firstName: "Tess",
      lastName: "Trial",
      username: `t_${userId.slice(0, 8)}`,
      timeZone: "UTC",
    };
    await establishProfile({ id: userId }, input);
    await establishProfile({ id: userId }, input);
    expect(
      await getTestPrisma().entitlement.count({
        where: { userId, source: "trial" },
      }),
    ).toBe(1);
  });
});

describe("a pre-billing account (no entitlement) resolves Free", () => {
  it("an account with no entitlement records is Free, not a trial", async () => {
    // Mirrors an account created on the production app before billing shipped:
    // its profile exists but no trial row was ever written.
    const account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const resolved = await resolveEntitlement(account, new Date());
    expect(resolved.plan).toBe("free");
    expect(resolved.displayState).toBe("free");
    expect(resolved.trialDaysLeft).toBeNull();
  });
});
