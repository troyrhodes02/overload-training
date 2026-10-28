import { Prisma } from "@prisma/client";
import {
  ADMIN_REACHABLE_MODELS,
  adminArgs,
  AdminScopeError,
  PROFILE_ADMIN_FIELDS,
} from "@/lib/data/admin/gate";

/**
 * The admin gate (Admin Center & Feedback, spec §6.2; R2, R15): exactly the
 * metadata and presence facts the admin boundary allows, and an
 * AdminScopeError for everything else.
 */

const refused = (model: string, op: string, args: unknown = {}) =>
  expect(() => adminArgs(model, op, args)).toThrow(AdminScopeError);
const allowed = (model: string, op: string, args: unknown = {}) =>
  expect(() => adminArgs(model, op, args)).not.toThrow();

const TRAINING_MODELS = [
  "Mesocycle",
  "Session",
  "SessionExercise",
  "Exercise",
  "ExerciseFavorite",
  "Gym",
  "GymExerciseBaseline",
  "LoggedSession",
  "LoggedExercise",
  "LoggedSet",
  "MissedDayResolution",
  "Goal",
  "PlannedCardio",
  "CardioLog",
  "ReleaseSeen",
];

it("reaches only the declared models", () => {
  expect(ADMIN_REACHABLE_MODELS).toEqual([
    "AdminAuditEntry",
    "Feedback",
    "FeedbackAttachment",
    "LoggedSet",
    "Mesocycle",
    "Profile",
    "TourProgress",
  ]);
  const every = Prisma.dmmf.datamodel.models.map((m) => m.name);
  for (const model of every.filter(
    (m) => !ADMIN_REACHABLE_MODELS.includes(m),
  )) {
    for (const op of [
      "findMany",
      "findUnique",
      "count",
      "groupBy",
      "aggregate",
    ]) {
      refused(model, op, { select: { id: true } });
    }
  }
});

it("Profile: permitted metadata only, never appearance or a relation", () => {
  const select = Object.fromEntries(PROFILE_ADMIN_FIELDS.map((f) => [f, true]));
  allowed("Profile", "findMany", { select });
  allowed("Profile", "findUnique", {
    where: { userId: "x" },
    select: { userId: true },
  });
  allowed("Profile", "findMany", {
    select: { userId: true },
    where: {
      OR: [
        { firstName: { contains: "may", mode: "insensitive" } },
        { username: { contains: "may" } },
      ],
      status: "active",
    },
    orderBy: [{ createdAt: "desc" }],
    skip: 0,
    take: 50,
  });
  refused("Profile", "findMany", {}); // a select is required
  refused("Profile", "findMany", { select: { appearance: true } });
  refused("Profile", "findMany", { select: { userId: true, goals: true } });
  refused("Profile", "findMany", {
    select: { userId: { select: { id: true } } },
  });
  refused("Profile", "findMany", {
    select: { userId: true },
    include: { goals: true },
  });
  refused("Profile", "findMany", {
    select: { userId: true },
    where: { loggedSets: { some: { weightLbs: { gt: 300 } } } },
  });
  refused("Profile", "findMany", {
    select: { userId: true },
    orderBy: { loggedSets: { _count: "desc" } },
  });
  refused("Profile", "findMany", {
    select: { userId: true },
    distinct: ["userId"],
  });
});

it("Profile: status is the only writable field, and an update needs a where", () => {
  allowed("Profile", "updateMany", {
    where: { userId: "x", status: "active" },
    data: { status: "suspended" },
  });
  refused("Profile", "updateMany", { data: { status: "suspended" } });
  for (const field of [
    "firstName",
    "timeZone",
    "lastActiveOn",
    "userId",
    "appearance",
  ]) {
    refused("Profile", "updateMany", {
      where: { userId: "x" },
      data: { [field]: "v" },
    });
  }
  for (const op of [
    "create",
    "update",
    "upsert",
    "delete",
    "deleteMany",
    "createMany",
  ]) {
    refused("Profile", op, { where: { userId: "x" }, data: {} });
  }
});

it("Feedback: read the message, write only category and handled state", () => {
  allowed("Feedback", "findMany", {
    select: {
      id: true,
      userId: true,
      category: true,
      message: true,
      createdAt: true,
      handledAt: true,
    },
    where: { handledAt: null, category: "bug" },
    orderBy: { createdAt: "desc" },
  });
  allowed("Feedback", "count", { where: { handledAt: null } });
  allowed("Feedback", "updateMany", {
    where: { id: "f" },
    data: { handledAt: null },
  });
  allowed("Feedback", "updateMany", {
    where: { id: "f" },
    data: { category: "idea" },
  });
  refused("Feedback", "updateMany", {
    where: { id: "f" },
    data: { message: "edited" },
  });
  refused("Feedback", "updateMany", {
    where: { id: "f" },
    data: { userId: "other" },
  });
  refused("Feedback", "findMany", { select: { profile: true } });
  for (const op of ["create", "delete", "deleteMany"])
    refused("Feedback", op, {});
});

it("FeedbackAttachment: read scalar metadata only, never a relation or a write", () => {
  allowed("FeedbackAttachment", "findMany", {
    where: { feedbackId: "f" },
    select: { objectPath: true, position: true },
    orderBy: { position: "asc" },
  });
  refused("FeedbackAttachment", "findMany", {
    select: { feedback: true },
  });
  for (const op of ["create", "update", "updateMany", "delete", "deleteMany"])
    refused("FeedbackAttachment", op, {});
});

it("AdminAuditEntry: create and read only — never update or delete", () => {
  allowed("AdminAuditEntry", "create", {
    data: {
      actorUserId: "a",
      kind: "account_suspend",
      targetUserId: "t",
      feedbackId: null,
    },
    select: { id: true },
  });
  allowed("AdminAuditEntry", "findMany", {
    select: { id: true, kind: true, createdAt: true },
    where: { targetUserId: "t" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const op of [
    "update",
    "updateMany",
    "delete",
    "deleteMany",
    "upsert",
    "createMany",
  ]) {
    refused("AdminAuditEntry", op, { where: { id: "x" }, data: {} });
  }
  refused("AdminAuditEntry", "create", {
    data: { id: "chosen", kind: "account_suspend" },
  });
  refused("AdminAuditEntry", "create", { data: { createdAt: new Date() } });
});

it("TourProgress: only whether the tour was finished or skipped", () => {
  allowed("TourProgress", "findMany", {
    select: { userId: true, outcome: true },
  });
  refused("TourProgress", "findMany", {
    select: { userId: true, offeredAt: true },
  });
  refused("TourProgress", "updateMany", { where: {}, data: { outcome: null } });
});

it("training models: Mesocycle and LoggedSet answer only 'which accounts have a row'", () => {
  for (const model of ["Mesocycle", "LoggedSet"]) {
    expect(adminArgs(model, "groupBy", { by: ["userId"] })).toEqual({
      by: ["userId"],
    });
    refused(model, "groupBy", { by: ["userId"], _count: true });
    refused(model, "groupBy", { by: ["userId"], _sum: { weightLbs: true } });
    refused(model, "groupBy", { by: ["userId"], _max: { weightLbs: true } });
    refused(model, "groupBy", {
      by: ["userId"],
      where: { weightLbs: { gt: 300 } },
    });
    refused(model, "groupBy", { by: ["userId"], having: {} });
    refused(model, "groupBy", { by: ["userId", "name"] });
    refused(model, "groupBy", { by: ["name"] });
    for (const op of [
      "findMany",
      "findFirst",
      "findUnique",
      "count",
      "aggregate",
    ]) {
      refused(model, op, { select: { userId: true } });
    }
  }
  for (const model of TRAINING_MODELS.filter(
    (m) => m !== "Mesocycle" && m !== "LoggedSet",
  )) {
    refused(model, "groupBy", { by: ["userId"] });
    refused(model, "count", {});
  }
});

it("refuses an unknown model or operation", () => {
  refused("Nope", "findMany", {});
  refused("Profile", "findRaw", {});
  refused("Profile", "aggregate", { _count: true });
});
