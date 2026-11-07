import { randomUUID } from "node:crypto";
import { establishProfile } from "@/lib/data/account";
import { accountFor } from "@/lib/data/operator";
import { buildAccountExport } from "@/lib/accounts/export";
import { getBillingScreen } from "@/lib/billing/screen";
import { getAdminOverview } from "@/lib/data/admin/metrics";
import { adminActorFor } from "@/lib/data/admin/identity";
import { adminDb } from "@/lib/data/admin/db";
import { AdminScopeError } from "@/lib/data/admin/gate";
import { getTestPrisma } from "./support/db";

/**
 * Public Landing Page & Changelog — L4 (OVE-99; spec §8, §9, §14; RD-7, RD-9,
 * RD-10; P21-AC7) over a real (embedded) Postgres with migration
 * 9k_signup_campaign applied. Provenance is written once at profile creation,
 * belongs to its own account only, travels with the export, drives the Plan &
 * Billing code reminder only where Subscribe already appears, and reaches the
 * admin area as one aggregate count it cannot change.
 */

const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad21";
const savedAdmins = process.env.OVERLOAD_ADMIN_USER_IDS;
const savedBilling = process.env.STRIPE_BILLING_ENABLED;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = savedAdmins;
  process.env.STRIPE_BILLING_ENABLED = savedBilling;
});
afterEach(() => {
  process.env.STRIPE_BILLING_ENABLED = "true";
});

async function signUpAs(campaign: "blizzy" | null) {
  const userId = randomUUID();
  await establishProfile(
    { id: userId },
    {
      firstName: "Demo",
      lastName: "Lifter",
      username: `c_${userId.slice(0, 8)}`,
      timeZone: "UTC",
      signupCampaign: campaign,
    },
  );
  return userId;
}

const campaignOf = async (userId: string) =>
  (
    await getTestPrisma().profile.findUniqueOrThrow({
      where: { userId },
      select: { signupCampaign: true },
    })
  ).signupCampaign;

describe("signup provenance (RD-9)", () => {
  it("records blizzy on the new account, and nothing for an organic signup", async () => {
    const fromBlizzy = await signUpAs("blizzy");
    const organic = await signUpAs(null);
    expect(await campaignOf(fromBlizzy)).toBe("blizzy");
    expect(await campaignOf(organic)).toBeNull();
  });

  it("cross-account: each account's export carries only its own provenance", async () => {
    const a = await signUpAs("blizzy");
    const b = await signUpAs(null);
    const exportA = await buildAccountExport(await accountFor(a));
    const exportB = await buildAccountExport(await accountFor(b));
    expect(exportA.profile).toMatchObject({ signupCampaign: "blizzy" });
    expect(exportB.profile).toMatchObject({ signupCampaign: null });
    expect(JSON.stringify(exportB)).not.toContain(a);
  });

  it("a re-run of profile creation without a campaign never clears one (no duplicate/overwrite)", async () => {
    const userId = await signUpAs("blizzy");
    await establishProfile(
      { id: userId },
      {
        firstName: "Demo",
        lastName: "Lifter",
        username: `c_${userId.slice(0, 8)}`,
        timeZone: "UTC",
        signupCampaign: null,
      },
    );
    expect(await campaignOf(userId)).toBe("blizzy");
  });

  it("the database refuses a value outside the allowlist", async () => {
    const userId = await signUpAs(null);
    await expect(
      getTestPrisma().$executeRawUnsafe(
        `UPDATE profiles SET signup_campaign = 'other' WHERE user_id = $1::uuid`,
        userId,
      ),
    ).rejects.toThrow();
  });
});

describe("Plan & Billing code reminder (RD-7)", () => {
  it("shows BLIZZY to a blizzy-signup account only when Subscribe is offered", async () => {
    const userId = await signUpAs("blizzy");
    const account = await accountFor(userId);
    process.env.STRIPE_BILLING_ENABLED = "true";
    const on = await getBillingScreen(account);
    expect(on.canSubscribe).toBe(true);
    expect(on.promoReminder).toBe("BLIZZY");

    process.env.STRIPE_BILLING_ENABLED = "false";
    const off = await getBillingScreen(account);
    expect(off.canSubscribe).toBe(false);
    expect(off.promoReminder).toBeNull();
  });

  it("an organic account sees it only with a valid same-browser campaign hint", async () => {
    const account = await accountFor(await signUpAs(null));
    process.env.STRIPE_BILLING_ENABLED = "true";
    expect((await getBillingScreen(account)).promoReminder).toBeNull();
    expect(
      (await getBillingScreen(account, { campaignHint: "blizzy" }))
        .promoReminder,
    ).toBe("BLIZZY");
  });
});

describe("admin sees one aggregate it cannot change (RD-10)", () => {
  it("counts blizzy signups in the Overview", async () => {
    const actor = adminActorFor(ADMIN_ID, "UTC");
    const before = (await getAdminOverview(actor)).fromBlizzy;
    await signUpAs("blizzy");
    await signUpAs(null);
    const after = await getAdminOverview(actor);
    expect(after.fromBlizzy).toBe(before + 1);
    expect(JSON.stringify(after)).not.toMatch(/c_[0-9a-f]{8}/);
  });

  it("refuses an admin write to signupCampaign", async () => {
    const userId = await signUpAs(null);
    await expect(
      adminDb().profile.updateMany({
        where: { userId },
        data: { signupCampaign: "blizzy" } as never,
      }),
    ).rejects.toThrow(AdminScopeError);
    expect(await campaignOf(userId)).toBeNull();
  });
});
