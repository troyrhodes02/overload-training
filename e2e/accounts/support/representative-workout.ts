import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { skipFirstTour } from "../tour-support";

/**
 * The representative workout for the Faster Logging UX tap-count measurement
 * (spec §14.4; design doc §8; method note "Set entry and tap-count method").
 * The SAME seed is used for the before (Pitch 4 card, `fe34d00`) and after
 * measurements, so the two numbers compare like with like.
 *
 * Local Supabase stack only. Rows are written for ONE temporary account the
 * suite created through signup, named by email; nothing else is read or
 * changed, and the suite deletes the account through the app afterwards.
 *
 * Push Day 1 at Downtown Gym, today (account timezone), week 2 of Hypertrophy
 * Block 3 (5 weeks, deload every 5 → not a deload week). Last week's Push Day
 * 1 is complete with the history below, and Triceps Pushdown has a Downtown
 * Gym baseline of 50 (as completing it would have established).
 */

export type Planned = {
  name: string; // the library row's exact name
  sets: number;
  repMin: number;
  repMax: number;
  history: { w: number | null; r: number }[];
  today: { w: number | null; r: number }[];
};

export const REPRESENTATIVE: readonly Planned[] = [
  {
    name: "Barbell Bench Press - Medium Grip",
    sets: 3,
    repMin: 6,
    repMax: 8,
    history: [
      { w: 185, r: 8 },
      { w: 185, r: 8 },
      { w: 185, r: 7 },
    ],
    today: [
      { w: 185, r: 8 },
      { w: 185, r: 8 },
      { w: 185, r: 7 },
    ],
  },
  {
    name: "Incline Dumbbell Press",
    sets: 3,
    repMin: 8,
    repMax: 10,
    history: [
      { w: 60, r: 10 },
      { w: 60, r: 10 },
      { w: 60, r: 9 },
    ],
    today: [
      { w: 65, r: 9 },
      { w: 65, r: 8 },
      { w: 65, r: 8 },
    ],
  },
  {
    name: "Triceps Pushdown",
    sets: 3,
    repMin: 10,
    repMax: 12,
    history: [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ],
    today: [
      { w: 50, r: 12 },
      { w: 50, r: 12 },
      { w: 50, r: 11 },
    ],
  },
  {
    name: "Pushups",
    sets: 2,
    repMin: 12,
    repMax: 20,
    history: [
      { w: null, r: 18 },
      { w: null, r: 15 },
    ],
    today: [
      { w: null, r: 18 },
      { w: null, r: 16 },
    ],
  },
];

export const PUSHDOWN_BASELINE_LBS = 50;

/**
 * The BEFORE measurement: the Pitch 4 card (`main` @ fe34d00) driven through
 * this workout by e2e/accounts/tap-count-baseline.spec.ts from a worktree of
 * that commit, local stack, 2026-10-20. Re-run that spec to reproduce it.
 */
export const PITCH4_BASELINE = {
  commit: "fe34d00",
  taps: 29,
  keystrokes: 28,
} as const;

function localDbUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgresql:\/\/[^@]*@127\.0\.0\.1:/.test(url)) {
    throw new Error("The representative workout seeds the local stack only.");
  }
  return url;
}

async function withDb<T>(run: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: localDbUrl() });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA → YYYY-MM-DD
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(iso: string): number {
  return ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

export type Seeded = {
  userId: string;
  today: string;
  sessionId: string;
  downtownGymId: string;
  campusGymId: string;
};

/**
 * Seed the representative workout for the account with this email. Also adds
 * an empty second gym ("Campus Rec Center") so the start screen offers a
 * choice, as it does for a lifter with two gyms. One transaction.
 */
export async function seedRepresentativeWorkout(
  email: string,
): Promise<Seeded> {
  return withDb(async (db) => {
    const user = await db.query<{ id: string; time_zone: string }>(
      `SELECT u.id, p.time_zone FROM auth.users u
         JOIN profiles p ON p.user_id = u.id WHERE u.email = $1`,
      [email],
    );
    if (user.rowCount !== 1) throw new Error(`No account for ${email}`);
    const { id: userId, time_zone: tz } = user.rows[0];
    const today = todayIn(tz);
    const start = addDaysIso(today, -7);

    const names = REPRESENTATIVE.map((p) => p.name);
    const lib = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM exercises
        WHERE user_id IS NULL AND deleted_at IS NULL AND name = ANY($1)`,
      [names],
    );
    const idOf = new Map(lib.rows.map((r) => [r.name, r.id]));
    for (const n of names) {
      if (!idOf.has(n)) throw new Error(`Library exercise missing: ${n}`);
    }

    await db.query("BEGIN");
    try {
      const gym = async (name: string) =>
        (
          await db.query<{ id: string }>(
            `INSERT INTO gyms (id, user_id, name, updated_at)
             VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
            [userId, name],
          )
        ).rows[0].id;
      const downtown = await gym("Downtown Gym");
      const campus = await gym("Campus Rec Center");

      const meso = (
        await db.query<{ id: string }>(
          `INSERT INTO mesocycles (id, user_id, name, length_weeks, deload_week, split_type, status, start_date, updated_at)
           VALUES (gen_random_uuid(), $1, 'Hypertrophy Block 3', 5, 5, 'custom', 'active', $2, now()) RETURNING id`,
          [userId, start],
        )
      ).rows[0].id;
      const session = (
        await db.query<{ id: string }>(
          `INSERT INTO sessions (id, user_id, mesocycle_id, name, day_of_week, position, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'Push Day 1', $3, 0, now()) RETURNING id`,
          [userId, meso, isoWeekday(today)],
        )
      ).rows[0].id;

      const last = (
        await db.query<{ id: string }>(
          `INSERT INTO logged_sessions (id, user_id, mesocycle_id, session_id, performed_on, scheduled_for, status, completed_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date + time '18:00', $4, 'complete', $4::date + time '19:00', now()) RETURNING id`,
          [userId, meso, session, start],
        )
      ).rows[0].id;

      for (const [position, p] of REPRESENTATIVE.entries()) {
        const exerciseId = idOf.get(p.name)!;
        const slot = (
          await db.query<{ id: string }>(
            `INSERT INTO session_exercises (id, user_id, session_id, exercise_id, position, planned_sets, target_rep_min, target_rep_max, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
            [userId, session, exerciseId, position, p.sets, p.repMin, p.repMax],
          )
        ).rows[0].id;
        const le = (
          await db.query<{ id: string }>(
            `INSERT INTO logged_exercises (id, user_id, logged_session_id, exercise_id, gym_id, position, planned_exercise_id, session_exercise_id, planned_sets, target_rep_min, target_rep_max, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $3, $6, $7, $8, $9, now()) RETURNING id`,
            [
              userId,
              last,
              exerciseId,
              downtown,
              position,
              slot,
              p.sets,
              p.repMin,
              p.repMax,
            ],
          )
        ).rows[0].id;
        for (const [i, s] of p.history.entries()) {
          await db.query(
            `INSERT INTO logged_sets (id, user_id, logged_exercise_id, set_number, weight_lbs, reps, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
            [userId, le, i + 1, s.w, s.r],
          );
        }
        if (p.name === "Triceps Pushdown") {
          await db.query(
            `INSERT INTO gym_exercise_baselines (id, user_id, gym_id, exercise_id, weight_lbs, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
            [userId, downtown, exerciseId, PUSHDOWN_BASELINE_LBS],
          );
        }
      }
      await db.query("COMMIT");
      return {
        userId,
        today,
        sessionId: session,
        downtownGymId: downtown,
        campusGymId: campus,
      };
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  });
}

export type LoggedRow = {
  exercise: string;
  setNumber: number;
  weightLbs: number | null;
  reps: number;
};

/** Every set the account has logged on `date`, in plan and set order. */
export async function loggedSetsOn(
  userId: string,
  date: string,
): Promise<LoggedRow[]> {
  return withDb(async (db) => {
    const r = await db.query<{
      name: string;
      set_number: number;
      weight_lbs: string | null;
      reps: number;
    }>(
      `SELECT e.name, s.set_number, s.weight_lbs, s.reps
         FROM logged_sets s
         JOIN logged_exercises le ON le.id = s.logged_exercise_id
         JOIN logged_sessions ls ON ls.id = le.logged_session_id
         JOIN exercises e ON e.id = le.exercise_id
        WHERE s.user_id = $1 AND ls.scheduled_for = $2
        ORDER BY le.position, s.set_number`,
      [userId, date],
    );
    return r.rows.map((row) => ({
      exercise: row.name,
      setNumber: row.set_number,
      weightLbs: row.weight_lbs === null ? null : Number(row.weight_lbs),
      reps: row.reps,
    }));
  });
}

/** The stored RIR of each of the day's sets, in card order (RIR Logging). */
export async function rirOn(
  userId: string,
  date: string,
): Promise<(number | null)[]> {
  return withDb(async (db) => {
    const r = await db.query<{ rir: number | null }>(
      `SELECT s.rir
         FROM logged_sets s
         JOIN logged_exercises le ON le.id = s.logged_exercise_id
         JOIN logged_sessions ls ON ls.id = le.logged_session_id
        WHERE s.user_id = $1 AND ls.scheduled_for = $2
        ORDER BY le.position, s.set_number`,
      [userId, date],
    );
    return r.rows.map((row) => row.rir);
  });
}

/**
 * Make last time's bench session top-of-range (185 × 8, 8, 8) so today's
 * matching session forms a Progress candidate (RIR Logging e2e, case A).
 * Test-only, local stack, the temporary account's own seeded row.
 */
export async function benchHistoryAllTop(userId: string): Promise<void> {
  await withDb(async (db) => {
    const r = await db.query(
      `UPDATE logged_sets s SET reps = 8, updated_at = now()
         FROM logged_exercises le, exercises e
        WHERE s.logged_exercise_id = le.id AND le.exercise_id = e.id
          AND s.user_id = $1 AND e.name = $2 AND s.set_number = 3`,
      [userId, REPRESENTATIVE[0].name],
    );
    if (r.rowCount !== 1) throw new Error("Expected one seeded bench set 3");
  });
}

/**
 * Smarter & Explainable Progression: one more complete Push Day 1, a week
 * before the seeded "last time", with bench at 185 × 8, 8, 8 — so, with
 * `benchHistoryAllTop`, bench has two counted sessions at the top of its range
 * and today's card has a Progress call to explain. Its sets are created
 * earlier than the seeded ones, so the working weight is unchanged.
 */
export async function addEarlierBenchSession(userId: string): Promise<void> {
  await withDb(async (db) => {
    await db.query("BEGIN");
    try {
      const last = await db.query<{
        mesocycle_id: string;
        session_id: string;
        scheduled_for: string;
        exercise_id: string;
        gym_id: string;
        session_exercise_id: string;
      }>(
        `SELECT ls.mesocycle_id, ls.session_id, ls.scheduled_for::text AS scheduled_for,
                le.exercise_id, le.gym_id, le.session_exercise_id
           FROM logged_sessions ls
           JOIN logged_exercises le ON le.logged_session_id = ls.id
           JOIN exercises e ON e.id = le.exercise_id
          WHERE ls.user_id = $1 AND ls.status = 'complete' AND e.name = $2`,
        [userId, REPRESENTATIVE[0].name],
      );
      if (last.rowCount !== 1) throw new Error("Expected one seeded bench");
      const r = last.rows[0];
      const earlier = addDaysIso(r.scheduled_for, -7);
      const ls = (
        await db.query<{ id: string }>(
          `INSERT INTO logged_sessions (id, user_id, mesocycle_id, session_id, performed_on, scheduled_for, status, completed_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date + time '18:00', $4, 'complete', $4::date + time '19:00', now()) RETURNING id`,
          [userId, r.mesocycle_id, r.session_id, earlier],
        )
      ).rows[0].id;
      const p = REPRESENTATIVE[0];
      const le = (
        await db.query<{ id: string }>(
          `INSERT INTO logged_exercises (id, user_id, logged_session_id, exercise_id, gym_id, position, planned_exercise_id, session_exercise_id, planned_sets, target_rep_min, target_rep_max, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, $3, $5, $6, $7, $8, now()) RETURNING id`,
          [
            userId,
            ls,
            r.exercise_id,
            r.gym_id,
            r.session_exercise_id,
            p.sets,
            p.repMin,
            p.repMax,
          ],
        )
      ).rows[0].id;
      for (let i = 1; i <= p.sets; i++) {
        await db.query(
          `INSERT INTO logged_sets (id, user_id, logged_exercise_id, set_number, weight_lbs, reps, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 185, 8, now() - interval '30 days', now())`,
          [userId, le, i],
        );
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  });
}

/** Account-wide counts used to prove nothing was written. */
export async function setCount(userId: string): Promise<number> {
  return withDb(async (db) =>
    Number(
      (
        await db.query<{ n: string }>(
          "SELECT count(*) AS n FROM logged_sets WHERE user_id = $1",
          [userId],
        )
      ).rows[0].n,
    ),
  );
}

export async function workoutStatus(
  userId: string,
  date: string,
): Promise<string | null> {
  return withDb(async (db) => {
    const r = await db.query<{ status: string }>(
      "SELECT status FROM logged_sessions WHERE user_id = $1 AND scheduled_for = $2",
      [userId, date],
    );
    return r.rows[0]?.status ?? null;
  });
}

export async function pushdownBaseline(
  userId: string,
  gymId: string,
): Promise<number | null> {
  return withDb(async (db) => {
    const r = await db.query<{ weight_lbs: string }>(
      `SELECT b.weight_lbs FROM gym_exercise_baselines b
         JOIN exercises e ON e.id = b.exercise_id
        WHERE b.user_id = $1 AND b.gym_id = $2 AND e.name = 'Triceps Pushdown'`,
      [userId, gymId],
    );
    return r.rows[0] ? Number(r.rows[0].weight_lbs) : null;
  });
}

/** The expected rows after driving `today` through the representative workout. */
export function expectedToday(): LoggedRow[] {
  return REPRESENTATIVE.flatMap((p) =>
    p.today.map((s, i) => ({
      exercise: p.name,
      setNumber: i + 1,
      weightLbs: s.w,
      reps: s.r,
    })),
  );
}

/**
 * Counts what the lifter does (spec §14.4): a TAP is one pointer activation on
 * a page element; a KEYSTROKE is one key on the keyboard. Drivers must act only
 * through this counter, never fill()/focus()/script.
 */
export class Counter {
  taps = 0;
  keystrokes = 0;
  log: string[] = [];
  constructor(private readonly page: Page) {}

  async tap(target: Locator, why: string) {
    await target.tap();
    this.taps += 1;
    this.log.push(`tap  ${why}`);
  }

  /** Tap a field only if the app has not already focused it. */
  async focusField(field: Locator, why: string) {
    const focused = await field.evaluate((el) => el === document.activeElement);
    if (!focused) await this.tap(field, why);
    else this.log.push(`(focused) ${why}`);
  }

  async type(text: string) {
    await this.page.keyboard.type(text);
    this.keystrokes += text.length;
  }

  async press(key: string, times = 1) {
    for (let i = 0; i < times; i++) await this.page.keyboard.press(key);
    this.keystrokes += times;
  }
}

/** From Today to the open workout page (not counted: the same for both UIs). */
export async function startRepresentativeWorkout(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page).toHaveURL(/\/log\/start\?/);
  await page.getByLabel("Downtown Gym").check();
  await page.getByRole("button", { name: "Start logging" }).click();
  await expect(page).toHaveURL(/\/log\/[0-9a-f-]{36}$/);
}

export type TempAccount = { email: string; password: string; username: string };

/** A temporary account for one suite run (removed by deleteThroughApp). */
export function tempAccount(label: string): TempAccount {
  const stamp = Date.now();
  return {
    email: `e2e-${stamp}-${label}@example.test`,
    password: `${label}-pass-123`,
    username: `e2e_${label}_${String(stamp).slice(-8)}`,
  };
}

/** Sign up through the app, then dismiss the first-visit tour. */
export async function signUpThroughApp(page: Page, who: TempAccount) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Robin");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByLabel("Confirm password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await skipFirstTour(page);
}

/** True while the account still exists (so cleanup can run after a failure). */
export async function accountExists(email: string): Promise<boolean> {
  return withDb(async (db) => {
    const r = await db.query("SELECT 1 FROM auth.users WHERE email = $1", [
      email,
    ]);
    return (r.rowCount ?? 0) > 0;
  });
}

/** Remove a temporary account through the app's own deletion flow. */
export async function deleteThroughApp(page: Page, who: TempAccount) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings/delete-account");
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page
    .getByRole("button", { name: "Delete account permanently" })
    .click();
  await expect(page).toHaveURL(/\/login\?notice=deleted$/);
}

/** Phone context used by both drivers: same viewport, touch, timezone. */
export const PHONE_CONTEXT = {
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
  timezoneId: "America/Chicago",
} as const;
