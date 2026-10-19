import fs from "node:fs";
import path from "node:path";
import type { Account } from "@/lib/data/account";
import { ownedModels, SHARED_OR_OWNED_MODEL } from "@/lib/data/scope";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { createGoal } from "@/lib/goals/goals";
import { completeWorkout } from "@/lib/logging/sessions";
import { logSet } from "@/lib/logging/logged-sets";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { logCardio } from "@/lib/cardio/cardio-logs";
import { setExerciseFavorite } from "@/lib/exercises/exercises";
import { listMesocyclesForHome } from "@/lib/plan/queries";
import { addDays } from "@/lib/plan/calendar";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  activePlan,
  library,
  startToday,
  today,
  type Lib,
} from "./isolation/fixtures";
import { ISOLATION_COVERAGE } from "./isolation/coverage";

/**
 * Multi-User Foundation — Stage 3 (ENFORCE) and the database second layer
 * (spec §8, §14.3; R11, R14). With 9_account_ownership_2_enforce applied:
 * ownership is mandatory and immutable, every owned relation is same-owner,
 * library rows are ownerless, and the formerly global uniqueness rules are
 * per account.
 */

const raw = () => getTestPrisma();

const OWNED_TABLES = [
  "mesocycles",
  "sessions",
  "session_exercises",
  "gyms",
  "gym_exercise_baselines",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "missed_day_resolutions",
  "goals",
  "planned_cardio",
  "cardio_logs",
  "exercise_favorites",
  "profiles",
];

/** Everything an account can own, written through the real write modules. */
async function fullAccount(account: Account, lib: Lib, label: string) {
  const plan = await activePlan(account, lib, label);
  const { loggedSessionId, les } = await startToday(account, plan);
  for (const n of [1, 2, 3]) {
    await logSet(account, {
      loggedExerciseId: les[0].id,
      setNumber: n,
      weightLbs: 100,
      reps: 8,
    });
  }
  await logSet(account, {
    loggedExerciseId: les[1].id,
    setNumber: 1,
    weightLbs: 135,
    reps: 5,
  });
  await completeWorkout(account, { loggedSessionId });
  await createGoal(account, {
    exerciseId: lib.chestPress.id,
    gymId: plan.gym.id,
    targetWeightLbs: 300,
    targetReps: 8,
  });
  await createGoal(account, {
    exerciseId: lib.bench.id,
    targetWeightLbs: 315,
    targetReps: 5,
  });
  await logCardio(account, {
    mesocycleId: plan.meso.id,
    scheduledFor: today(),
    type: "Incline walk",
    durationMin: "20",
  });
  await resolveMissedDay(account, {
    mesocycleId: plan.meso.id,
    missedOn: addDays(today(), -7),
    outcome: "skipped",
  });
  await setExerciseFavorite(account, {
    exerciseId: lib.bench.id,
    isFavorite: true,
  });
  return plan;
}

function code(error: unknown): string | undefined {
  const e = error as {
    code?: string;
    meta?: { code?: string };
    message?: string;
  };
  const m = /Code: `(\w+)`/.exec(e.message ?? "");
  return e.meta?.code ?? m?.[1] ?? e.code;
}

async function sqlError(
  sql: string,
  ...params: unknown[]
): Promise<string | null> {
  try {
    await raw().$executeRawUnsafe(sql, ...params);
    return null;
  } catch (error) {
    return code(error) ?? "error";
  }
}

describe("ownership is mandatory", () => {
  it("every owned table's user_id is NOT NULL; exercises.user_id stays nullable (library)", async () => {
    const rows = await raw().$queryRawUnsafe<
      { table_name: string; is_nullable: string }[]
    >(
      `SELECT table_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'user_id'
        ORDER BY table_name`,
    );
    const nullable = Object.fromEntries(
      rows.map((r) => [r.table_name, r.is_nullable]),
    );
    for (const t of OWNED_TABLES) expect([t, nullable[t]]).toEqual([t, "NO"]);
    expect(nullable.exercises).toBe("YES");
  });

  it("library rows are ownerless and custom rows are owned (CHECK)", async () => {
    const a = await createTestAccount();
    expect(
      await sqlError(
        `INSERT INTO exercises (id, name, muscle_group, equipment_type, is_custom, source_id, user_id, updated_at)
         VALUES (gen_random_uuid(), 'Owned Library', 'chest', 'barbell', false, 'src-x', $1::uuid, now())`,
        a.userId,
      ),
    ).toBe("23514");
    expect(
      await sqlError(
        `INSERT INTO exercises (id, name, muscle_group, equipment_type, is_custom, updated_at)
         VALUES (gen_random_uuid(), 'Ownerless Custom', 'chest', 'barbell', true, now())`,
      ),
    ).toBe("23514");
  });

  it("a profile with owned rows cannot be hard-deleted (Restrict)", async () => {
    const lib = await library();
    const a = await createTestAccount();
    await fullAccount(a, lib, "A");
    // restrict_violation: the owned rows reference the profile (ON DELETE RESTRICT).
    expect(
      await sqlError(`DELETE FROM profiles WHERE user_id = $1::uuid`, a.userId),
    ).toBe("23001");
    expect(await raw().profile.count({ where: { userId: a.userId } })).toBe(1);
  });
});

describe("per-account uniqueness (formerly global)", () => {
  it("two accounts may each have an active mesocycle; one account still may not have two", async () => {
    const lib = await library();
    const a = await createTestAccount();
    const b = await createTestAccount();
    const aPlan = await activePlan(a, lib, "A");
    const bPlan = await activePlan(b, lib, "B");
    expect((await listMesocyclesForHome(a)).active?.id).toBe(aPlan.meso.id);
    expect((await listMesocyclesForHome(b)).active?.id).toBe(bPlan.meso.id);

    // Within one account the rule is unchanged.
    const second = await createMesocycle(a, {
      name: "A Second",
      startDate: today(),
      lengthWeeks: "5",
      deloadEveryWeeks: "5",
      splitType: "ppl",
    });
    // unique_violation from mesocycles_single_active_per_user.
    expect(
      await sqlError(
        `UPDATE mesocycles SET status = 'active' WHERE id = $1::uuid`,
        second.id,
      ),
    ).toBe("23505");
    await expect(
      activateMesocycle(a, { mesocycleId: second.id, expectedActiveId: null }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/conflict|invalid_state_transition/),
    });
  });

  it("two accounts may each hold an active goal on the same library exercise — with no hint of the other", async () => {
    const lib = await library();
    const a = await createTestAccount();
    const b = await createTestAccount();
    await createGoal(a, {
      exerciseId: lib.bench.id,
      targetWeightLbs: 315,
      targetReps: 1,
    });
    const mine = await createGoal(b, {
      exerciseId: lib.bench.id,
      targetWeightLbs: 225,
      targetReps: 5,
    });
    expect(mine.outcome).toBe("active");
    // Within one account the second active goal is still blocked.
    await expect(
      createGoal(b, {
        exerciseId: lib.bench.id,
        targetWeightLbs: 200,
        targetReps: 5,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("same-owner triggers (database second layer)", () => {
  type Trigger = {
    table: string;
    parent: string;
    fk: string;
    allowShared: boolean;
  };

  async function installedTriggers(): Promise<Trigger[]> {
    const rows = await raw().$queryRawUnsafe<{ tbl: string; args: string }[]>(
      `SELECT c.relname AS tbl, encode(t.tgargs, 'escape') AS args
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND p.proname = 'overload_assert_same_owner'
        ORDER BY 1, 2`,
    );
    return rows.map((r) => {
      const [parent, fk, allow] = r.args.split("\\000").filter(Boolean);
      return { table: r.tbl, parent, fk, allowShared: allow === "true" };
    });
  }

  it("covers every owned relation (20 triggers)", async () => {
    const triggers = await installedTriggers();
    expect(triggers).toHaveLength(20);
    // Every foreign key from an owned table to an owned or exercise parent.
    const fks = await raw().$queryRawUnsafe<
      { tbl: string; col: string; ref: string }[]
    >(
      `SELECT c.relname AS tbl, a.attname AS col, r.relname AS ref
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
         JOIN pg_class r ON r.oid = k.confrelid
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
        WHERE k.contype = 'f' AND r.relname <> 'profiles'
          AND c.relnamespace = 'public'::regnamespace
        ORDER BY 1, 2`,
    );
    expect(fks.map((f) => `${f.tbl}.${f.col}->${f.ref}`).sort()).toEqual(
      triggers.map((t) => `${t.table}.${t.fk}->${t.parent}`).sort(),
    );
  });

  it("refuses, on every relation, a row pointing at another account's parent", async () => {
    const lib = await library();
    const a = await createTestAccount();
    const b = await createTestAccount();
    const aPlan = await fullAccount(a, lib, "A");
    await fullAccount(b, lib, "B");
    const aCustom = aPlan.custom.id;

    for (const t of await installedTriggers()) {
      const parentRows = await raw().$queryRawUnsafe<{ id: string }[]>(
        t.parent === "exercises"
          ? `SELECT id::text AS id FROM exercises WHERE id = $1::uuid`
          : `SELECT id::text AS id FROM "${t.parent}" WHERE user_id = $1::uuid LIMIT 1`,
        t.parent === "exercises" ? aCustom : a.userId,
      );
      expect([t.table, t.fk, parentRows.length]).toEqual([t.table, t.fk, 1]);
      const err = await sqlError(
        `UPDATE "${t.table}" SET "${t.fk}" = $1::uuid
          WHERE ctid = (SELECT ctid FROM "${t.table}" WHERE user_id = $2::uuid LIMIT 1)`,
        parentRows[0].id,
        b.userId,
      );
      expect([t.table, t.fk, err]).toEqual([t.table, t.fk, "23514"]);
    }
  });

  it("allows a shared library exercise wherever an exercise is referenced", async () => {
    const lib = await library();
    const b = await createTestAccount();
    await fullAccount(b, lib, "B");
    const shared = (await installedTriggers()).filter((t) => t.allowShared);
    expect(shared.map((t) => `${t.table}.${t.fk}`).sort()).toEqual(
      [
        "exercise_favorites.exercise_id",
        "goals.exercise_id",
        "gym_exercise_baselines.exercise_id",
        "logged_exercises.exercise_id",
        "logged_exercises.planned_exercise_id",
        "session_exercises.exercise_id",
      ].sort(),
    );
    for (const t of shared) {
      const err = await sqlError(
        `UPDATE "${t.table}" SET "${t.fk}" = $1::uuid
          WHERE ctid = (SELECT ctid FROM "${t.table}" WHERE user_id = $2::uuid LIMIT 1)`,
        lib.incline.id,
        b.userId,
      );
      expect([t.table, t.fk, err]).toEqual([t.table, t.fk, null]);
    }
  });

  it("ownership is immutable on every table that has it", async () => {
    const lib = await library();
    const a = await createTestAccount();
    const b = await createTestAccount();
    await fullAccount(b, lib, "B");
    for (const table of [...OWNED_TABLES, "exercises"]) {
      const err = await sqlError(
        `UPDATE "${table}" SET user_id = $1::uuid
          WHERE ctid = (SELECT ctid FROM "${table}" WHERE user_id = $2::uuid LIMIT 1)`,
        a.userId,
        b.userId,
      );
      expect([table, err]).toEqual([table, "23514"]);
    }
    // A library row can't be claimed either.
    expect(
      await sqlError(
        `UPDATE exercises SET user_id = $1::uuid WHERE id = $2::uuid`,
        a.userId,
        lib.bench.id,
      ),
    ).toBe("23514");
  });

  it("the trigger functions are not callable through the Data API roles", async () => {
    await raw().$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
       END $$;`,
    );
    for (const role of ["anon", "authenticated"]) {
      for (const fn of [
        "overload_assert_same_owner()",
        "overload_user_id_immutable()",
      ]) {
        const rows = await raw().$queryRawUnsafe<{ ok: boolean }[]>(
          `SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE') AS ok`,
        );
        expect([role, fn, rows[0].ok]).toEqual([role, fn, false]);
      }
    }
  });
});

describe("the isolation suite covers every owned model", () => {
  it("every owned model (and the shared Exercise) has isolation tests on file", () => {
    expect(Object.keys(ISOLATION_COVERAGE).sort()).toEqual(
      [...ownedModels(), SHARED_OR_OWNED_MODEL].sort(),
    );
    for (const [model, files] of Object.entries(ISOLATION_COVERAGE)) {
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect([
          model,
          fs.existsSync(path.join(__dirname, "isolation", f)),
        ]).toEqual([model, true]);
      }
    }
  });
});
