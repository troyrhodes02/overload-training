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
 * Signup provenance over a real (embedded) Postgres (Public Landing Page &
 * Changelog OVE-99; amended by OVE-118). The /blizzy page and its attribution
 * were removed, so signup records no campaign any more. Values recorded
 * before that are kept: they belong to their own account only, travel with
 * the export, drive the Plan & Billing code reminder only where Subscribe
 * already appears, and reach the admin area as one aggregate count it cannot
 * change.
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

/**
 * A new account. `"blizzy"` stands for an account recorded before OVE-118
 * (the column is set directly, as only history now carries it).
 */
async function signUpAs(campaign: "blizzy" | null) {
  const userId = randomUUID();
  await establishProfile(
    { id: userId },
    {
      firstName: "Demo",
      lastName: "Lifter",
      username: `c_${userId.slice(0, 8)}`,
      timeZone: "UTC",
    },
  );
  if (campaign) {
    await getTestPrisma().profile.update({
      where: { userId },
      data: { signupCampaign: campaign },
    });
  }
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
  it("a new signup records no campaign (OVE-118)", async () => {
    expect(await campaignOf(await signUpAs(null))).toBeNull();
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

  it("a re-run of profile creation never clears a recorded campaign", async () => {
    const userId = await signUpAs("blizzy");
    await establishProfile(
      { id: userId },
      {
        firstName: "Demo",
        lastName: "Lifter",
        username: `c_${userId.slice(0, 8)}`,
        timeZone: "UTC",
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

  it("an account without a recorded campaign never sees it", async () => {
    const account = await accountFor(await signUpAs(null));
    process.env.STRIPE_BILLING_ENABLED = "true";
    expect((await getBillingScreen(account)).promoReminder).toBeNull();
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
