import { randomUUID } from "node:crypto";
import {
  accountToday,
  establishProfile,
  resolveAccount,
} from "@/lib/data/account";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { getSettingsProfile, updateProfile } from "@/lib/accounts/profile";
import { isUsernameAvailable } from "@/lib/data/usernames";
import {
  getAccountAppearance,
  updateAppearance,
} from "@/lib/accounts/appearance";

/**
 * Cross-account isolation — Profile and the per-account "today" (spec R17,
 * R18). A profile is private, and each account's day comes from its own
 * stored timezone. Its appearance preference (Personalization & Navigation
 * Polish) is the account's own too. Usernames (OVE-50) are unique across all
 * accounts; the only thing one account can learn about another's is that a
 * name it tried is taken.
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

describe("Settings profile edits (Accounts)", () => {
  it("updateProfile writes only the acting account's profile", async () => {
    const a = await createTestAccount("America/Chicago");
    const b = await createTestAccount("Europe/Berlin");
    await updateProfile(b, {
      firstName: " Sam ",
      lastName: "Ortiz",
      username: " Sam_O ",
      timeZone: "Asia/Tokyo",
    });
    const rows = await getTestPrisma().profile.findMany();
    const byId = new Map(rows.map((r) => [r.userId, r]));
    expect(byId.get(b.userId)).toMatchObject({
      firstName: "Sam",
      lastName: "Ortiz",
      username: "sam_o",
      timeZone: "Asia/Tokyo",
    });
    expect(byId.get(a.userId)).toMatchObject({
      firstName: null,
      lastName: null,
      username: null,
      timeZone: "America/Chicago",
    });
  });

  it("rejects invalid input without writing anything", async () => {
    const a = await createTestAccount("America/Chicago");
    await expect(
      updateProfile(a, {
        firstName: "",
        lastName: "R",
        username: "x",
        timeZone: "Nope/Zone",
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: {
        firstName: "Enter your first name.",
        username: expect.any(String),
        timeZone: "Choose a timezone.",
      },
    });
    expect(
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: a.userId },
      }),
    ).toMatchObject({
      firstName: null,
      username: null,
      timeZone: "America/Chicago",
    });
  });

  it("a saved zone change moves the account's today", async () => {
    const a = await createTestAccount("Pacific/Kiritimati"); // UTC+14
    const before = accountToday(a);
    await updateProfile(a, {
      firstName: "W",
      lastName: "R",
      username: "will_r",
      timeZone: "Pacific/Pago_Pago", // UTC-11
    });
    const reread = await resolveAccount(a.userId);
    expect(reread.timeZone).toBe("Pacific/Pago_Pago");
    expect(accountToday(reread)).not.toBe(before);
    expect(await getSettingsProfile(reread)).toEqual({
      firstName: "W",
      lastName: "R",
      username: "will_r",
      timeZone: "Pacific/Pago_Pago",
    });
  });
});

describe("signup profile (Accounts R9)", () => {
  it("establishProfile creates the new account's profile with names and zone", async () => {
    const other = await createTestAccount("America/Chicago");
    const id = randomUUID();
    await establishProfile(
      { id },
      {
        firstName: "Sam",
        lastName: "Ortiz",
        username: "sam_o",
        timeZone: "Europe/Berlin",
      },
    );
    expect(
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: id },
      }),
    ).toMatchObject({
      firstName: "Sam",
      lastName: "Ortiz",
      username: "sam_o",
      timeZone: "Europe/Berlin",
    });
    expect(
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: other.userId },
      }),
    ).toMatchObject({ firstName: null, timeZone: "America/Chicago" });
  });

  it("completes a lazily created profile instead of duplicating it", async () => {
    const id = randomUUID();
    await resolveAccount(id); // a concurrent first request made a UTC profile
    await establishProfile(
      { id },
      {
        firstName: "Sam",
        lastName: "Ortiz",
        username: "sam_o",
        timeZone: "Asia/Tokyo",
      },
    );
    const rows = await getTestPrisma().profile.findMany({
      where: { userId: id },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        firstName: "Sam",
        lastName: "Ortiz",
        username: "sam_o",
        timeZone: "Asia/Tokyo",
      }),
    ]);
  });

  it("an invalid zone falls back to UTC", async () => {
    const id = randomUUID();
    await establishProfile(
      { id },
      {
        firstName: "Sam",
        lastName: "Ortiz",
        username: "sam_o",
        timeZone: "Nope/Zone",
      },
    );
    expect(
      (
        await getTestPrisma().profile.findUniqueOrThrow({
          where: { userId: id },
        })
      ).timeZone,
    ).toBe("UTC");
  });
});

describe("appearance preference (Personalization & Navigation Polish)", () => {
  const rawAppearance = async (userId: string) =>
    (
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId },
        select: { appearance: true },
      })
    ).appearance;

  it("a new profile reads System (the default)", async () => {
    const a = await createTestAccount();
    expect(await rawAppearance(a.userId)).toBe("system");
    expect(await getAccountAppearance(a)).toBe("system");
  });

  it("updateAppearance writes only the acting account's profile", async () => {
    const a = await createTestAccount("America/Chicago");
    const b = await createTestAccount("Europe/Berlin");
    await updateAppearance(a, "dark");
    await updateAppearance(b, "light");
    expect(await rawAppearance(a.userId)).toBe("dark");
    expect(await rawAppearance(b.userId)).toBe("light");
    // Names, zone, and ownership untouched.
    expect(
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: a.userId },
      }),
    ).toMatchObject({ userId: a.userId, timeZone: "America/Chicago" });
  });

  it("each account reads only its own appearance", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await updateAppearance(a, "dark");
    expect(await getAccountAppearance(a)).toBe("dark");
    expect(await getAccountAppearance(b)).toBe("system");
  });

  it("an account can't change another account's appearance, even by id", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await updateAppearance(a, "dark");
    const { count } = await b.db.profile.updateMany({
      where: { userId: a.userId },
      data: { appearance: "light" },
    });
    expect(count).toBe(0);
    expect(await rawAppearance(a.userId)).toBe("dark");
  });

  it("rejects anything but the three values without writing", async () => {
    const a = await createTestAccount();
    await updateAppearance(a, "light");
    for (const bad of ["purple", "", null, "System"]) {
      await expect(updateAppearance(a, bad)).rejects.toMatchObject({
        code: "validation_error",
      });
    }
    expect(await rawAppearance(a.userId)).toBe("light");
  });

  it("the database refuses a value outside the enum", async () => {
    const a = await createTestAccount();
    await expect(
      getTestPrisma().$executeRawUnsafe(
        `UPDATE "profiles" SET "appearance" = 'purple' WHERE "user_id" = $1::uuid`,
        a.userId,
      ),
    ).rejects.toThrow();
    expect(await rawAppearance(a.userId)).toBe("system");
  });
});

describe("usernames: unique across accounts, private otherwise (OVE-50)", () => {
  type TestAccount = Awaited<ReturnType<typeof createTestAccount>>;
  const usernameOf = async (userId: string) =>
    (
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId },
        select: { username: true },
      })
    ).username;
  const save = (account: TestAccount, username: string) =>
    updateProfile(account, {
      firstName: "Test",
      lastName: "Lifter",
      username,
      timeZone: account.timeZone,
    });

  it("one account can't take another's username, in any case, and learns only that it's taken", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await save(a, "sam_r");
    for (const attempt of ["sam_r", "Sam_R", "@SAM_R"]) {
      await expect(save(b, attempt)).rejects.toEqual(
        expect.objectContaining({
          code: "conflict",
          message: "That username is taken.",
          details: { username: "That username is taken." },
        }),
      );
    }
    expect(await usernameOf(a.userId)).toBe("sam_r");
    expect(await usernameOf(b.userId)).toBeNull();
  });

  it("re-saving your own username is not a conflict, and changing it frees the old one", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await save(a, "first_name");
    await save(a, "first_name");
    await save(a, "second_name");
    expect(await isUsernameAvailable("first_name")).toBe(true);
    await save(b, "first_name");
    expect(await usernameOf(b.userId)).toBe("first_name");
  });

  it("an account can't change another account's username, even by id", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await save(a, "owner_a");
    const { count } = await b.db.profile.updateMany({
      where: { userId: a.userId },
      data: { username: "stolen" },
    });
    expect(count).toBe(0);
    expect(await usernameOf(a.userId)).toBe("owner_a");
  });

  it("an account never reads another account's username", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await save(a, "hidden_a");
    expect(
      await b.db.profile.findFirst({ where: { username: "hidden_a" } }),
    ).toBeNull();
    expect(
      await b.db.profile.count({ where: { username: { not: null } } }),
    ).toBe(0);
  });

  it("the availability check answers yes or no and nothing else", async () => {
    const a = await createTestAccount();
    await save(a, "taken_name");
    await expect(isUsernameAvailable("taken_name")).resolves.toBe(false);
    await expect(isUsernameAvailable("free_name")).resolves.toBe(true);
  });

  it("many accounts can have no username yet", async () => {
    await createTestAccount();
    await createTestAccount();
    await createTestAccount();
    expect(
      await getTestPrisma().profile.count({ where: { username: null } }),
    ).toBe(3);
  });

  it("the database itself refuses a duplicate, an uppercase, or a malformed username", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await save(a, "dup_name");
    const raw = (value: string, userId: string) =>
      getTestPrisma().$executeRawUnsafe(
        `UPDATE "profiles" SET "username" = $1 WHERE "user_id" = $2::uuid`,
        value,
        userId,
      );
    for (const bad of [
      "dup_name",
      "Dup_Name_2",
      "ab",
      "a".repeat(21),
      "has space",
      "dash-ed",
    ]) {
      await expect(raw(bad, b.userId)).rejects.toThrow();
    }
    expect(await usernameOf(b.userId)).toBeNull();
  });

  it("two accounts racing for one username: exactly one wins", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const results = await Promise.allSettled([
      save(a, "race_name"),
      save(b, "race_name"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(lost?.reason).toMatchObject({ code: "conflict" });
    expect(
      await getTestPrisma().profile.count({ where: { username: "race_name" } }),
    ).toBe(1);
  });

  it("signup's profile write refuses a taken username and creates nothing", async () => {
    const a = await createTestAccount();
    await save(a, "signup_name");
    const id = randomUUID();
    await expect(
      establishProfile(
        { id },
        {
          firstName: "Sam",
          lastName: "O",
          username: "signup_name",
          timeZone: "UTC",
        },
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await getTestPrisma().profile.findUnique({ where: { userId: id } }),
    ).toBeNull();
  });

  it("completing a lazy profile with a taken username leaves the lazy profile as it was", async () => {
    const a = await createTestAccount();
    await save(a, "lazy_name");
    const id = randomUUID();
    await resolveAccount(id); // a concurrent first request made a UTC profile
    await expect(
      establishProfile(
        { id },
        {
          firstName: "Sam",
          lastName: "O",
          username: "lazy_name",
          timeZone: "Asia/Tokyo",
        },
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await getTestPrisma().profile.findUniqueOrThrow({
        where: { userId: id },
      }),
    ).toMatchObject({ username: null, timeZone: "UTC" });
    expect(await usernameOf(a.userId)).toBe("lazy_name");
  });
});
