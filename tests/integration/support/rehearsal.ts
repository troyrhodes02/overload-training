import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabaseUrl } from "./assert-test-db";

/**
 * Multi-User Foundation migration rehearsal (spec §14.4). Builds SEPARATE
 * throwaway databases inside the embedded test Postgres (never Supabase),
 * replays migrations file by file to any point, adds a stand-in `auth.users`
 * (the embedded server has no Supabase auth schema — spec R22), and seeds
 * real-shaped pre-ownership data, so the staged conversion can be exercised
 * exactly as the production runbook performs it.
 */

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "prisma",
  "migrations",
);

/** Migration directory names in apply order (numeric prefix). */
export function migrationNames(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export function migrationsThrough(lastPrefix: number): string[] {
  return migrationNames().filter((m) => parseInt(m, 10) <= lastPrefix);
}

function urlFor(database: string): string {
  const url = new URL(assertTestDatabaseUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

async function withClient<T>(url: string, run: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;

export type RehearsalDb = {
  name: string;
  url: string;
  prisma: PrismaClient;
  /** Apply migration files (by directory name) and record them as Prisma would. */
  applyMigrations: (names: string[]) => Promise<void>;
  /** Run arbitrary SQL (multi-statement) as the database owner. */
  sql: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  drop: () => Promise<void>;
};

async function applyFiles(url: string, names: string[]): Promise<void> {
  await withClient(url, async (c) => {
    await c.query(MIGRATIONS_TABLE);
    for (const name of names) {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, name, "migration.sql"),
        "utf8",
      );
      await c.query(sql);
      await c.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, 'rehearsal', now(), $2, 1)`,
        [randomUUID(), name],
      );
    }
  });
}

function open(name: string): RehearsalDb {
  const url = urlFor(name);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  return {
    name,
    url,
    prisma,
    applyMigrations: (names) => applyFiles(url, names),
    sql: (text, params) =>
      withClient(
        url,
        async (c) => (await c.query(text, params as unknown[])).rows,
      ),
    drop: async () => {
      await prisma.$disconnect();
      await withClient(assertTestDatabaseUrl(), (c) =>
        c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
      );
    },
  };
}

/** A fresh, empty database (no migrations). */
export async function createRehearsalDatabase(
  template?: string,
): Promise<RehearsalDb> {
  const name = `rehearsal_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await withClient(assertTestDatabaseUrl(), (c) =>
    c.query(
      template
        ? `CREATE DATABASE "${name}" TEMPLATE "${template}"`
        : `CREATE DATABASE "${name}"`,
    ),
  );
  return open(name);
}

/** Minimal stand-in for Supabase's auth.users (id + email only). */
export async function createAuthUsers(
  db: RehearsalDb,
  users: { id: string; email: string }[],
): Promise<void> {
  await db.sql(`CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text NOT NULL);`);
  for (const u of users) {
    await db.sql(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
      u.id,
      u.email,
    ]);
  }
}

/** Tables snapshotted for value preservation (every legacy table). */
export const SNAPSHOT_TABLES = [
  "exercises",
  "gyms",
  "gym_exercise_baselines",
  "mesocycles",
  "sessions",
  "session_exercises",
  "planned_cardio",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "missed_day_resolutions",
  "goals",
  "cardio_logs",
] as const;

/** Every row of every legacy table, minus the owner column, in id order. */
export async function snapshot(
  db: RehearsalDb,
): Promise<Record<string, Record<string, unknown>[]>> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of SNAPSHOT_TABLES) {
    const rows = await db.sql(
      `SELECT (to_jsonb(t) - 'user_id') AS row FROM "${table}" t ORDER BY t.id`,
    );
    out[table] = rows.map((r) => r.row as Record<string, unknown>);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Real-shaped legacy data (single-user era, before migration 9).            */
/* ------------------------------------------------------------------------ */

export const LEGACY = {
  owner: {
    id: "6f1c0d3e-8a2b-4c5d-9e0f-1a2b3c4d5e6f",
    email: "Lifter@Example.com",
  },
  ex: {
    bench: "00000000-0000-4000-8000-000000000001",
    chestPress: "00000000-0000-4000-8000-000000000002",
    pulldown: "00000000-0000-4000-8000-000000000003", // library, archived in the single-user era
    squat: "00000000-0000-4000-8000-000000000004",
    pullUp: "00000000-0000-4000-8000-000000000005", // bodyweight
    incline: "00000000-0000-4000-8000-000000000006",
    landmine: "00000000-0000-4000-8000-000000000011", // custom, favorite
    oldCurl: "00000000-0000-4000-8000-000000000012", // custom, archived
  },
  gym: {
    downtown: "00000000-0000-4000-8000-000000000101",
    campus: "00000000-0000-4000-8000-000000000102", // archived
  },
  meso: {
    old: "00000000-0000-4000-8000-000000000201", // archived
    active: "00000000-0000-4000-8000-000000000202",
  },
  session: {
    oldPush: "00000000-0000-4000-8000-000000000301",
    push: "00000000-0000-4000-8000-000000000302",
    legs: "00000000-0000-4000-8000-000000000303",
    pull: "00000000-0000-4000-8000-000000000304",
  },
};

const T0 = new Date("2026-09-07T13:00:00Z");
function at(days: number, hours = 0): Date {
  return new Date(T0.getTime() + days * 86_400_000 + hours * 3_600_000);
}
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Seeds the pre-ownership dataset with createMany (no RETURNING → no user_id). */
export async function seedLegacyData(db: RehearsalDb): Promise<void> {
  const p = db.prisma;
  const { ex, gym, meso, session } = LEGACY;
  const lib = (
    id: string,
    name: string,
    primaryMuscle: "chest" | "back" | "quads",
    equipmentType: "barbell" | "machine" | "cable" | "bodyweight",
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    name,
    primaryMuscle,
    equipmentType,
    isCustom: false,
    sourceId: `src-${name.replace(/\s/g, "_")}`,
    imageRef: `exercises/${name.replace(/\s/g, "_")}/0.jpg`,
    createdAt: at(-30),
    updatedAt: at(-30),
    ...extra,
  });
  await p.exercise.createMany({
    data: [
      lib(ex.bench, "Barbell Bench Press", "chest", "barbell", {
        isFavorite: true,
        secondaryMuscles: ["triceps", "shoulders"],
      }),
      lib(ex.chestPress, "Machine Chest Press", "chest", "machine"),
      lib(ex.pulldown, "Lat Pulldown", "back", "cable", { deletedAt: at(-3) }),
      lib(ex.squat, "Barbell Squat", "quads", "barbell", { isFavorite: true }),
      lib(ex.pullUp, "Pull-Up", "back", "bodyweight"),
      lib(ex.incline, "Incline Bench Press", "chest", "barbell"),
      {
        id: ex.landmine,
        name: "Landmine Press",
        primaryMuscle: "shoulders",
        equipmentType: "other",
        isCustom: true,
        isFavorite: true,
        createdAt: at(-20),
        updatedAt: at(-2),
      },
      {
        id: ex.oldCurl,
        name: "Old Curl",
        primaryMuscle: "biceps",
        equipmentType: "dumbbell",
        isCustom: true,
        deletedAt: at(-10),
        createdAt: at(-25),
        updatedAt: at(-10),
      },
    ],
  });
  await p.gym.createMany({
    data: [
      {
        id: gym.downtown,
        name: "Downtown Gym",
        address: "Near the river",
        createdAt: at(-30),
        updatedAt: at(-30),
      },
      {
        id: gym.campus,
        name: "Campus Rec",
        address: null,
        deletedAt: at(-5),
        createdAt: at(-30),
        updatedAt: at(-5),
      },
    ],
  });
  await p.gymExerciseBaseline.createMany({
    data: [
      {
        id: randomUUID(),
        gymId: gym.downtown,
        exerciseId: ex.chestPress,
        weightLbs: "120.00",
        createdAt: at(1),
        updatedAt: at(8),
      },
      {
        id: randomUUID(),
        gymId: gym.campus,
        exerciseId: ex.chestPress,
        weightLbs: "100.00",
        createdAt: at(3),
        updatedAt: at(3),
      },
    ],
  });
  await p.mesocycle.createMany({
    data: [
      {
        id: meso.old,
        name: "Summer Block",
        lengthWeeks: 4,
        deloadEveryWeeks: 4,
        splitType: "custom",
        status: "archived",
        startDate: day("2026-08-03"),
        createdAt: at(-40),
        updatedAt: at(-1),
      },
      {
        id: meso.active,
        name: "Fall Strength",
        lengthWeeks: 5,
        deloadEveryWeeks: 5,
        splitType: "ppl",
        status: "active",
        startDate: day("2026-09-07"),
        createdAt: at(-2),
        updatedAt: at(-1),
      },
    ],
  });
  await p.session.createMany({
    data: [
      {
        id: session.oldPush,
        mesocycleId: meso.old,
        name: "Push",
        dayOfWeek: 1,
        position: 0,
        createdAt: at(-40),
        updatedAt: at(-40),
      },
      {
        id: session.push,
        mesocycleId: meso.active,
        name: "Push Day 1",
        dayOfWeek: 1,
        position: 0,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: session.legs,
        mesocycleId: meso.active,
        name: "Legs",
        dayOfWeek: 3,
        position: 1,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: session.pull,
        mesocycleId: meso.active,
        name: "Pull",
        dayOfWeek: 5,
        position: 2,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
    ],
  });
  const se = {
    oldBench: randomUUID(),
    bench: randomUUID(),
    chestPress: randomUUID(),
    landmine: randomUUID(),
    squat: randomUUID(),
    pullUp: randomUUID(),
  };
  await p.sessionExercise.createMany({
    data: [
      {
        id: se.oldBench,
        sessionId: session.oldPush,
        exerciseId: ex.bench,
        position: 0,
        plannedSets: 3,
        targetRepMin: 5,
        targetRepMax: 5,
        createdAt: at(-40),
        updatedAt: at(-40),
      },
      {
        id: se.bench,
        sessionId: session.push,
        exerciseId: ex.bench,
        position: 0,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: se.chestPress,
        sessionId: session.push,
        exerciseId: ex.chestPress,
        position: 1,
        plannedSets: 3,
        targetRepMin: 10,
        targetRepMax: 12,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: se.landmine,
        sessionId: session.push,
        exerciseId: ex.landmine,
        position: 2,
        plannedSets: 2,
        targetRepMin: 8,
        targetRepMax: 10,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: se.squat,
        sessionId: session.legs,
        exerciseId: ex.squat,
        position: 0,
        plannedSets: 3,
        targetRepMin: 5,
        targetRepMax: 5,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: se.pullUp,
        sessionId: session.pull,
        exerciseId: ex.pullUp,
        position: 0,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 10,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
    ],
  });
  await p.plannedCardio.createMany({
    data: [
      {
        id: randomUUID(),
        mesocycleId: meso.active,
        dayOfWeek: 2,
        type: "Incline walk",
        durationMin: 30,
        createdAt: at(-2),
        updatedAt: at(-2),
      },
      {
        id: randomUUID(),
        mesocycleId: meso.old,
        dayOfWeek: 4,
        type: "Bike",
        durationMin: 20,
        createdAt: at(-40),
        updatedAt: at(-40),
      },
    ],
  });

  // Logged history: week 1 Mon (complete), Wed (complete, a swap + a skip),
  // Fri (complete, bodyweight + an extra set), week 2 Mon (in progress).
  const ls = {
    mon: randomUUID(),
    wed: randomUUID(),
    fri: randomUUID(),
    mon2: randomUUID(),
  };
  await p.loggedSession.createMany({
    data: [
      {
        id: ls.mon,
        mesocycleId: meso.active,
        sessionId: session.push,
        performedOn: at(0),
        scheduledFor: day("2026-09-07"),
        status: "complete",
        completedAt: at(0, 1),
        createdAt: at(0),
        updatedAt: at(0, 1),
      },
      {
        id: ls.wed,
        mesocycleId: meso.active,
        sessionId: session.legs,
        performedOn: at(2),
        scheduledFor: day("2026-09-09"),
        status: "complete",
        completedAt: at(2, 1),
        createdAt: at(2),
        updatedAt: at(2, 1),
      },
      {
        id: ls.fri,
        mesocycleId: meso.active,
        sessionId: session.pull,
        performedOn: at(4),
        scheduledFor: day("2026-09-11"),
        status: "complete",
        completedAt: at(4, 1),
        createdAt: at(4),
        updatedAt: at(4, 1),
      },
      {
        id: ls.mon2,
        mesocycleId: meso.active,
        sessionId: session.push,
        performedOn: at(7),
        scheduledFor: day("2026-09-14"),
        status: "in_progress",
        createdAt: at(7),
        updatedAt: at(7),
      },
    ],
  });
  const le = {
    monBench: randomUUID(),
    monPress: randomUUID(),
    monLandmine: randomUUID(),
    wedSquat: randomUUID(),
    friPullUp: randomUUID(),
    mon2Bench: randomUUID(),
  };
  const snap = (
    id: string,
    loggedSessionId: string,
    exerciseId: string,
    plannedExerciseId: string,
    sessionExerciseId: string,
    position: number,
    plannedSets: number,
    min: number,
    max: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    loggedSessionId,
    exerciseId,
    plannedExerciseId,
    sessionExerciseId,
    gymId: gym.downtown,
    position,
    plannedSets,
    targetRepMin: min,
    targetRepMax: max,
    createdAt: at(0),
    updatedAt: at(0),
    ...extra,
  });
  await p.loggedExercise.createMany({
    data: [
      snap(le.monBench, ls.mon, ex.bench, ex.bench, se.bench, 0, 3, 6, 8),
      snap(
        le.monPress,
        ls.mon,
        ex.chestPress,
        ex.chestPress,
        se.chestPress,
        1,
        3,
        10,
        12,
      ),
      snap(
        le.monLandmine,
        ls.mon,
        ex.landmine,
        ex.landmine,
        se.landmine,
        2,
        2,
        8,
        10,
        { skippedAt: at(0, 1) },
      ),
      snap(le.wedSquat, ls.wed, ex.squat, ex.squat, se.squat, 0, 3, 5, 5),
      snap(le.friPullUp, ls.fri, ex.pullUp, ex.pullUp, se.pullUp, 0, 3, 6, 10),
      snap(le.mon2Bench, ls.mon2, ex.incline, ex.bench, se.bench, 0, 3, 6, 8), // swapped
    ],
  });
  const set = (
    loggedExerciseId: string,
    setNumber: number,
    weightLbs: string | null,
    reps: number,
  ) => ({
    id: randomUUID(),
    loggedExerciseId,
    setNumber,
    weightLbs,
    reps,
    createdAt: at(0),
    updatedAt: at(0),
  });
  await p.loggedSet.createMany({
    data: [
      set(le.monBench, 1, "185.00", 8),
      set(le.monBench, 2, "185.00", 7),
      set(le.monBench, 3, "185.00", 6),
      set(le.monPress, 1, "120.00", 12),
      set(le.monPress, 2, "120.00", 11),
      set(le.monPress, 3, "120.00", 10),
      set(le.wedSquat, 1, "275.50", 5),
      set(le.wedSquat, 2, "275.50", 5),
      set(le.wedSquat, 3, "275.50", 5),
      set(le.friPullUp, 1, null, 10),
      set(le.friPullUp, 2, null, 9),
      set(le.friPullUp, 3, null, 8),
      set(le.friPullUp, 4, null, 6), // extra set beyond the plan
      set(le.mon2Bench, 1, "155.00", 8),
    ],
  });
  await p.missedDayResolution.createMany({
    data: [
      {
        id: randomUUID(),
        mesocycleId: meso.old,
        sessionId: session.oldPush,
        missedOn: day("2026-08-10"),
        outcome: "skipped",
        createdAt: at(-28),
        updatedAt: at(-28),
      },
      {
        id: randomUUID(),
        mesocycleId: meso.active,
        sessionId: session.legs,
        missedOn: day("2026-09-16"),
        outcome: "shifted",
        createdAt: at(10),
        updatedAt: at(10),
      },
    ],
  });
  await p.goal.createMany({
    data: [
      {
        id: randomUUID(),
        exerciseId: ex.bench,
        targetWeightLbs: "225.00",
        targetReps: 5,
        status: "active",
        createdAt: at(-1),
        updatedAt: at(-1),
      },
      {
        id: randomUUID(),
        exerciseId: ex.squat,
        targetWeightLbs: "275.00",
        targetReps: 5,
        status: "archived",
        archiveReason: "completed",
        archivedAt: at(2, 1),
        completionAcknowledgedAt: at(2, 2),
        createdAt: at(-1),
        updatedAt: at(2, 2),
      },
      {
        id: randomUUID(),
        exerciseId: ex.chestPress,
        gymId: gym.downtown,
        targetWeightLbs: "150.00",
        targetReps: 10,
        status: "active",
        createdAt: at(1),
        updatedAt: at(1),
      },
    ],
  });
  await p.cardioLog.createMany({
    data: [
      {
        id: randomUUID(),
        mesocycleId: meso.active,
        scheduledFor: day("2026-09-08"),
        plannedType: "Incline walk",
        plannedDurationMin: 30,
        type: "Incline walk",
        durationMin: 35,
        performedOn: at(1),
        createdAt: at(1),
        updatedAt: at(1),
      },
    ],
  });
}

/**
 * A template database at migration 8 with the legacy dataset and one auth
 * user. Tests clone it (CREATE DATABASE … TEMPLATE) so each starts identical.
 */
export async function buildLegacyTemplate(): Promise<RehearsalDb> {
  const tmpl = await createRehearsalDatabase();
  await tmpl.applyMigrations(migrationsThrough(8));
  await createAuthUsers(tmpl, [LEGACY.owner]);
  await seedLegacyData(tmpl);
  await tmpl.prisma.$disconnect();
  return tmpl;
}
