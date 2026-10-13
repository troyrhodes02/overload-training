import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { toIsoDate } from "@/lib/plan/calendar";
import { createGym } from "@/lib/gyms/gyms";
import { createCustomExercise } from "@/lib/exercises/exercises";
import {
  activateMesocycle,
  cloneMesocycle,
  createMesocycle,
} from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { addPlannedCardio } from "@/lib/plan/cardio";
import {
  BLOCKS,
  GYMS,
  SESSIONS,
  planExercises,
  refKey,
  type ExerciseRef,
} from "./plan";

/**
 * One-time import of the lifter's real plan (admin tooling, never imported by
 * `src/`). `inspect` is READ-ONLY and decides whether the import is safe and
 * unambiguous; `applyImport` writes everything in ONE transaction through the
 * application's own write modules (validation, locks, and invariants
 * included); `verifyImport` re-reads every created record. Create-only:
 * nothing existing is modified, archived, or deleted — exact matches (gyms,
 * custom exercises) are reused.
 */

type Db = PrismaClient;

export type ResolvedExercise = {
  ref: ExerciseRef;
  id: string | null; // null → custom exercise to create
  productionName: string | null;
  equipmentType: string | null;
  match: "exact" | "normalized" | "create-custom" | "missing";
};

export type Inspection = {
  authAccounts: number | null;
  pendingMigrations: string[];
  gyms: { name: string; id: string | null; action: "reuse" | "create" }[];
  exercises: ResolvedExercise[];
  mesocycles: {
    id: string;
    name: string;
    status: string;
    startDate: string | null;
  }[];
  alreadyImported: boolean;
  blockers: string[];
  warnings: string[];
  counts: Record<string, number>;
  /** Snapshot of rows that must not change (id → updatedAt). */
  untouchable: Record<string, string>;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function snapshotCounts(db: Db): Promise<Record<string, number>> {
  const [
    exercises,
    gyms,
    mesocycles,
    sessions,
    sessionExercises,
    plannedCardio,
    loggedSessions,
    loggedExercises,
    loggedSets,
    baselines,
    goals,
    cardioLogs,
    resolutions,
  ] = await Promise.all([
    db.exercise.count(),
    db.gym.count(),
    db.mesocycle.count(),
    db.session.count(),
    db.sessionExercise.count(),
    db.plannedCardio.count(),
    db.loggedSession.count(),
    db.loggedExercise.count(),
    db.loggedSet.count(),
    db.gymExerciseBaseline.count(),
    db.goal.count(),
    db.cardioLog.count(),
    db.missedDayResolution.count(),
  ]);
  return {
    exercises,
    gyms,
    mesocycles,
    sessions,
    sessionExercises,
    plannedCardio,
    loggedSessions,
    loggedExercises,
    loggedSets,
    baselines,
    goals,
    cardioLogs,
    resolutions,
  };
}

async function untouchableSnapshot(db: Db): Promise<Record<string, string>> {
  const rows = [
    ...(
      await db.exercise.findMany({ select: { id: true, updatedAt: true } })
    ).map((r) => ["exercise", r] as const),
    ...(await db.gym.findMany({ select: { id: true, updatedAt: true } })).map(
      (r) => ["gym", r] as const,
    ),
    ...(
      await db.mesocycle.findMany({ select: { id: true, updatedAt: true } })
    ).map((r) => ["mesocycle", r] as const),
    ...(await db.goal.findMany({ select: { id: true, updatedAt: true } })).map(
      (r) => ["goal", r] as const,
    ),
    ...(
      await db.gymExerciseBaseline.findMany({
        select: { id: true, updatedAt: true },
      })
    ).map((r) => ["baseline", r] as const),
    ...(
      await db.loggedSession.findMany({ select: { id: true, updatedAt: true } })
    ).map((r) => ["loggedSession", r] as const),
    ...(
      await db.loggedSet.findMany({ select: { id: true, updatedAt: true } })
    ).map((r) => ["loggedSet", r] as const),
  ];
  return Object.fromEntries(
    rows.map(([k, r]) => [`${k}:${r.id}`, r.updatedAt.toISOString()]),
  );
}

async function authAccounts(db: Db): Promise<number | null> {
  try {
    const rows = await db.$queryRawUnsafe<{ n: number }[]>(
      "SELECT count(*)::int AS n FROM auth.users",
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

async function pendingMigrations(db: Db): Promise<string[]> {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const local = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const applied = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const done = new Set(applied.map((a) => a.migration_name));
  return local.filter((m) => !done.has(m)).sort();
}

/** Does an existing mesocycle exactly match a planned block (structure included)? */
async function matchesBlock(
  db: Db,
  id: string,
  block: (typeof BLOCKS)[number],
  resolved: Map<string, string | null>,
): Promise<boolean> {
  const m = await db.mesocycle.findUnique({
    where: { id },
    include: {
      sessions: {
        include: { sessionExercises: { orderBy: { position: "asc" } } },
      },
      plannedCardio: true,
    },
  });
  if (!m || !m.startDate) return false;
  if (
    toIsoDate(m.startDate) !== block.startDate ||
    m.lengthWeeks !== block.lengthWeeks ||
    m.deloadEveryWeeks !== block.deloadEveryWeeks
  )
    return false;
  const scheduled = m.sessions.filter((s) => s.dayOfWeek !== null);
  if (
    scheduled.length !== SESSIONS.length ||
    m.sessions.length !== SESSIONS.length
  )
    return false;
  for (const plan of SESSIONS) {
    const s = scheduled.find((x) => x.dayOfWeek === plan.dayOfWeek);
    if (
      !s ||
      s.name !== plan.name ||
      s.sessionExercises.length !== plan.slots.length
    )
      return false;
    for (const [i, slot] of plan.slots.entries()) {
      const se = s.sessionExercises[i];
      const id = resolved.get(refKey(slot.ex));
      if (
        !id ||
        se.exerciseId !== id ||
        se.plannedSets !== slot.sets ||
        se.targetRepMin !== slot.repMin ||
        se.targetRepMax !== slot.repMax
      )
        return false;
    }
  }
  const cardioPlan = SESSIONS.filter((p) => p.cardio);
  if (m.plannedCardio.length !== cardioPlan.length) return false;
  return cardioPlan.every((p) =>
    m.plannedCardio.some(
      (c) =>
        c.dayOfWeek === p.dayOfWeek &&
        c.type === p.cardio!.type &&
        c.durationMin === p.cardio!.durationMin,
    ),
  );
}

export async function inspect(db: Db): Promise<Inspection> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const pending = await pendingMigrations(db);
  if (pending.length)
    blockers.push(
      `Migrations not applied on this database: ${pending.join(", ")}`,
    );

  // Gyms: exact, case-insensitive name match → reuse; archived or duplicate → stop.
  const allGyms = await db.gym.findMany();
  const gyms = GYMS.map((name) => {
    const hits = allGyms.filter((g) => norm(g.name) === norm(name));
    const active = hits.filter((g) => !g.deletedAt);
    if (hits.length > 1)
      blockers.push(
        `More than one gym named like "${name}": ${hits.map((h) => h.id).join(", ")}`,
      );
    else if (hits.length === 1 && !active.length)
      blockers.push(
        `Gym "${hits[0].name}" exists but is archived (${hits[0].id}); restore it in Gyms first.`,
      );
    return active.length === 1
      ? { name, id: active[0].id, action: "reuse" as const }
      : { name, id: null, action: "create" as const };
  });

  // Exercises.
  const exercises: ResolvedExercise[] = [];
  for (const ref of planExercises()) {
    if (ref.kind === "library") {
      const row = await db.exercise.findUnique({
        where: { sourceId: ref.sourceId },
      });
      if (!row) {
        blockers.push(
          `Library exercise ${ref.sourceId} ("${ref.name}") is not in this database.`,
        );
        exercises.push({
          ref,
          id: null,
          productionName: null,
          equipmentType: null,
          match: "missing",
        });
        continue;
      }
      if (row.deletedAt)
        blockers.push(
          `Library exercise "${row.name}" is archived; restore it in Exercises first.`,
        );
      if (row.name !== ref.name)
        warnings.push(
          `Library id ${ref.sourceId} is named "${row.name}" here (expected "${ref.name}").`,
        );
      exercises.push({
        ref,
        id: row.id,
        productionName: row.name,
        equipmentType: row.equipmentType,
        match: norm(row.name) === norm(ref.requested) ? "exact" : "normalized",
      });
    } else {
      const hits = await db.exercise.findMany({
        where: { name: { equals: ref.name, mode: "insensitive" } },
      });
      const active = hits.filter((h) => !h.deletedAt);
      if (hits.length > 1) {
        blockers.push(
          `More than one exercise named "${ref.name}": ${hits.map((h) => `${h.id}${h.isCustom ? " (custom)" : ""}`).join(", ")}`,
        );
      } else if (hits.length === 1 && !active.length) {
        blockers.push(
          `Exercise "${hits[0].name}" exists but is archived (${hits[0].id}); restore it in Exercises first.`,
        );
      } else if (active.length === 1) {
        const h = active[0];
        if (
          h.equipmentType !== ref.equipmentType ||
          h.primaryMuscle !== ref.primaryMuscle
        ) {
          warnings.push(
            `Reusing existing "${h.name}" (${h.equipmentType}, ${h.primaryMuscle}); the plan described ${ref.equipmentType}, ${ref.primaryMuscle}.`,
          );
        }
      }
      exercises.push({
        ref,
        id: active.length === 1 ? active[0].id : null,
        productionName: active.length === 1 ? active[0].name : ref.name,
        equipmentType:
          active.length === 1 ? active[0].equipmentType : ref.equipmentType,
        match: active.length === 1 ? "exact" : "create-custom",
      });
    }
  }

  // Mesocycles: an active block or a same-named block must be ours exactly.
  const mesos = await db.mesocycle.findMany({ orderBy: { createdAt: "asc" } });
  const resolved = new Map(exercises.map((e) => [refKey(e.ref), e.id]));
  let alreadyImported = false;
  const named = BLOCKS.map((b) =>
    mesos.filter((m) => norm(m.name) === norm(b.name)),
  );
  if (named.every((n) => n.length === 1)) {
    const [b1, b2] = [named[0][0], named[1][0]];
    alreadyImported =
      b1.status === "active" &&
      b2.status === "draft" &&
      (await matchesBlock(db, b1.id, BLOCKS[0], resolved)) &&
      (await matchesBlock(db, b2.id, BLOCKS[1], resolved));
  }
  if (!alreadyImported) {
    for (const [i, hits] of named.entries()) {
      if (hits.length)
        blockers.push(
          `A mesocycle named "${BLOCKS[i].name}" already exists (${hits.map((h) => `${h.id}, ${h.status}`).join("; ")}) and doesn't match this plan exactly.`,
        );
    }
    const active = mesos.filter((m) => m.status === "active");
    if (active.length) {
      blockers.push(
        `An active mesocycle already exists: "${active[0].name}" (${active[0].id}). Activating Block 1 would archive it — not done automatically.`,
      );
    }
  }

  if (exercises.filter((e) => e.match === "missing").length > 1) {
    const libraryRows = await db.exercise.count({ where: { isCustom: false } });
    if (libraryRows === 0) {
      blockers.unshift(
        "The exercise library is empty on this database: run the one-time catalog import (npm run db:seed) first.",
      );
    }
  }

  // Bodyweight lifts need a positive logged weight; machine/cable lifts are per-gym.
  for (const e of exercises) {
    if (e.equipmentType === "bodyweight")
      warnings.push(
        `"${e.productionName}" is bodyweight: log your bodyweight or added load (sets need a weight above 0).`,
      );
  }

  return {
    authAccounts: await authAccounts(db),
    pendingMigrations: pending,
    gyms,
    exercises,
    mesocycles: mesos.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      startDate: m.startDate ? toIsoDate(m.startDate) : null,
    })),
    alreadyImported,
    blockers,
    warnings,
    counts: await snapshotCounts(db),
    untouchable: await untouchableSnapshot(db),
  };
}

export type ApplyResult = {
  gyms: Record<string, string>;
  customExercises: Record<string, string>;
  block1Id: string;
  block2Id: string;
};

/** Everything in ONE transaction, through the application's write modules. */
export async function applyImport(
  db: Db,
  ins: Inspection,
): Promise<ApplyResult> {
  if (ins.blockers.length || ins.alreadyImported) {
    throw new Error(
      "Refusing to apply: the dry run has blockers or the plan is already imported.",
    );
  }
  return db.$transaction(
    async (tx) => {
      const gyms: Record<string, string> = {};
      for (const g of ins.gyms) {
        gyms[g.name] = g.id ?? (await createGym({ name: g.name }, tx)).id;
      }
      const ids = new Map<string, string>();
      const customExercises: Record<string, string> = {};
      for (const e of ins.exercises) {
        if (e.id) {
          ids.set(refKey(e.ref), e.id);
        } else if (e.ref.kind === "custom") {
          const row = await createCustomExercise(
            {
              name: e.ref.name,
              primaryMuscle: e.ref.primaryMuscle,
              equipmentType: e.ref.equipmentType,
              secondaryMuscles: e.ref.secondaryMuscles,
            },
            tx,
          );
          ids.set(refKey(e.ref), row.id);
          customExercises[e.ref.name] = row.id;
        } else {
          throw new Error(`Unresolved library exercise ${e.ref.sourceId}`);
        }
      }

      const b1 = BLOCKS[0];
      const { id: block1Id } = await createMesocycle(
        {
          name: b1.name,
          startDate: b1.startDate,
          lengthWeeks: String(b1.lengthWeeks),
          deloadEveryWeeks: String(b1.deloadEveryWeeks),
          splitType: "custom",
        },
        tx,
      );
      for (const plan of SESSIONS) {
        const { id: sessionId } = await addSession(
          { mesocycleId: block1Id, name: plan.name, dayOfWeek: plan.dayOfWeek },
          tx,
        );
        for (const slot of plan.slots) {
          await addSessionExercise(
            {
              sessionId,
              exerciseId: ids.get(refKey(slot.ex)),
              plannedSets: String(slot.sets),
              targetRepMin: String(slot.repMin),
              targetRepMax: String(slot.repMax),
            },
            tx,
          );
        }
        if (plan.cardio) {
          await addPlannedCardio(
            {
              mesocycleId: block1Id,
              dayOfWeek: plan.dayOfWeek,
              type: plan.cardio.type,
              durationMin: String(plan.cardio.durationMin),
            },
            tx,
          );
        }
      }
      await activateMesocycle(
        { mesocycleId: block1Id, expectedActiveId: null },
        tx,
      );

      // Block 2: the app's own clone-forward → a DRAFT with the same sessions
      // and cardio, starting the day after Block 1 ends. Activated by hand later.
      const b2 = BLOCKS[1];
      const { id: block2Id } = await cloneMesocycle(
        {
          sourceMesocycleId: block1Id,
          name: b2.name,
          startDate: b2.startDate,
          lengthWeeks: String(b2.lengthWeeks),
          deloadEveryWeeks: String(b2.deloadEveryWeeks),
        },
        tx,
      );
      return { gyms, customExercises, block1Id, block2Id };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

/** Re-reads everything; returns failures (empty = verified). */
export async function verifyImport(
  db: Db,
  before: Inspection,
  result: ApplyResult,
): Promise<string[]> {
  const fail: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) fail.push(msg);
  };

  for (const name of GYMS) {
    const rows = (await db.gym.findMany()).filter(
      (g) => norm(g.name) === norm(name) && !g.deletedAt,
    );
    check(
      rows.length === 1 && rows[0].id === result.gyms[name],
      `Gym "${name}" should exist exactly once`,
    );
  }

  const resolved = new Map<string, string | null>(
    before.exercises.map((e) => [
      refKey(e.ref),
      e.id ??
        (e.ref.kind === "custom" ? result.customExercises[e.ref.name] : null),
    ]),
  );
  const b1 = await db.mesocycle.findUniqueOrThrow({
    where: { id: result.block1Id },
  });
  const b2 = await db.mesocycle.findUniqueOrThrow({
    where: { id: result.block2Id },
  });
  check(b1.status === "active", "Block 1 should be active");
  check(b2.status === "draft", "Block 2 should be a draft");
  check(
    await matchesBlock(db, b1.id, BLOCKS[0], resolved),
    "Block 1 structure should match the plan exactly",
  );
  check(
    await matchesBlock(db, b2.id, BLOCKS[1], resolved),
    "Block 2 structure should match the plan exactly",
  );

  const after = await snapshotCounts(db);
  const created = {
    gyms: Object.keys(result.gyms).filter(
      (n) => !before.gyms.find((g) => g.name === n)?.id,
    ).length,
    exercises: Object.keys(result.customExercises).length,
    mesocycles: 2,
    sessions: 2 * SESSIONS.length,
    sessionExercises: 2 * SESSIONS.reduce((n, s) => n + s.slots.length, 0),
    plannedCardio: 2 * SESSIONS.filter((s) => s.cardio).length,
  } as Record<string, number>;
  for (const [k, n] of Object.entries(before.counts)) {
    check(
      after[k] === n + (created[k] ?? 0),
      `${k}: expected ${n} + ${created[k] ?? 0}, found ${after[k]}`,
    );
  }
  const now = await untouchableSnapshot(db);
  for (const [key, updatedAt] of Object.entries(before.untouchable)) {
    check(
      now[key] === updatedAt,
      `Pre-existing ${key} was modified or deleted`,
    );
  }
  check(
    (await authAccounts(db)) === before.authAccounts,
    "Auth accounts changed",
  );

  return fail;
}
