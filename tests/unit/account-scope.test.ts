import fs from "node:fs";
import path from "node:path";
import {
  AccountScopeError,
  ownedModels,
  scopeArgs,
  SHARED_OR_OWNED_MODEL,
  unclassifiedModels,
} from "@/lib/data/scope";

/**
 * Multi-User Foundation spec §14.1 — the pure scoping rules behind the
 * account-scoped client. Every owned-data query in the app is rewritten by
 * scopeArgs, so these cases are the first line of cross-account isolation.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const READ_OPS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
];

const OWNED = [
  "CardioLog",
  "ExerciseFavorite",
  "Goal",
  "Gym",
  "GymExerciseBaseline",
  "LoggedExercise",
  "LoggedSession",
  "LoggedSet",
  "Mesocycle",
  "MissedDayResolution",
  "PlannedCardio",
  "Profile",
  "Session",
  "SessionExercise",
];

const mine = { userId: ME };
const libraryOrMine = { OR: [{ userId: null }, { userId: ME }] };

describe("classification", () => {
  it("every model but Exercise is owned, and none is unclassified", () => {
    expect(ownedModels()).toEqual(OWNED);
    expect(unclassifiedModels()).toEqual([]);
    expect(SHARED_OR_OWNED_MODEL).toBe("Exercise");
  });

  it("matches schema.prisma: every model declares a userId", () => {
    const schema = fs.readFileSync(
      path.join(__dirname, "..", "..", "prisma", "schema.prisma"),
      "utf8",
    );
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
    expect(models.length).toBe(OWNED.length + 1);
    for (const [, name, body] of models) {
      expect([name, /^\s+userId\s+String/m.test(body)]).toEqual([name, true]);
    }
  });

  it("refuses an unknown model", () => {
    expect(() => scopeArgs("Nope", "findMany", {}, ME)).toThrow(
      AccountScopeError,
    );
  });

  it("refuses an unknown operation", () => {
    expect(() => scopeArgs("Gym", "findRaw", {}, ME)).toThrow(
      AccountScopeError,
    );
  });

  it("refuses a missing acting account", () => {
    expect(() => scopeArgs("Gym", "findMany", {}, "")).toThrow(
      AccountScopeError,
    );
  });
});

describe("owned models: reads are intersected with the acting account", () => {
  it.each(OWNED.flatMap((m) => READ_OPS.map((op) => [m, op])))(
    "%s.%s",
    (model, op) => {
      const out = scopeArgs(model, op, { where: { id: "x" } }, ME);
      expect(out.where).toEqual({ id: "x", AND: [mine] });
    },
  );

  it("scopes a read with no args at all", () => {
    expect(scopeArgs("Gym", "count", undefined, ME)).toEqual({
      where: { AND: [mine] },
    });
  });

  it("intersects a caller's userId filter instead of replacing it", () => {
    const out = scopeArgs("Gym", "findMany", { where: { userId: OTHER } }, ME);
    expect(out.where).toEqual({ userId: OTHER, AND: [mine] });
  });

  it("keeps a caller's existing AND (object or array)", () => {
    expect(
      scopeArgs("Gym", "findMany", { where: { AND: { name: "a" } } }, ME).where,
    ).toEqual({ AND: [{ name: "a" }, mine] });
    expect(
      scopeArgs("Gym", "findMany", { where: { AND: [{ name: "a" }] } }, ME)
        .where,
    ).toEqual({ AND: [{ name: "a" }, mine] });
  });

  it("does not mutate the caller's args", () => {
    const args = { where: { id: "x" } };
    scopeArgs("Gym", "findMany", args, ME);
    expect(args).toEqual({ where: { id: "x" } });
  });
});

describe("owned models: writes", () => {
  it.each(["update", "updateMany", "delete", "deleteMany"])(
    "%s is intersected with the acting account",
    (op) => {
      const out = scopeArgs("Gym", op, { where: { id: "g" }, data: {} }, ME);
      expect(out.where).toEqual({ id: "g", AND: [mine] });
    },
  );

  it("create stamps the acting account", () => {
    expect(
      scopeArgs("Gym", "create", { data: { name: "A" } }, ME).data,
    ).toEqual({ name: "A", userId: ME });
  });

  it("create accepts the acting account's own id", () => {
    expect(
      scopeArgs("Gym", "create", { data: { name: "A", userId: ME } }, ME).data,
    ).toEqual({ name: "A", userId: ME });
  });

  it("create with another account's id is refused", () => {
    expect(() =>
      scopeArgs("Gym", "create", { data: { name: "A", userId: OTHER } }, ME),
    ).toThrow(AccountScopeError);
  });

  it("createMany stamps every row (array or single)", () => {
    expect(
      scopeArgs(
        "Gym",
        "createMany",
        { data: [{ name: "a" }, { name: "b" }] },
        ME,
      ).data,
    ).toEqual([
      { name: "a", userId: ME },
      { name: "b", userId: ME },
    ]);
    expect(
      scopeArgs("Gym", "createMany", { data: { name: "a" } }, ME).data,
    ).toEqual([{ name: "a", userId: ME }]);
    expect(() =>
      scopeArgs(
        "Gym",
        "createMany",
        { data: [{ name: "a" }, { name: "b", userId: OTHER }] },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });

  it.each(["update", "updateMany"])(
    "%s refuses any userId in data (ownership is immutable)",
    (op) => {
      expect(() =>
        scopeArgs("Gym", op, { where: { id: "g" }, data: { userId: ME } }, ME),
      ).toThrow(AccountScopeError);
    },
  );

  it("upsert scopes the lookup, stamps the create, refuses userId in update", () => {
    const out = scopeArgs(
      "ExerciseFavorite",
      "upsert",
      {
        where: { userId_exerciseId: { userId: ME, exerciseId: "e" } },
        create: { exerciseId: "e" },
        update: {},
      },
      ME,
    );
    expect(out.where).toEqual({
      userId_exerciseId: { userId: ME, exerciseId: "e" },
      AND: [mine],
    });
    expect(out.create).toEqual({ exerciseId: "e", userId: ME });
    expect(() =>
      scopeArgs(
        "Profile",
        "upsert",
        { where: { userId: ME }, create: {}, update: { userId: OTHER } },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });
});

describe("nested relation writes are refused", () => {
  it.each([
    ["create", { data: { name: "x", sessions: { create: [{ name: "s" }] } } }],
    ["create", { data: { name: "x", profile: { connect: { userId: ME } } } }],
    ["update", { where: { id: "m" }, data: { sessions: { deleteMany: {} } } }],
    ["createMany", { data: [{ name: "x", sessions: { create: [] } }] }],
  ])("Mesocycle.%s with a relation key", (op, args) => {
    expect(() => scopeArgs("Mesocycle", op, args, ME)).toThrow(
      AccountScopeError,
    );
  });

  it("upsert with a nested write is refused", () => {
    expect(() =>
      scopeArgs(
        "Gym",
        "upsert",
        {
          where: { id: "g" },
          create: { name: "g", baselines: { create: [] } },
          update: {},
        },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });
});

describe("Exercise: library ∪ own reads, own-only writes", () => {
  it.each(READ_OPS)(
    "%s sees the library and the acting account's custom",
    (op) => {
      expect(
        scopeArgs("Exercise", op, { where: { id: "e" } }, ME).where,
      ).toEqual({ id: "e", AND: [libraryOrMine] });
    },
  );

  it.each(["update", "updateMany", "delete", "deleteMany"])(
    "%s reaches only the acting account's custom exercises",
    (op) => {
      expect(
        scopeArgs("Exercise", op, { where: { id: "e" }, data: {} }, ME).where,
      ).toEqual({ id: "e", AND: [mine] });
    },
  );

  it("creates only custom exercises, stamped", () => {
    expect(
      scopeArgs(
        "Exercise",
        "create",
        { data: { name: "x", isCustom: true } },
        ME,
      ).data,
    ).toEqual({ name: "x", isCustom: true, userId: ME });
    expect(() =>
      scopeArgs("Exercise", "create", { data: { name: "x" } }, ME),
    ).toThrow(AccountScopeError);
    expect(() =>
      scopeArgs(
        "Exercise",
        "create",
        { data: { name: "x", isCustom: false } },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });
});

describe("no traversal from the shared Exercise into owned rows", () => {
  const BACK = [
    "sessionExercises",
    "loggedExercises",
    "plannedLoggedExercises",
    "baselines",
    "goals",
    "favorites",
    "profile",
  ];

  it.each(BACK)("include.%s on Exercise is refused", (rel) => {
    expect(() =>
      scopeArgs("Exercise", "findMany", { include: { [rel]: true } }, ME),
    ).toThrow(AccountScopeError);
  });

  it.each(BACK)("select.%s on Exercise is refused", (rel) => {
    expect(() =>
      scopeArgs("Exercise", "findMany", { select: { [rel]: true } }, ME),
    ).toThrow(AccountScopeError);
  });

  it("select._count of a back-relation is refused", () => {
    expect(() =>
      scopeArgs(
        "Exercise",
        "findMany",
        { select: { _count: { select: { goals: true } } } },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });

  it.each([
    [{ goals: { some: {} } }],
    [{ loggedExercises: { none: { reps: 1 } } }],
    [{ favorites: { every: {} } }],
    [{ AND: [{ name: "x" }, { goals: { some: {} } }] }],
    [{ OR: [{ baselines: { some: {} } }] }],
    [{ NOT: { sessionExercises: { some: {} } } }],
  ])("where relation filter %j on Exercise is refused", (where) => {
    expect(() => scopeArgs("Exercise", "findMany", { where }, ME)).toThrow(
      AccountScopeError,
    );
  });

  it("orderBy a back-relation count is refused", () => {
    expect(() =>
      scopeArgs(
        "Exercise",
        "findMany",
        { orderBy: { goals: { _count: "desc" } } },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });

  it("nested under an owned model's exercise relation it is still refused", () => {
    expect(() =>
      scopeArgs(
        "LoggedExercise",
        "findMany",
        { include: { exercise: { include: { goals: true } } } },
        ME,
      ),
    ).toThrow(AccountScopeError);
    expect(() =>
      scopeArgs(
        "Goal",
        "findMany",
        { where: { exercise: { loggedExercises: { some: {} } } } },
        ME,
      ),
    ).toThrow(AccountScopeError);
    expect(() =>
      scopeArgs(
        "LoggedExercise",
        "findMany",
        {
          select: {
            plannedExercise: {
              select: { _count: { select: { goals: true } } },
            },
          },
        },
        ME,
      ),
    ).toThrow(AccountScopeError);
  });

  it("owned → exercise (scalars) and owned → owned traversals are allowed", () => {
    expect(() =>
      scopeArgs(
        "LoggedSession",
        "findMany",
        {
          include: {
            loggedExercises: {
              include: {
                exercise: { select: { name: true, primaryMuscle: true } },
                sets: { orderBy: { setNumber: "asc" } },
                gym: true,
              },
            },
          },
          where: { loggedExercises: { some: { exercise: { name: "x" } } } },
        },
        ME,
      ),
    ).not.toThrow();
  });

  it("a false include of a back-relation is not a traversal", () => {
    expect(() =>
      scopeArgs("Exercise", "findMany", { include: { goals: false } }, ME),
    ).not.toThrow();
  });
});
