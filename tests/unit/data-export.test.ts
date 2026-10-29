import type { Account } from "@/lib/data/account";
import {
  buildAccountExport,
  exportFilename,
  EXPORT_FORMAT_VERSION,
  type AccountExport,
} from "@/lib/accounts/export";

/**
 * Data export shape and plumbing (Public Accounts spec §9, R7; design Screen 8,
 * D4). The ISOLATION proof (two real accounts, A sees only A) lives in the
 * integration suite — it needs the scoped client and a database. These unit
 * tests cover the shape, that every read goes through the passed account.db
 * (never a second client), that the shared library is excluded while
 * soft-deleted rows are kept, and the filename.
 */

/** A fake account.db that records which models were read and with what args. */
function fakeAccount(): {
  account: Account;
  calls: Array<{ model: string; op: string; args: unknown }>;
} {
  const calls: Array<{ model: string; op: string; args: unknown }> = [];
  const list = (model: string) => (args?: unknown) => {
    calls.push({ model, op: "findMany", args });
    return Promise.resolve([{ model }]);
  };
  const one = (model: string) => (args?: unknown) => {
    calls.push({ model, op: "findUnique", args });
    return Promise.resolve({ model });
  };
  const db = {
    profile: { findUnique: one("profile") },
    mesocycle: { findMany: list("mesocycle") },
    session: { findMany: list("session") },
    sessionExercise: { findMany: list("sessionExercise") },
    plannedCardio: { findMany: list("plannedCardio") },
    exercise: { findMany: list("exercise") },
    exerciseFavorite: { findMany: list("exerciseFavorite") },
    gym: { findMany: list("gym") },
    gymExerciseBaseline: { findMany: list("gymExerciseBaseline") },
    loggedSession: { findMany: list("loggedSession") },
    loggedExercise: { findMany: list("loggedExercise") },
    loggedSet: { findMany: list("loggedSet") },
    missedDayResolution: { findMany: list("missedDayResolution") },
    goal: { findMany: list("goal") },
    cardioLog: { findMany: list("cardioLog") },
    tourProgress: { findUnique: one("tourProgress") },
    releaseSeen: { findUnique: one("releaseSeen") },
    feedback: { findMany: list("feedback") },
  };
  const account = {
    userId: "11111111-1111-1111-1111-111111111111",
    timeZone: "America/Chicago",
    db: db as unknown as Account["db"],
  } satisfies Account;
  return { account, calls };
}

describe("buildAccountExport (spec §9, R7)", () => {
  it("is a versioned document with a key for every owned model", async () => {
    const { account } = fakeAccount();
    const out = await buildAccountExport(account);
    expect(out.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(out.formatVersion).toBe(1);
    const keys = Object.keys(out).sort();
    const expected: Array<keyof AccountExport> = [
      "formatVersion",
      "exportedOn",
      "profile",
      "mesocycles",
      "sessions",
      "sessionExercises",
      "plannedCardio",
      "customExercises",
      "exerciseFavorites",
      "gyms",
      "gymExerciseBaselines",
      "loggedSessions",
      "loggedExercises",
      "loggedSets",
      "missedDayResolutions",
      "goals",
      "cardioLogs",
      "tourProgress",
      "releaseSeen",
      "feedback",
    ];
    expect(keys).toEqual([...expected].sort());
  });

  it("exportedOn is the calendar date in the account's timezone", async () => {
    const { account } = fakeAccount();
    const out = await buildAccountExport(account);
    expect(out.exportedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads EVERY key through the passed account.db (never a raw client)", async () => {
    const { account, calls } = fakeAccount();
    await buildAccountExport(account);
    const read = calls.map((c) => c.model).sort();
    expect(read).toEqual(
      [
        "profile",
        "mesocycle",
        "session",
        "sessionExercise",
        "plannedCardio",
        "exercise",
        "exerciseFavorite",
        "gym",
        "gymExerciseBaseline",
        "loggedSession",
        "loggedExercise",
        "loggedSet",
        "missedDayResolution",
        "goal",
        "cardioLog",
        "tourProgress",
        "releaseSeen",
        "feedback",
      ].sort(),
    );
  });

  it("custom exercises exclude the shared library (isCustom: true)", async () => {
    const { account, calls } = fakeAccount();
    await buildAccountExport(account);
    const exerciseCall = calls.find((c) => c.model === "exercise");
    expect(exerciseCall?.args).toEqual({ where: { isCustom: true } });
  });

  it("does NOT filter deletedAt anywhere (archived/soft-deleted rows are kept)", async () => {
    const { account, calls } = fakeAccount();
    await buildAccountExport(account);
    for (const call of calls) {
      const args = JSON.stringify(call.args ?? {});
      expect([call.model, args.includes("deletedAt")]).toEqual([
        call.model,
        false,
      ]);
    }
  });

  it("carries no credential/secret/token fields in the document shape", async () => {
    const { account } = fakeAccount();
    const out = await buildAccountExport(account);
    const serialized = JSON.stringify(out).toLowerCase();
    for (const banned of [
      "password",
      "secret",
      "token",
      "service_role",
      "access_token",
      "refresh_token",
    ]) {
      expect([banned, serialized.includes(banned)]).toEqual([banned, false]);
    }
  });
});

describe("exportFilename", () => {
  it("names the file overload-export-YYYY-MM-DD.json", () => {
    expect(exportFilename("2026-10-29")).toBe(
      "overload-export-2026-10-29.json",
    );
  });
});
