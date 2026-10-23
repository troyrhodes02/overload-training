import { getTestPrisma } from "../support/db";
import { unknownId } from "../support/accounts";

/**
 * Cross-account isolation suite helpers (Multi-User Foundation spec §14.2).
 * The suite is PERMANENT: every later pitch keeps it green and extends it for
 * any new owned model (see ./coverage.ts).
 */

export type Outcome =
  | { ok: true; value: unknown }
  | {
      ok: false;
      name: string;
      code?: string;
      message: string;
      details?: unknown;
    };

/** Runs a read or write and captures exactly what a caller could observe. */
export async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const e = error as {
      name?: string;
      code?: string;
      message?: string;
      details?: unknown;
    };
    return {
      ok: false,
      name: e.name ?? "Error",
      code: e.code,
      message: e.message ?? String(error),
      details: e.details,
    };
  }
}

/**
 * The core obligation: naming another account's object must be
 * indistinguishable from naming one that never existed (PRD edge case).
 * `call(id)` is run once with the foreign id and once with a random UUID.
 */
export async function expectForeignLikeMissing(
  foreignId: string,
  call: (id: string) => Promise<unknown>,
): Promise<Outcome> {
  const foreign = await outcome(() => call(foreignId));
  const missing = await outcome(() => call(unknownId()));
  expect(foreign).toEqual(missing);
  return foreign;
}

const OWNED_TABLES = [
  "profiles",
  "mesocycles",
  "sessions",
  "session_exercises",
  "exercises",
  "exercise_favorites",
  "gyms",
  "gym_exercise_baselines",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "missed_day_resolutions",
  "goals",
  "planned_cardio",
  "cardio_logs",
  "tour_progress",
  "release_seen",
  "feedback",
] as const;

/** Every row an account owns, in a stable order — to prove it never changed. */
export async function snapshotAccount(
  userId: string,
): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of OWNED_TABLES) {
    out[table] = await getTestPrisma().$queryRawUnsafe(
      `SELECT to_jsonb(t) AS row FROM "${table}" t WHERE t.user_id = $1::uuid
        ORDER BY to_jsonb(t)::text`,
      userId,
    );
  }
  return out;
}

/** Rows an account owns across every owned table (for "B created only its own"). */
export async function ownedRowCount(userId: string): Promise<number> {
  const snap = await snapshotAccount(userId);
  return Object.values(snap).reduce((n, rows) => n + rows.length, 0);
}
