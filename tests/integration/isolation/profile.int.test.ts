import { randomUUID } from "node:crypto";
import { accountToday, resolveAccount } from "@/lib/data/account";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";

/**
 * Cross-account isolation — Profile and the per-account "today" (spec R17,
 * R18). A profile is private, and each account's day comes from its own
 * stored timezone.
 */

it("an account never reads another account's profile", async () => {
  const a = await createTestAccount("America/Chicago");
  const b = await createTestAccount("Europe/Berlin");
  expect(await b.db.profile.findMany()).toEqual([
    expect.objectContaining({ userId: b.userId, timeZone: "Europe/Berlin" }),
  ]);
  expect(
    await b.db.profile.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
  expect(await b.db.profile.count()).toBe(1);
});

it("an account can't change another account's profile", async () => {
  const a = await createTestAccount("America/Chicago");
  const b = await createTestAccount();
  const { count } = await b.db.profile.updateMany({
    where: { userId: a.userId },
    data: { timeZone: "Asia/Tokyo" },
  });
  expect(count).toBe(0);
  expect(
    (
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: a.userId },
      })
    ).timeZone,
  ).toBe("America/Chicago");
});

it("each account's today comes from its own stored zone", async () => {
  const east = await createTestAccount("Pacific/Kiritimati"); // UTC+14
  const west = await createTestAccount("Pacific/Pago_Pago"); // UTC-11
  expect(accountToday(east)).not.toBe(accountToday(west));
});

it("a first-time account gets its own profile (UTC) without touching others", async () => {
  const a = await createTestAccount("America/Chicago");
  const fresh = await resolveAccount(randomUUID());
  expect(fresh.timeZone).toBe("UTC");
  expect(
    (
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: a.userId },
      })
    ).timeZone,
  ).toBe("America/Chicago");
});
