import { createHash } from "node:crypto";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { ACCOUNT_DELETION_STEPS } from "@/lib/accounts/deletion";
import { updateAppearance } from "@/lib/accounts/appearance";
import { updateProfile } from "@/lib/accounts/profile";
import { logCardio } from "@/lib/cardio/cardio-logs";
import {
  createCustomExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import { archiveGoal, createGoal } from "@/lib/goals/goals";
import { createGym } from "@/lib/gyms/gyms";
import { logSet } from "@/lib/logging/logged-sets";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { addPlannedCardio } from "@/lib/plan/cardio";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { markReleaseNotesSeen } from "@/lib/release-notes/seen";
import { recordTourOutcome } from "@/lib/tour/progress";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import { orderedReleaseNotes } from "@overload/shared/release-notes/catalog";
import {
  ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR,
  QA_BLOCKS,
  QA_CARDIO_LOGS,
  QA_CUSTOM_EXERCISE,
  QA_FAVORITES,
  QA_FIXTURE_VERSION,
  QA_GOALS,
  QA_GYMS,
  QA_LIBRARY,
  QA_PERFORMANCES,
  QA_PLANNED_CARDIO,
  QA_PROFILE,
  QA_RIR,
  QA_RIR_FIRST_WEEK,
  QA_SESSIONS,
  QA_SKIPPED,
  QA_TIME_ZONE,
  expectedCounts,
  qaOccurrences,
  type QaCounts,
  type QaExercise,
} from "./fixture";
import type { DemoGym } from "../demo/fixture";
import {
  QA_PRESERVED_MODELS,
  QA_RESET_MODELS,
  QaFixtureRefused,
  assertQaTestEmail,
  isQaTestEmail,
} from "./rules";
import { QA_BASELINE_HASHES } from "./baseline";

export {
  QA_PRESERVED_MODELS,
  QA_RESET_MODELS,
  QaFixtureRefused,
  assertQaTestEmail,
  isQaTestEmail,
};

/**
 * The QA fixture (OVE-173): seed, reset, verify, and fingerprint the ONE
 * designated QA account. Operator tooling, never imported by `src/`.
 *
 *  - Every write goes through the application's own write modules, inside ONE
 *    account-scoped transaction, so every invariant holds: LoggedSet rows come
 *    only from logSet, each set and its gym-baseline correction commit
 *    together, nothing derived is stored, and a failure leaves nothing behind.
 *  - The reset is the one deliberate exception to "only account deletion
 *    destroys logged history" (CLAUDE.md): it removes the designated QA
 *    account's TRAINING rows with the account-deletion module's own removal
 *    steps (ACCOUNT_DELETION_STEPS, through the account-scoped client, so
 *    another account and the shared library are unreachable), in that
 *    module's order, and re-seeds in the same transaction. It runs only on the
 *    development project (cli.ts) and only for an account whose email is on a
 *    reserved test domain (assertQaTestEmail), so a real lifter's account can
 *    never be its target. tests/unit/qa-fixture.test.ts pins it as the only
 *    other user of those steps.
 */

// ---------------------------------------------------------------------------
// Counting and inspection (read-only).
// ---------------------------------------------------------------------------

type Db = Account["db"] | AccountTx;

async function countsOf(db: Db): Promise<QaCounts> {
  const [
    gyms,
    customExercises,
    favorites,
    mesocycles,
    sessions,
    sessionExercises,
    plannedCardio,
    loggedSessions,
    loggedExercises,
    loggedSets,
    gymBaselines,
    missedDayResolutions,
    cardioLogs,
    goals,
  ] = await Promise.all([
    db.gym.count(),
    db.exercise.count({ where: { isCustom: true } }),
    db.exerciseFavorite.count(),
    db.mesocycle.count(),
    db.session.count(),
    db.sessionExercise.count(),
    db.plannedCardio.count(),
    db.loggedSession.count(),
    db.loggedExercise.count(),
    db.loggedSet.count(),
    db.gymExerciseBaseline.count(),
    db.missedDayResolution.count(),
    db.cardioLog.count(),
    db.goal.count(),
  ]);
  return {
    gyms,
    customExercises,
    favorites,
    mesocycles,
    sessions,
    sessionExercises,
    plannedCardio,
    loggedSessions,
    loggedExercises,
    loggedSets,
    gymBaselines,
    missedDayResolutions,
    cardioLogs,
    goals,
  };
}

const total = (c: QaCounts) => Object.values(c).reduce((a, b) => a + b, 0);

export type QaInspection = {
  counts: QaCounts;
  expected: QaCounts;
  /** "empty": no training data; anything else holds data (ours or not). */
  state: "empty" | "has-data";
  /** Plan-import sessions that point at a mesocycle (block a reset). */
  importsHoldingABlock: number;
};

export async function inspectQaTarget(account: Account): Promise<QaInspection> {
  const counts = await countsOf(account.db);
  const importsHoldingABlock = await account.db.importSession.count({
    where: { mesocycleId: { not: null } },
  });
  return {
    counts,
    expected: expectedCounts(),
    state: total(counts) === 0 ? "empty" : "has-data",
    importsHoldingABlock,
  };
}

// ---------------------------------------------------------------------------
// Writing the baseline.
// ---------------------------------------------------------------------------

/** Library exercise ids by fixture key; refuses missing or archived ones. */
async function resolveLibrary(
  db: Db,
): Promise<Record<Exclude<QaExercise, "LANDMINE">, string>> {
  const rows = await db.exercise.findMany({
    where: { sourceId: { in: Object.values(QA_LIBRARY) }, isCustom: false },
    select: { id: true, sourceId: true, deletedAt: true },
  });
  const out = {} as Record<Exclude<QaExercise, "LANDMINE">, string>;
  const missing: string[] = [];
  for (const [key, sourceId] of Object.entries(QA_LIBRARY) as [
    Exclude<QaExercise, "LANDMINE">,
    string,
  ][]) {
    const row = rows.find((r) => r.sourceId === sourceId && !r.deletedAt);
    if (row) out[key] = row.id;
    else missing.push(sourceId);
  }
  if (missing.length > 0) {
    throw new QaFixtureRefused(
      `The shared exercise library is missing (or has archived) ${missing.join(", ")}. Import the library first; the QA fixture never creates library exercises.`,
    );
  }
  return out;
}

/** The account the fixture acts as: its own id and client, in the fixture's zone. */
function inFixtureZone(account: Account): Account {
  return { ...account, timeZone: QA_TIME_ZONE };
}

export type QaWriteOptions = {
  /** The baseline's "today" (YYYY-MM-DD, fixture zone). Defaults to today. */
  anchorIso?: string;
  /** When the goal rows are written (tests pin it). */
  now?: Date;
  /** Test seam: runs inside the transaction after the reset's deletes. */
  afterDelete?: (tx: AccountTx) => Promise<void>;
};

/** Writes the whole baseline into an account with no training data, inside `tx`. */
async function writeBaseline(
  account: Account,
  tx: AccountTx,
  anchorIso: string,
  now: Date,
): Promise<void> {
  const library = await resolveLibrary(tx);

  // Account and preferences. The username is the account's own and is kept;
  // an account without one gets a stable one derived from its id.
  const profile = await tx.profile.findUnique({
    where: { userId: account.userId },
    select: { username: true },
  });
  await updateProfile(
    account,
    {
      firstName: QA_PROFILE.firstName,
      lastName: QA_PROFILE.lastName,
      username: profile?.username || `qa_${account.userId.slice(0, 8)}`,
      timeZone: QA_TIME_ZONE,
    },
    tx,
  );
  await updateAppearance(account, QA_PROFILE.appearance, tx);
  await recordTourOutcome(account, "completed", tx);
  await markReleaseNotesSeen(account, orderedReleaseNotes()[0].id, { tx });
  // Pro through Overload's own comp entitlement (reason "tester"), the same
  // mechanism the dev-tester provisioner and the founding-member grant use:
  // no Stripe customer, subscription, or invoice. Kept when already active.
  // An unrevoked comp counts only while the resolver would honour it (started,
  // and no end date or one still ahead); an expired one is revoked and
  // replaced, so the account is never left on Free (the one-active-comp index
  // allows one unrevoked comp).
  const unrevoked = await tx.entitlement.findMany({
    where: { source: "comp", revokedAt: null },
    select: { startedAt: true, endsAt: true },
  });
  if (!unrevoked.some((e) => compIsActive(e, now))) {
    if (unrevoked.length > 0) {
      await tx.entitlement.updateMany({
        where: { source: "comp", revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await tx.entitlement.create({
      data: {
        userId: account.userId,
        source: "comp",
        plan: "pro",
        startedAt: now,
        compReason: "tester",
        compNote: `QA fixture (${QA_FIXTURE_VERSION})`,
      },
    });
  }

  // Gyms, the custom exercise, favorites.
  const gymIds = {} as Record<DemoGym, string>;
  for (const [key, gym] of Object.entries(QA_GYMS) as [
    DemoGym,
    { name: string; address: string },
  ][]) {
    gymIds[key] = (await createGym(account, gym, tx)).id;
  }
  const custom = await createCustomExercise(
    account,
    {
      ...QA_CUSTOM_EXERCISE,
      secondaryMuscles: [...QA_CUSTOM_EXERCISE.secondaryMuscles],
    },
    tx,
  );
  const exerciseId: Record<QaExercise, string> = {
    ...library,
    LANDMINE: custom.id,
  };
  for (const ex of QA_FAVORITES) {
    await setExerciseFavorite(
      account,
      { exerciseId: exerciseId[ex], isFavorite: true },
      tx,
    );
  }

  // The two blocks: plan, activate, then that block's history (oldest first).
  const occurrences = qaOccurrences();
  let activeId: string | null = null;
  for (const block of QA_BLOCKS) {
    const startIso = addDays(anchorIso, -block.startDaysBeforeAnchor);
    const { id: mesocycleId } = await createMesocycle(
      account,
      {
        name: block.name,
        startDate: startIso,
        lengthWeeks: block.lengthWeeks,
        deloadEveryWeeks: block.deloadEveryWeeks,
        splitType: "custom",
      },
      tx,
    );
    const sessionIds = {} as Record<string, string>;
    for (const session of QA_SESSIONS) {
      const { id } = await addSession(
        account,
        {
          mesocycleId,
          name: session.name,
          dayOfWeek: isoWeekday(addDays(startIso, session.dayOffset)),
        },
        tx,
      );
      sessionIds[session.key] = id;
      for (const slot of session.slots) {
        await addSessionExercise(
          account,
          {
            sessionId: id,
            exerciseId: exerciseId[slot.ex],
            plannedSets: slot.sets,
            targetRepMin: slot.repMin,
            targetRepMax: slot.repMax,
          },
          tx,
        );
      }
    }
    const isActiveBlock = block === QA_BLOCKS[QA_BLOCKS.length - 1];
    if (isActiveBlock) {
      for (const c of QA_PLANNED_CARDIO) {
        const planned = await addPlannedCardio(
          account,
          {
            mesocycleId,
            dayOfWeek: isoWeekday(addDays(startIso, c.dayOffset)),
            type: c.type,
            durationMin: c.durationMin,
          },
          tx,
        );
        // The fixture's one timestamp adjustment: planned cardio has
        // occurrences only from the day its plan row was created, and in the
        // story it was planned with the block, so its creation date is the
        // block's start (a plan row, never logged history).
        await tx.plannedCardio.update({
          where: { id: planned.id },
          data: { createdAt: new Date(`${startIso}T00:00:00.000Z`) },
        });
      }
    }
    await activateMesocycle(
      account,
      { mesocycleId, expectedActiveId: activeId },
      tx,
    );
    activeId = mesocycleId;

    for (const o of occurrences.filter((x) => x.block === block.key)) {
      const scheduledFor = addDays(anchorIso, -o.daysBeforeAnchor);
      if (o.skipped) {
        await resolveMissedDay(
          account,
          { mesocycleId, missedOn: scheduledFor, outcome: "skipped" },
          tx,
        );
        continue;
      }
      const { loggedSessionId } = await startOrResumeWorkout(
        account,
        {
          sessionId: sessionIds[o.session],
          scheduledFor,
          gymId: gymIds[o.gym],
        },
        tx,
      );
      const loggedExercises = await tx.loggedExercise.findMany({
        where: { loggedSessionId },
        select: { id: true, plannedExerciseId: true },
        orderBy: { position: "asc" },
      });
      const session = QA_SESSIONS.find((s) => s.key === o.session)!;
      for (const slot of session.slots) {
        const le = loggedExercises.find(
          (x) => x.plannedExerciseId === exerciseId[slot.ex],
        )!;
        const [weightLbs, reps] = QA_PERFORMANCES[slot.ex][o.weekIndex];
        const rir = QA_RIR[slot.ex]?.[o.weekIndex - QA_RIR_FIRST_WEEK];
        for (let i = 0; i < slot.sets; i++) {
          await logSet(
            account,
            {
              loggedExerciseId: le.id,
              setNumber: i + 1,
              weightLbs,
              reps: reps[i],
              rir: rir?.[i] ?? null,
            },
            tx,
          );
        }
      }
      await completeWorkout(account, { loggedSessionId }, tx);
    }

    if (isActiveBlock) {
      for (const c of QA_CARDIO_LOGS) {
        await logCardio(
          account,
          {
            mesocycleId,
            scheduledFor: addDays(startIso, (c.week - 1) * 7 + c.dayOffset),
            type: c.type,
            durationMin: c.durationMin,
          },
          tx,
        );
      }
    }
  }

  // Goals, after the history so their progress reads it.
  for (const g of QA_GOALS) {
    const created = await createGoal(
      account,
      {
        exerciseId: exerciseId[g.ex],
        gymId: g.gym ? gymIds[g.gym] : null,
        targetWeightLbs: g.targetWeightLbs,
        targetReps: g.targetReps,
      },
      now,
      tx,
    );
    if ("then" in g && g.then === "archive") {
      await archiveGoal(account, { goalId: created.id }, now, tx);
    }
  }
}

// Thousands of sequential writes over the hosted pooler: allow ten minutes.
// A timeout rolls the whole transaction back, leaving the account unchanged.
/** The entitlement resolver's comp rule (src/lib/entitlements/resolve.ts compActive). */
function compIsActive(
  e: { startedAt: Date; endsAt: Date | null },
  now: Date,
): boolean {
  return (
    e.startedAt.getTime() <= now.getTime() &&
    (e.endsAt === null || now.getTime() < e.endsAt.getTime())
  );
}

const TX_OPTIONS = { timeout: 600_000, maxWait: 20_000 } as const;

export type QaWriteResult = {
  anchorIso: string;
  deleted: QaCounts | null;
  created: QaCounts;
};

/**
 * SEED: write the baseline into the designated account, which must hold no
 * training data. Refuses (writing nothing) otherwise; use reset instead.
 */
export async function executeQaSeed(
  account: Account,
  target: { email: string },
  opts: QaWriteOptions = {},
): Promise<QaWriteResult> {
  assertQaTestEmail(target.email);
  const acting = inFixtureZone(account);
  const anchorIso = opts.anchorIso ?? todayIso(QA_TIME_ZONE);
  const now = opts.now ?? new Date();
  let created: QaCounts | undefined;
  await account.db.$transaction(async (tx) => {
    const counts = await countsOf(tx);
    if (total(counts) !== 0) {
      throw new QaFixtureRefused(
        "Refusing: the account already holds training data. Seed writes only into an empty account; use reset to restore the baseline.",
      );
    }
    await writeBaseline(acting, tx, anchorIso, now);
    created = await countsOf(tx);
  }, TX_OPTIONS);
  return { anchorIso, deleted: null, created: created! };
}

/**
 * RESET: delete the designated account's training rows and write the baseline,
 * in ONE transaction. Any failure rolls back everything: the account is left
 * exactly as it was.
 */
export async function executeQaReset(
  account: Account,
  target: { email: string },
  opts: QaWriteOptions = {},
): Promise<QaWriteResult> {
  assertQaTestEmail(target.email);
  const acting = inFixtureZone(account);
  const anchorIso = opts.anchorIso ?? todayIso(QA_TIME_ZONE);
  const now = opts.now ?? new Date();
  let deleted: QaCounts | null = null;
  let created: QaCounts | undefined;
  await account.db.$transaction(async (tx) => {
    const blocking = await tx.importSession.count({
      where: { mesocycleId: { not: null } },
    });
    if (blocking > 0) {
      throw new QaFixtureRefused(
        `Refusing: ${blocking} plan-import session(s) on this account point at a mesocycle, so the blocks cannot be removed. Plan-import data is preserved by design; clear it with the plan-import cleanup tool first. Nothing was changed.`,
      );
    }
    deleted = await countsOf(tx);
    // The deletion module's own removal steps (one definition), scoped to
    // this account, for the training models only.
    for (const model of QA_RESET_MODELS)
      await ACCOUNT_DELETION_STEPS[model](tx);
    if (opts.afterDelete) await opts.afterDelete(tx);
    await writeBaseline(acting, tx, anchorIso, now);
    created = await countsOf(tx);
  }, TX_OPTIONS);
  return { anchorIso, deleted, created: created! };
}

// ---------------------------------------------------------------------------
// Verification (read-only) and the deterministic fingerprint.
// ---------------------------------------------------------------------------

export type QaCheck = { name: string; ok: boolean; detail?: string };

export type QaVerification = {
  /** "baseline": matches; "stale": matches but anchored on an earlier day; "drifted": differs. */
  status: "baseline" | "stale" | "drifted" | "empty";
  anchorIso: string | null;
  todayIso: string;
  counts: QaCounts;
  expected: QaCounts;
  checks: QaCheck[];
};

/** Reads the account and reports whether it holds the baseline. Writes nothing. */
export async function verifyQaFixture(
  account: Account,
  now: Date = new Date(),
): Promise<QaVerification> {
  const db = account.db;
  const counts = await countsOf(db);
  const expected = expectedCounts();
  const today = todayIso(QA_TIME_ZONE, now);
  if (total(counts) === 0) {
    return {
      status: "empty",
      anchorIso: null,
      todayIso: today,
      counts,
      expected,
      checks: [],
    };
  }
  const checks: QaCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, ...(detail && !ok ? { detail } : {}) });

  for (const key of Object.keys(expected) as (keyof QaCounts)[]) {
    check(
      `${key} = ${expected[key]}`,
      counts[key] === expected[key],
      `found ${counts[key]}`,
    );
  }

  const active = await db.mesocycle.findFirst({
    where: { status: "active" },
    select: { id: true, name: true, startDate: true },
  });
  const activeName = QA_BLOCKS[QA_BLOCKS.length - 1].name;
  check(
    `active block is "${activeName}"`,
    active?.name === activeName,
    active ? `found "${active.name}"` : "no active block",
  );
  const startIso = active?.startDate?.toISOString().slice(0, 10) ?? null;
  const anchorIso = startIso
    ? addDays(startIso, ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR)
    : null;

  const profile = await db.profile.findUnique({
    where: { userId: account.userId },
    select: {
      firstName: true,
      lastName: true,
      timeZone: true,
      appearance: true,
    },
  });
  check(
    `time zone is ${QA_TIME_ZONE}`,
    profile?.timeZone === QA_TIME_ZONE,
    `found ${profile?.timeZone}`,
  );
  check(
    `name is ${QA_PROFILE.firstName} ${QA_PROFILE.lastName}`,
    profile?.firstName === QA_PROFILE.firstName &&
      profile?.lastName === QA_PROFILE.lastName,
  );
  const tour = await db.tourProgress.findUnique({
    where: { userId: account.userId },
    select: { outcome: true },
  });
  check("onboarding tour finished", tour?.outcome === "completed");
  const seen = await db.releaseSeen.findUnique({
    where: { userId: account.userId },
    select: { lastSeenReleaseId: true },
  });
  check(
    "What's New caught up",
    seen?.lastSeenReleaseId === orderedReleaseNotes()[0].id,
  );
  const comps = await db.entitlement.findMany({
    where: { source: "comp", revokedAt: null },
    select: { startedAt: true, endsAt: true },
  });
  const activeComps = comps.filter((e) => compIsActive(e, now)).length;
  check(
    "comp Pro is active",
    activeComps === 1,
    `found ${activeComps} active comp(s)`,
  );

  if (anchorIso) {
    const anchorWorkout = await db.loggedSession.count({
      where: { scheduledFor: new Date(`${anchorIso}T00:00:00.000Z`) },
    });
    check(
      "the anchor day's Upper A is not yet logged",
      anchorWorkout === 0,
      "a workout was started on the anchor day",
    );
  }
  const goals = await db.goal.findMany({
    select: { status: true, archiveReason: true },
  });
  const state = (s: string, r: string | null) =>
    goals.filter((g) => g.status === s && g.archiveReason === r).length;
  check("goals: 2 active", state("active", null) === 2);
  check("goals: 1 reached", state("archived", "completed") === 1);
  check("goals: 1 archived by hand", state("archived", "manual") === 1);
  const skipped = await db.missedDayResolution.count({
    where: { outcome: "skipped" },
  });
  check("one missed day resolved as skipped", skipped === 1);

  // Values, not just counts: each fingerprint section against the committed
  // baseline (an edited set, goal, gym, or preference shows up here).
  if (active) {
    const hashes = fingerprintHashes(await qaFingerprint(account));
    for (const section of Object.keys(QA_BASELINE_HASHES)) {
      check(
        `values: ${section} match the ${QA_FIXTURE_VERSION} baseline`,
        hashes[section] === QA_BASELINE_HASHES[section],
        "changed since the last reset",
      );
    }
  }

  const matches = checks.every((c) => c.ok);
  return {
    status: !matches ? "drifted" : anchorIso === today ? "baseline" : "stale",
    anchorIso,
    todayIso: today,
    counts,
    expected,
    checks,
  };
}

const exerciseKey = (e: { name: string; sourceId: string | null }) =>
  e.sourceId ?? e.name;

/** Replaces every `{ name, sourceId }` exercise object with its stable key. */
function keyExercises(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keyExercises);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    if (keys.length === 2 && keys[0] === "name" && keys[1] === "sourceId") {
      return exerciseKey(o as { name: string; sourceId: string | null });
    }
    return Object.fromEntries(keys.map((k) => [k, keyExercises(o[k])]));
  }
  return value;
}

/** One SHA-256 per fingerprint section, over canonical (key-sorted) JSON. */
export function fingerprintHashes(
  fingerprint: Record<string, unknown>,
): Record<string, string> {
  const canonical = (v: unknown): string =>
    JSON.stringify(v, (_k, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, (x as Record<string, unknown>)[k]]),
          )
        : x,
    );
  return Object.fromEntries(
    Object.keys(fingerprint)
      .sort()
      .map((k) => [
        k,
        createHash("sha256").update(canonical(fingerprint[k])).digest("hex"),
      ]),
  );
}

/**
 * A canonical, id-free projection of everything the fixture writes, with every
 * date expressed relative to the anchor. Two resets — on the same day or on
 * different days — produce the same fingerprint. Used by the tests.
 */
export async function qaFingerprint(
  account: Account,
): Promise<Record<string, unknown>> {
  const db = account.db;
  const active = await db.mesocycle.findFirst({
    where: { status: "active" },
    select: { startDate: true },
  });
  const anchor = addDays(
    active!.startDate!.toISOString().slice(0, 10),
    ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR,
  );
  const dayMs = 86_400_000;
  const rel = (d: Date | null) =>
    d === null
      ? null
      : Math.round(
          (d.getTime() - new Date(`${anchor}T00:00:00.000Z`).getTime()) / dayMs,
        );
  // Weekdays relative to the anchor's, so a reset on another day matches.
  const relDay = (dow: number | null) =>
    dow === null ? null : (((dow - isoWeekday(anchor)) % 7) + 7) % 7;
  const name = { select: { name: true } } as const;
  // Exercises by their stable library source id (custom ones by name), so the
  // fingerprint does not depend on how a catalog import spelled a name.
  const ex = { select: { name: true, sourceId: true } } as const;
  const sortBy = <T>(rows: T[]) =>
    rows
      .map((r) => JSON.stringify(r))
      .sort()
      .map((s) => JSON.parse(s) as unknown);

  const [profile, tour, gyms, custom, favorites, mesocycles, cardioPlan] =
    await Promise.all([
      db.profile.findUnique({
        where: { userId: account.userId },
        select: {
          firstName: true,
          lastName: true,
          timeZone: true,
          appearance: true,
        },
      }),
      db.tourProgress.findUnique({
        where: { userId: account.userId },
        select: { outcome: true },
      }),
      db.gym.findMany({ select: { name: true, address: true } }),
      db.exercise.findMany({
        where: { isCustom: true },
        select: { name: true, primaryMuscle: true, equipmentType: true },
      }),
      db.exerciseFavorite.findMany({ select: { exercise: ex } }),
      db.mesocycle.findMany({
        select: {
          name: true,
          status: true,
          startDate: true,
          lengthWeeks: true,
          deloadEveryWeeks: true,
          sessions: {
            select: {
              name: true,
              dayOfWeek: true,
              sessionExercises: {
                select: {
                  position: true,
                  plannedSets: true,
                  targetRepMin: true,
                  targetRepMax: true,
                  exercise: ex,
                },
              },
            },
          },
        },
      }),
      db.plannedCardio.findMany({
        select: { dayOfWeek: true, type: true, durationMin: true },
      }),
    ]);
  const [logged, baselines, resolutions, cardio, goals] = await Promise.all([
    db.loggedSession.findMany({
      select: {
        scheduledFor: true,
        status: true,
        session: name,
        loggedExercises: {
          select: {
            position: true,
            plannedSets: true,
            skippedAt: true,
            exercise: ex,
            gym: name,
            sets: {
              select: {
                setNumber: true,
                weightLbs: true,
                reps: true,
                rir: true,
              },
            },
          },
        },
      },
    }),
    db.gymExerciseBaseline.findMany({
      select: { weightLbs: true, gym: name, exercise: ex },
    }),
    db.missedDayResolution.findMany({
      select: { missedOn: true, outcome: true },
    }),
    db.cardioLog.findMany({
      select: { scheduledFor: true, type: true, durationMin: true },
    }),
    db.goal.findMany({
      select: {
        targetWeightLbs: true,
        targetReps: true,
        status: true,
        archiveReason: true,
        exercise: ex,
        gym: name,
      },
    }),
  ]);

  return keyExercises({
    version: QA_FIXTURE_VERSION,
    profile,
    tour,
    gyms: sortBy(gyms),
    custom: sortBy(custom),
    favorites: sortBy(favorites.map((f) => exerciseKey(f.exercise))),
    mesocycles: sortBy(
      mesocycles.map((m) => ({
        ...m,
        startDate: rel(m.startDate),
        sessions: sortBy(
          m.sessions.map((s) => ({
            ...s,
            dayOfWeek: relDay(s.dayOfWeek),
            sessionExercises: sortBy(s.sessionExercises),
          })),
        ),
      })),
    ),
    cardioPlan: sortBy(
      cardioPlan.map((c) => ({ ...c, dayOfWeek: relDay(c.dayOfWeek) })),
    ),
    logged: sortBy(
      logged.map((l) => ({
        ...l,
        scheduledFor: rel(l.scheduledFor),
        loggedExercises: sortBy(
          l.loggedExercises.map((e) => ({
            ...e,
            skippedAt: e.skippedAt !== null,
            sets: sortBy(
              e.sets.map((s) => ({
                ...s,
                weightLbs: s.weightLbs === null ? null : Number(s.weightLbs),
              })),
            ),
          })),
        ),
      })),
    ),
    baselines: sortBy(
      baselines.map((b) => ({ ...b, weightLbs: Number(b.weightLbs) })),
    ),
    resolutions: sortBy(
      resolutions.map((r) => ({ ...r, missedOn: rel(r.missedOn) })),
    ),
    cardio: sortBy(
      cardio.map((c) => ({ ...c, scheduledFor: rel(c.scheduledFor) })),
    ),
    goals: sortBy(
      goals.map((g) => ({ ...g, targetWeightLbs: Number(g.targetWeightLbs) })),
    ),
  }) as Record<string, unknown>;
}

/** Plain-text report lines for the CLI. */
export function formatCounts(
  label: string,
  counts: QaCounts,
  expected?: QaCounts,
): string {
  const lines = [label];
  for (const key of Object.keys(counts) as (keyof QaCounts)[]) {
    lines.push(
      `  ${key.padEnd(22)}${String(counts[key]).padStart(5)}${expected ? `   (baseline ${expected[key]})` : ""}`,
    );
  }
  return lines.join("\n");
}

export { QA_SKIPPED };
