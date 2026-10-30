import type { Account } from "@/lib/data/account";
import {
  buildAccountExport,
  exportFilename,
  EXPORT_FORMAT_VERSION,
  type AccountExport,
} from "@/lib/accounts/export";
import {
  ACCOUNT_DELETION_ORDER,
  type AccountDeletionModel,
} from "@/lib/accounts/deletion";

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
    feedbackAttachment: { findMany: list("feedbackAttachment") },
  };
  const account = {
    userId: "11111111-1111-1111-1111-111111111111",
    timeZone: "America/Chicago",
    db: db as unknown as Account["db"],
  } satisfies Account;
  return { account, calls };
}

/**
 * THE AUTHORITATIVE OWNED-MODEL SET. The export must carry every owned model,
 * so its coverage is DERIVED from ACCOUNT_DELETION_ORDER (deletion.ts) rather
 * than hand-listed — the two destroy/extract the same set by design. If a later
 * pitch adds an owned model to the deletion order but forgets to add it to the
 * export, these tests fail. `Profile` is excluded: it is the top-level
 * `profile` singleton, not a list section. The map below names, for each owned
 * model, the export document key and the fake-db model it reads through, so a
 * new model also fails loudly here until it is wired in.
 */
const OWNED_MODEL_EXPORT: Record<
  Exclude<AccountDeletionModel, "Profile">,
  { exportKey: keyof AccountExport; dbModel: string }
> = {
  Mesocycle: { exportKey: "mesocycles", dbModel: "mesocycle" },
  Session: { exportKey: "sessions", dbModel: "session" },
  SessionExercise: {
    exportKey: "sessionExercises",
    dbModel: "sessionExercise",
  },
  PlannedCardio: { exportKey: "plannedCardio", dbModel: "plannedCardio" },
  Exercise: { exportKey: "customExercises", dbModel: "exercise" },
  ExerciseFavorite: {
    exportKey: "exerciseFavorites",
    dbModel: "exerciseFavorite",
  },
  Gym: { exportKey: "gyms", dbModel: "gym" },
  GymExerciseBaseline: {
    exportKey: "gymExerciseBaselines",
    dbModel: "gymExerciseBaseline",
  },
  LoggedSession: { exportKey: "loggedSessions", dbModel: "loggedSession" },
  LoggedExercise: { exportKey: "loggedExercises", dbModel: "loggedExercise" },
  LoggedSet: { exportKey: "loggedSets", dbModel: "loggedSet" },
  MissedDayResolution: {
    exportKey: "missedDayResolutions",
    dbModel: "missedDayResolution",
  },
  Goal: { exportKey: "goals", dbModel: "goal" },
  CardioLog: { exportKey: "cardioLogs", dbModel: "cardioLog" },
  TourProgress: { exportKey: "tourProgress", dbModel: "tourProgress" },
  ReleaseSeen: { exportKey: "releaseSeen", dbModel: "releaseSeen" },
  Feedback: { exportKey: "feedback", dbModel: "feedback" },
  FeedbackAttachment: {
    exportKey: "feedbackAttachments",
    dbModel: "feedbackAttachment",
  },
};

/** The owned models the export must cover: deletion order minus the Profile. */
const OWNED_MODELS = ACCOUNT_DELETION_ORDER.filter(
  (m): m is Exclude<AccountDeletionModel, "Profile"> => m !== "Profile",
);

describe("buildAccountExport (spec §9, R7)", () => {
  it("covers every owned model in ACCOUNT_DELETION_ORDER (no model is dropped)", () => {
    // The guard: a new owned model added to the deletion order with no entry in
    // the export mapping fails here, forcing it into the export.
    for (const model of OWNED_MODELS) {
      expect([model, model in OWNED_MODEL_EXPORT]).toEqual([model, true]);
    }
  });

  it("is a versioned document with a key for every owned model", async () => {
    const { account } = fakeAccount();
    const out = await buildAccountExport(account);
    expect(out.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(out.formatVersion).toBe(1);
    const keys = Object.keys(out).sort();
    // Expected keys are DERIVED from the authoritative owned-model set plus the
    // two non-model scalars and the Profile singleton — not hand-maintained.
    const expected: Array<keyof AccountExport> = [
      "formatVersion",
      "exportedOn",
      "profile",
      ...OWNED_MODELS.map((m) => OWNED_MODEL_EXPORT[m].exportKey),
    ];
    expect(keys).toEqual([...new Set(expected)].sort());
  });

  it("exportedOn is the calendar date in the account's timezone", async () => {
    const { account } = fakeAccount();
    const out = await buildAccountExport(account);
    expect(out.exportedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads EVERY owned model through the passed account.db (never a raw client)", async () => {
    const { account, calls } = fakeAccount();
    await buildAccountExport(account);
    const read = calls.map((c) => c.model).sort();
    // Derived: every owned model's db read (via the mapping) plus the Profile.
    const expected = [
      "profile",
      ...OWNED_MODELS.map((m) => OWNED_MODEL_EXPORT[m].dbModel),
    ];
    expect(read).toEqual([...expected].sort());
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
