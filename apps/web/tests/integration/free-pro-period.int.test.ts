/**
 * The free-Pro period (OVE-266), end to end against a real database: the web
 * read path, the billing screen, checkout, the Stripe webhook, account
 * deletion, and the mobile API as the installed TestFlight 1.0.0 build calls
 * it. Only Supabase Auth is replaced (an opaque token "t.<userId>.s" verifies
 * as that user) and Stripe is a stub. The switch is the real environment
 * variable, read by the real resolver.
 *
 * What it proves: every account gets Pro results while it is on; nothing is
 * written because of it; comp and paid records are untouched; turning it off
 * returns each account to its own plan; checkout refuses before Stripe;
 * webhooks and deletion behave as before; a suspended account stays refused;
 * and one account's entitlement never reflects another's.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { GET as meRoute } from "@/app/api/mobile/v1/me/route";
import { GET as planRoute } from "@/app/api/mobile/v1/me/plan/route";
import { GET as historyRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/history/route";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import { getBillingScreen } from "@/lib/billing/screen";
import { startCheckout } from "@/lib/billing/checkout";
import { reconcileStripeEvent } from "@/lib/data/billing-webhook";
import { deleteAccount } from "@/lib/accounts/deletion";
import { addDays } from "@/lib/billing/config";
import { FREE_PRO_PERIOD_NOTE } from "@overload/shared/billing/copy";
import type { MeDto, MePlanDto } from "@overload/shared/contracts/account";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";

const db = () => getTestPrisma();
/** The version the installed TestFlight build sends (1.0.0, build 2). */
const TESTFLIGHT_VERSION = "1.0.0";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

async function call(
  handler: unknown,
  account: Account,
  params: Record<string, string> = {},
) {
  const res = await (handler as Handler)(
    new Request("http://localhost/api/mobile/v1/x", {
      headers: {
        "x-overload-app-version": TESTFLIGHT_VERSION,
        authorization: `Bearer t.${account.userId}.s`,
      },
    }),
    { params: Promise.resolve(params) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const savedEnv = {
  period: process.env.OVERLOAD_FREE_PRO_PERIOD,
  billing: process.env.STRIPE_BILLING_ENABLED,
};
const periodOn = () => (process.env.OVERLOAD_FREE_PRO_PERIOD = "true");
const periodOff = () => delete process.env.OVERLOAD_FREE_PRO_PERIOD;

beforeEach(() => {
  // Production today has STRIPE_BILLING_ENABLED=true; the period must win.
  process.env.STRIPE_BILLING_ENABLED = "true";
  periodOn();
});
afterAll(() => {
  for (const [key, value] of [
    ["OVERLOAD_FREE_PRO_PERIOD", savedEnv.period],
    ["STRIPE_BILLING_ENABLED", savedEnv.billing],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const freeAccount = () =>
  createTestAccount("UTC", randomUUID(), { entitlement: "none" });

async function addTrial(account: Account, startedAt: Date, endsAt: Date) {
  await db().entitlement.create({
    data: { userId: account.userId, source: "trial", startedAt, endsAt },
  });
}

async function addSubscription(account: Account) {
  await db().billingAccount.create({
    data: {
      userId: account.userId,
      stripeCustomerId: `cus_${randomUUID()}`,
      subscriptionId: `sub_${randomUUID()}`,
      status: "active",
      interval: "month",
      currentPeriodEnd: addDays(new Date(), 20),
    },
  });
}

/** Two finished sessions at the top of the range: a "progress" call (Pro). */
async function progressHistory(account: Account): Promise<string> {
  const meso = await createTestMesocycle({
    status: "active",
    userId: account.userId,
  });
  const ex = await createTestExercise({
    equipmentType: "barbell",
    userId: account.userId,
  });
  for (const date of ["2026-11-02", "2026-11-09"]) {
    const ls = await db().loggedSession.create({
      data: {
        userId: account.userId,
        mesocycleId: meso.id,
        performedOn: new Date(`${date}T12:00:00Z`),
        scheduledFor: new Date(`${date}T00:00:00Z`),
        status: "complete",
      },
    });
    const le = await db().loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: ex.id,
        plannedExerciseId: ex.id,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });
    for (let n = 1; n <= 3; n++) {
      await db().loggedSet.create({
        data: {
          userId: account.userId,
          loggedExerciseId: le.id,
          setNumber: n,
          weightLbs: 185,
          reps: 8,
        },
      });
    }
  }
  return ex.id;
}

/** Everything the period could conceivably write, across every account. */
async function billingState() {
  return {
    entitlements: await db().entitlement.findMany({ orderBy: { id: "asc" } }),
    billing: await db().billingAccount.findMany({
      orderBy: { userId: "asc" },
    }),
    webhookEvents: await db().webhookEvent.count(),
    notices: await db().profile.findMany({
      select: {
        userId: true,
        trialEndingNoticeAt: true,
        trialEndedNoticeAt: true,
      },
      orderBy: { userId: "asc" },
    }),
  };
}

describe("an ordinary Free account", () => {
  it("gets Pro results during the period and returns to Free after, with nothing stored", async () => {
    const a = await freeAccount();
    const exId = await progressHistory(a);
    const before = await billingState();

    const during = (await getExerciseHistory(a, exId))!;
    expect(during.locked).toBeNull();
    expect(during.next).toMatchObject({ kind: "call", tag: "progress" });
    expect(during.trend.e1rm).not.toBeNull();

    const screen = await getBillingScreen(a);
    expect(screen).toMatchObject({
      displayState: "included",
      label: "Pro — included for everyone",
      canSubscribe: false,
      billingEnabled: false,
      freeProPeriod: true,
      promoReminder: null,
    });
    expect(screen.explanation).toContain(FREE_PRO_PERIOD_NOTE);

    expect(await billingState()).toEqual(before);

    periodOff();
    const after = (await getExerciseHistory(a, exId))!;
    expect(after.locked).toBe("progression_insights");
    expect(after.next).toMatchObject({ tag: null, recommendation: null });
    expect((await getBillingScreen(a)).displayState).toBe("free");
    expect(await billingState()).toEqual(before);
  });
});

describe("trials", () => {
  it("an expired trial is included during and Free after", async () => {
    const a = await freeAccount();
    await addTrial(a, addDays(new Date(), -30), addDays(new Date(), -16));
    expect((await getBillingScreen(a)).displayState).toBe("included");
    periodOff();
    expect((await getBillingScreen(a)).displayState).toBe("free");
  });

  it("an active trial keeps its row and its clock; it reads as a trial again after", async () => {
    const a = await freeAccount();
    const ends = addDays(new Date(), 5);
    await addTrial(a, addDays(new Date(), -9), ends);
    const during = await getBillingScreen(a);
    expect(during.displayState).toBe("included");
    expect(during.trialDaysLeft).toBe(5);
    periodOff();
    const after = await getBillingScreen(a);
    expect(after.displayState).toBe("trial");
    expect(after.trialDaysLeft).toBe(5);
    const rows = await db().entitlement.findMany({
      where: { userId: a.userId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].endsAt?.getTime()).toBe(ends.getTime());
  });
});

describe("complimentary members", () => {
  it("an open-ended comp keeps its own state and its record, during and after", async () => {
    const a = await createTestAccount(); // open-ended comp
    const before = await db().entitlement.findMany({
      where: { userId: a.userId },
    });
    expect((await getBillingScreen(a)).displayState).toBe("comp");
    periodOff();
    expect((await getBillingScreen(a)).displayState).toBe("comp");
    expect(
      await db().entitlement.findMany({ where: { userId: a.userId } }),
    ).toEqual(before);
  });

  it("an expired comp is included during the period and Free after it", async () => {
    const a = await freeAccount();
    await db().entitlement.create({
      data: {
        userId: a.userId,
        source: "comp",
        startedAt: addDays(new Date(), -40),
        endsAt: addDays(new Date(), -1),
        compReason: "tester",
        grantedByUserId: a.userId,
      },
    });
    expect((await getBillingScreen(a)).displayState).toBe("included");
    periodOff();
    expect((await getBillingScreen(a)).displayState).toBe("free");
  });
});

describe("a paid subscriber", () => {
  it("keeps its real billing state and can still manage (cancel) it; no purchase is offered", async () => {
    const a = await freeAccount();
    await addSubscription(a);
    const screen = await getBillingScreen(a);
    expect(screen).toMatchObject({
      displayState: "paid_monthly",
      canManage: true,
      canSubscribe: false,
      freeProPeriod: true,
    });
    periodOff();
    expect((await getBillingScreen(a)).displayState).toBe("paid_monthly");
  });
});

describe("checkout", () => {
  it("is refused on the server before Stripe, and no billing row is created", async () => {
    const a = await freeAccount();
    await db().profile.update({
      where: { userId: a.userId },
      data: { emailVerifiedAt: new Date() },
    });
    const calls: string[] = [];
    const provider = new Proxy(
      {},
      {
        get: (_t, name) => async () => {
          calls.push(String(name));
          throw new Error("Stripe must not be called");
        },
      },
    );
    await expect(
      startCheckout(a, "month", {
        provider: provider as never,
        ownEmail: async () => "a@example.test",
        inAppShell: async () => false,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(calls).toEqual([]);
    expect(
      await db().billingAccount.count({ where: { userId: a.userId } }),
    ).toBe(0);
  });
});

describe("Stripe webhooks during the period", () => {
  it("still reconcile a verified event exactly as before, and a replay changes nothing", async () => {
    const a = await freeAccount();
    const event = {
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      object: {
        customer: "cus_period",
        subscription: "sub_period",
        client_reference_id: a.userId,
      },
    };
    const deps = {
      getSubscription: async () => ({
        subscriptionId: "sub_period",
        customerId: "cus_period",
        status: "active" as const,
        interval: "month" as const,
        currentPeriodEnd: addDays(new Date(), 30),
        cancelAtPeriodEnd: false,
        priceId: "price_monthly",
        promo: null,
      }),
    };
    expect(await reconcileStripeEvent(event, deps)).toEqual({
      status: "processed",
      userId: a.userId,
    });
    expect(await reconcileStripeEvent(event, deps)).toEqual({
      status: "duplicate",
    });
    expect((await getBillingScreen(a)).displayState).toBe("paid_monthly");
  });
});

describe("account deletion during the period", () => {
  it("still cancels the account's subscription first and removes only its rows", async () => {
    const a = await freeAccount();
    const b = await freeAccount();
    await addSubscription(a);
    await addSubscription(b);
    const cancelAllSubscriptions = jest.fn(async () => ({ canceled: ["x"] }));
    await deleteAccount(a, {
      deleteAuthUser: async () => "deleted" as const,
      billing: { cancelAllSubscriptions },
    });
    expect(cancelAllSubscriptions).toHaveBeenCalledTimes(1);
    expect(await db().profile.count({ where: { userId: a.userId } })).toBe(0);
    expect(
      await db().billingAccount.count({ where: { userId: b.userId } }),
    ).toBe(1);
  });
});

describe("the mobile API, as TestFlight 1.0.0 calls it", () => {
  it("/me, /me/plan, and exercise history carry Pro for a Free account, in the existing shapes", async () => {
    const a = await freeAccount();
    const exId = await progressHistory(a);
    const before = await billingState();

    const me = await call(meRoute, a);
    expect(me.status).toBe(200);
    const ent = (me.body as MeDto).entitlement;
    expect(Object.keys(ent).sort()).toEqual([
      "capabilities",
      "displayState",
      "plan",
      "sources",
      "trialDaysLeft",
    ]);
    expect(ent).toMatchObject({
      plan: "pro",
      sources: [],
      displayState: "included",
    });
    expect((me.body as MeDto).trialNotice).toBeNull();

    const plan = await call(planRoute, a);
    expect(plan.status).toBe(200);
    expect(plan.body as MePlanDto).toMatchObject({
      displayState: "included",
      label: "Pro — included for everyone",
      problem: false,
    });
    for (const key of [
      "prices",
      "canSubscribe",
      "canManage",
      "promoReminder",
      "freeProPeriod",
    ]) {
      expect(plan.body).not.toHaveProperty(key);
    }

    const history = await call(historyRoute, a, { exerciseId: exId });
    expect(history.status).toBe(200);
    expect(history.body.history.locked).toBeNull();
    expect(history.body.history.next).toMatchObject({
      kind: "call",
      tag: "progress",
    });

    expect(await billingState()).toEqual(before);

    periodOff();
    const meAfter = await call(meRoute, a);
    expect((meAfter.body as MeDto).entitlement).toMatchObject({
      plan: "free",
      capabilities: [],
      displayState: "free",
    });
    const historyAfter = await call(historyRoute, a, { exerciseId: exId });
    expect(historyAfter.body.history.locked).toBe("progression_insights");
  });

  it("a suspended account is still refused (403), and nothing is written", async () => {
    const s = await freeAccount();
    await db().profile.update({
      where: { userId: s.userId },
      data: { status: "suspended" },
    });
    const before = await billingState();
    for (const handler of [meRoute, planRoute]) {
      const r = await call(handler, s);
      expect([r.status, r.body.error.code]).toEqual([403, "account_suspended"]);
    }
    expect(await billingState()).toEqual(before);
  });

  it("one account's entitlement never reflects another's records", async () => {
    const free = await freeAccount();
    const comp = await createTestAccount();
    const paid = await freeAccount();
    await addSubscription(paid);

    const read = async (a: Account) =>
      ((await call(meRoute, a)).body as MeDto).entitlement;
    expect(await read(free)).toMatchObject({
      sources: [],
      displayState: "included",
    });
    expect(await read(comp)).toMatchObject({
      sources: ["comp"],
      displayState: "comp",
    });
    expect(await read(paid)).toMatchObject({
      sources: ["subscription"],
      displayState: "paid_monthly",
    });

    // Another account's exercise is not found, period or not.
    const exId = await progressHistory(comp);
    const foreign = await call(historyRoute, free, { exerciseId: exId });
    expect(foreign.status).toBe(404);

    periodOff();
    expect(await read(free)).toMatchObject({
      plan: "free",
      displayState: "free",
    });
    expect(await read(comp)).toMatchObject({
      plan: "pro",
      displayState: "comp",
    });
    expect(await read(paid)).toMatchObject({
      plan: "pro",
      displayState: "paid_monthly",
    });
  });
});
