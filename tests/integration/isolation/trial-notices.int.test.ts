import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import {
  getTrialNotice,
  markTrialNoticeShown,
} from "@/lib/billing/trial-notice";

/**
 * Cross-account isolation — trial notices (OVE-112). The shown-at state lives
 * on Profile (trialEndingNoticeAt / trialEndedNoticeAt). One account showing
 * or dismissing its notice never marks, reads, or reveals another account's;
 * each account's notice is computed from its own trial only.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-11T12:00:00.000Z");
let a: Account;
let b: Account;

async function giveTrial(account: Account, endsInMs: number) {
  const endsAt = new Date(NOW.getTime() + endsInMs);
  await getTestPrisma().entitlement.create({
    data: {
      userId: account.userId,
      source: "trial",
      plan: "pro",
      startedAt: new Date(endsAt.getTime() - 14 * DAY),
      endsAt,
    },
  });
}

const shownAt = (userId: string) =>
  getTestPrisma().profile.findUniqueOrThrow({
    where: { userId },
    select: { trialEndingNoticeAt: true, trialEndedNoticeAt: true },
  });

beforeEach(async () => {
  a = await createTestAccount("UTC", undefined, { entitlement: "none" });
  b = await createTestAccount("UTC", undefined, { entitlement: "none" });
});

it("one account's mark never moves another's notice state", async () => {
  await giveTrial(a, -DAY);
  await giveTrial(b, -DAY);
  await markTrialNoticeShown(a, "ended", NOW);
  expect((await shownAt(a.userId)).trialEndedNoticeAt).toEqual(NOW);
  expect(await shownAt(b.userId)).toEqual({
    trialEndingNoticeAt: null,
    trialEndedNoticeAt: null,
  });
  // B is still due its own notice; A is not.
  expect(
    await getTrialNotice(b, { inAppShell: false, now: NOW }),
  ).toMatchObject({ phase: "ended" });
  expect(await getTrialNotice(a, { inAppShell: false, now: NOW })).toBeNull();
});

it("each account's notice is computed from its own trial only", async () => {
  await giveTrial(a, DAY + 60 * 60 * 1000); // A: ends tomorrow
  // B has no trial at all.
  expect(
    await getTrialNotice(a, { inAppShell: false, now: NOW }),
  ).toMatchObject({ phase: "ending" });
  expect(await getTrialNotice(b, { inAppShell: false, now: NOW })).toBeNull();
});

it("B's scoped client can't read or write A's shown-at columns", async () => {
  await markTrialNoticeShown(a, "ending", NOW);
  expect(
    await b.db.profile.findUnique({
      where: { userId: a.userId },
      select: { trialEndingNoticeAt: true },
    }),
  ).toBeNull();
  const moved = await b.db.profile.updateMany({
    where: { userId: a.userId },
    data: { trialEndingNoticeAt: null },
  });
  expect(moved.count).toBe(0);
  expect((await shownAt(a.userId)).trialEndingNoticeAt).toEqual(NOW);
});
