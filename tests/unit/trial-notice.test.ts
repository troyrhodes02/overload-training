/**
 * Trial upgrade UX & trial notices (OVE-112) — the pure phase rule, the copy,
 * the Pro highlights, the app-shell detector, and the pre-checkout disclosure.
 * No database and no clock: every boundary is pinned with explicit instants
 * and the account's own timezone.
 */
import type { BillingAccount, Entitlement } from "@prisma/client";
import {
  TRIAL_ENDED_NOTICE_WINDOW_DAYS,
  trialNoticePhase,
} from "@/lib/billing/trial-notice-phase";
import { proHighlights } from "@/lib/billing/pro-highlights";
import { PLAN_CAPABILITIES } from "@/lib/billing/config";
import { isAppShellUserAgent } from "@/lib/platform/app-shell";

jest.mock("@/app/(app)/trial-notice-actions", () => ({
  markTrialNoticeShownAction: jest.fn(),
}));
jest.mock("@/app/(app)/settings/billing/actions", () => ({}));
jest.mock("@/app/(app)/settings/actions", () => ({}));

const DAY = 24 * 60 * 60 * 1000;
const USER = "11111111-1111-4111-8111-111111111111";

function trial(endsAt: Date, over: Partial<Entitlement> = {}): Entitlement {
  return {
    id: "t",
    userId: USER,
    source: "trial",
    plan: "pro",
    startedAt: new Date(endsAt.getTime() - 14 * DAY),
    endsAt,
    compReason: null,
    compNote: null,
    grantedByUserId: null,
    revokedAt: null,
    revokedByUserId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

function comp(over: Partial<Entitlement> = {}): Entitlement {
  return {
    ...trial(new Date(0)),
    id: "c",
    source: "comp",
    startedAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: null,
    compReason: "founding_member",
    ...over,
  } as Entitlement;
}

function billing(over: Partial<BillingAccount> = {}): BillingAccount {
  return {
    userId: USER,
    stripeCustomerId: "cus_x",
    subscriptionId: null,
    status: null,
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    priceId: null,
    promoCode: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as BillingAccount;
}

const NONE = { ending: null, ended: null };

function phase(o: {
  ents: Entitlement[];
  now: Date;
  tz?: string;
  billing?: BillingAccount | null;
  shown?: { ending: Date | null; ended: Date | null };
}) {
  return trialNoticePhase({
    entitlements: o.ents,
    billing: o.billing ?? null,
    shown: o.shown ?? NONE,
    timeZone: o.tz ?? "UTC",
    now: o.now,
  });
}

describe("the one-day-remaining notice", () => {
  // Trial ends 2026-11-20 at 15:00 UTC.
  const END = new Date("2026-11-20T15:00:00.000Z");

  it("is due on the calendar day before the trial ends", () => {
    expect(
      phase({ ents: [trial(END)], now: new Date("2026-11-19T08:00:00Z") }),
    ).toEqual({ phase: "ending", endsToday: false });
  });

  it("is not due two calendar days before", () => {
    expect(
      phase({ ents: [trial(END)], now: new Date("2026-11-18T23:59:59Z") }),
    ).toBeNull();
  });

  it("on the last day (first visit then), says it ends today", () => {
    expect(
      phase({ ents: [trial(END)], now: new Date("2026-11-20T09:00:00Z") }),
    ).toEqual({ phase: "ending", endsToday: true });
  });

  it("uses the account's timezone, not UTC, for the calendar day", () => {
    // 2026-11-19T03:00Z is still Nov 18 in Chicago (UTC-6): two days out there.
    const now = new Date("2026-11-19T03:00:00Z");
    expect(phase({ ents: [trial(END)], now, tz: "UTC" })).toEqual({
      phase: "ending",
      endsToday: false,
    });
    expect(
      phase({ ents: [trial(END)], now, tz: "America/Chicago" }),
    ).toBeNull();
    // Later that Chicago day it is due.
    expect(
      phase({
        ents: [trial(END)],
        now: new Date("2026-11-19T07:00:00Z"),
        tz: "America/Chicago",
      }),
    ).toEqual({ phase: "ending", endsToday: false });
  });

  it("a trial ending just after local midnight belongs to that local day", () => {
    // Ends 2026-11-20T06:30Z = 00:30 Nov 20 in Chicago. On Nov 19 Chicago
    // evening (Nov 20 02:00Z) it ends "tomorrow" locally even though the UTC
    // date is already the end date.
    const end = new Date("2026-11-20T06:30:00Z");
    const now = new Date("2026-11-20T02:00:00Z");
    expect(phase({ ents: [trial(end)], now, tz: "America/Chicago" })).toEqual({
      phase: "ending",
      endsToday: false,
    });
    expect(phase({ ents: [trial(end)], now, tz: "UTC" })).toEqual({
      phase: "ending",
      endsToday: true,
    });
  });

  it("shows once: a recorded ending notice suppresses it", () => {
    expect(
      phase({
        ents: [trial(END)],
        now: new Date("2026-11-19T08:00:00Z"),
        shown: { ending: new Date("2026-11-19T07:00:00Z"), ended: null },
      }),
    ).toBeNull();
  });

  it("never for an account that already subscribed during the trial", () => {
    expect(
      phase({
        ents: [trial(END)],
        now: new Date("2026-11-19T08:00:00Z"),
        billing: billing({
          subscriptionId: "sub_1",
          status: "active",
          interval: "month",
        }),
      }),
    ).toBeNull();
  });

  it("never for a comped account", () => {
    expect(
      phase({
        ents: [trial(END), comp()],
        now: new Date("2026-11-19T08:00:00Z"),
      }),
    ).toBeNull();
  });

  it("never for a revoked trial", () => {
    expect(
      phase({
        ents: [trial(END, { revokedAt: new Date("2026-11-15T00:00:00Z") })],
        now: new Date("2026-11-19T08:00:00Z"),
      }),
    ).toBeNull();
  });
});

describe("the trial-ended notice", () => {
  const END = new Date("2026-11-20T15:00:00.000Z");

  it("is not due one millisecond before the authoritative end", () => {
    expect(
      phase({ ents: [trial(END)], now: new Date(END.getTime() - 1) }),
    ).toEqual({ phase: "ending", endsToday: true });
  });

  it("is due at the authoritative end instant and after", () => {
    expect(phase({ ents: [trial(END)], now: END })).toEqual({
      phase: "ended",
    });
    expect(
      phase({ ents: [trial(END)], now: new Date(END.getTime() + 3 * DAY) }),
    ).toEqual({ phase: "ended" });
  });

  it("is due even if the ending notice was never shown, and only once", () => {
    const now = new Date(END.getTime() + DAY);
    expect(
      phase({
        ents: [trial(END)],
        now,
        shown: { ending: new Date(END.getTime() - DAY), ended: null },
      }),
    ).toEqual({ phase: "ended" });
    expect(
      phase({
        ents: [trial(END)],
        now,
        shown: { ending: null, ended: new Date(END.getTime() + 1000) },
      }),
    ).toBeNull();
  });

  it("not for an account whose trial ended long ago", () => {
    expect(
      phase({
        ents: [trial(END)],
        now: new Date(
          END.getTime() + (TRIAL_ENDED_NOTICE_WINDOW_DAYS + 1) * DAY,
        ),
      }),
    ).toBeNull();
  });

  it("never for an active paid subscriber", () => {
    expect(
      phase({
        ents: [trial(END)],
        now: new Date(END.getTime() + DAY),
        billing: billing({
          subscriptionId: "sub_1",
          status: "active",
          interval: "year",
        }),
      }),
    ).toBeNull();
  });

  it("never for an account that had a subscription that has since ended", () => {
    expect(
      phase({
        ents: [trial(END)],
        now: new Date(END.getTime() + DAY),
        billing: billing({ subscriptionId: "sub_1", status: "canceled" }),
      }),
    ).toBeNull();
  });

  it("is due for an account that only opened (and abandoned) checkout", () => {
    // A Stripe customer exists, but no subscription was ever recorded.
    expect(
      phase({
        ents: [trial(END)],
        now: new Date(END.getTime() + DAY),
        billing: billing(),
      }),
    ).toEqual({ phase: "ended" });
  });

  it("never for a comped account (active, or since lapsed)", () => {
    const now = new Date(END.getTime() + DAY);
    expect(phase({ ents: [trial(END), comp()], now })).toBeNull();
    expect(
      phase({
        ents: [trial(END), comp({ endsAt: new Date(END.getTime() + 1000) })],
        now,
      }),
    ).toBeNull();
  });

  it("not for an account with no trial at all", () => {
    expect(phase({ ents: [], now: new Date() })).toBeNull();
  });
});

describe("Pro highlights follow the capability model", () => {
  it("names one line per Pro capability when plan import is on", () => {
    const lines = proHighlights({ planImportEnabled: true });
    expect(lines).toHaveLength(PLAN_CAPABILITIES.pro.length);
    expect(lines.join(" ")).toMatch(/import/i);
  });

  it("never promises plan import while its kill switch is off", () => {
    const lines = proHighlights({ planImportEnabled: false });
    expect(lines).toHaveLength(PLAN_CAPABILITIES.pro.length - 1);
    expect(lines.join(" ")).not.toMatch(/import/i);
  });

  it("reads the real kill switch by default (off unless exactly 'true')", () => {
    const prev = process.env.PLAN_IMPORT_ENABLED;
    delete process.env.PLAN_IMPORT_ENABLED;
    try {
      expect(proHighlights().join(" ")).not.toMatch(/import/i);
    } finally {
      process.env.PLAN_IMPORT_ENABLED = prev;
    }
  });

  it("covers the calls, the e1RM trends, RIR, and history intelligence", () => {
    const all = proHighlights({ planImportEnabled: false }).join(" ");
    expect(all).toMatch(/progress, hold, and deload/i);
    expect(all).toMatch(/one-rep max/i);
    expect(all).toMatch(/RIR/);
    expect(all).toMatch(/rep records/i);
  });
});

describe("notice copy", () => {
  let trialNoticeCopy: typeof import("@/components/billing/trial-notice-dialog").trialNoticeCopy;
  beforeAll(async () => {
    ({ trialNoticeCopy } =
      await import("@/components/billing/trial-notice-dialog"));
  });

  it("ending, on the web: Keep Pro / Maybe later", () => {
    const c = trialNoticeCopy({ phase: "ending", purchasable: true });
    expect(c.title).toBe("Your Pro trial ends tomorrow");
    expect(c.body).toContain("one day left");
    expect(c.body).toContain("unless you subscribe");
    expect(c.primary).toBe("Keep Pro");
    expect(c.secondary).toBe("Maybe later");
  });

  it("ending today reads as today", () => {
    const c = trialNoticeCopy({
      phase: "ending",
      purchasable: true,
      endsToday: true,
    });
    expect(c.title).toBe("Your Pro trial ends today");
  });

  it("ended, on the web: Upgrade to Pro / Continue with Free", () => {
    const c = trialNoticeCopy({ phase: "ended", purchasable: true });
    expect(c.title).toBe("Your Pro trial has ended");
    expect(c.body).toContain("You're now on Overload Free");
    expect(c.primary).toBe("Upgrade to Pro");
    expect(c.secondary).toBe("Continue with Free");
  });

  it.each(["ending", "ended"] as const)(
    "%s, not purchasable (app shell or billing off): facts only, one Got it",
    (p) => {
      const c = trialNoticeCopy({ phase: p, purchasable: false });
      expect(c.primary).toBeNull();
      expect(c.secondary).toBe("Got it");
      expect(c.body).not.toMatch(/subscribe|upgrade|checkout|pay/i);
    },
  );
});

describe("app-shell detection", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 OverloadApp/1.0",
      true,
    ],
    ["Mozilla/5.0 (iPhone) OverloadApp", true],
    ["Mozilla/5.0 (Macintosh) Safari/605.1.15", false],
    ["Mozilla/5.0 NotOverloadApp/1.0", false],
    ["", false],
  ])("%s → %s", (ua, expected) => {
    expect(isAppShellUserAgent(ua)).toBe(expected);
  });

  it("no user agent is a browser", () => {
    expect(isAppShellUserAgent(null)).toBe(false);
    expect(isAppShellUserAgent(undefined)).toBe(false);
  });
});

describe("the pre-checkout disclosure", () => {
  let checkoutDisclosure: typeof import("@/components/billing/plan-billing").checkoutDisclosure;
  beforeAll(async () => {
    ({ checkoutDisclosure } =
      await import("@/components/billing/plan-billing"));
  });
  const prices = { monthly: "$4.99", annual: "$39.99" };

  it("a trial account is told paid billing starts today, with the selected price", () => {
    const m = checkoutDisclosure("month", prices, true);
    expect(m.summary).toBe("Pro Monthly — $4.99/month.");
    expect(m.detail).toContain("starts paid billing today");
    expect(m.detail).toContain("$4.99 is charged when you complete checkout");
    expect(m.leave).toContain("your trial continues");
    const y = checkoutDisclosure("year", prices, true);
    expect(y.summary).toBe("Pro Annual — $39.99/year.");
    expect(y.detail).toContain("$39.99 is charged");
  });

  it("a Free account sees the price without trial wording", () => {
    const m = checkoutDisclosure("month", prices, false);
    expect(m.detail).not.toMatch(/trial/i);
    expect(m.detail).toContain("$4.99");
  });
});
