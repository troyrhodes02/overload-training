import type { Prisma } from "@prisma/client";
import {
  addDays,
  isoWeekday,
  mesocycleWeekForDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/plan/calendar";
import { loadScheduleContext } from "@/lib/logging/schedule-context";
import { cardioWeekOccurrences } from "@/lib/cardio/schedule";
import { applyBaselineOnCompletion } from "@/lib/gyms/baselines";
import { reconcileGoalCompletions } from "@/lib/goals/goals";
import { stableId } from "./determinism";
import { LIBRARY, type ExerciseKey, type ScenarioFacts } from "./spec";

/**
 * Writes a scenario's FACTS into the (already reset) local database, inside
 * the caller's transaction. Dev tooling only — never imported by `src/`.
 *
 * Why this is not a second application write path: it runs only from the
 * scenario CLI (behind the loopback-only target guard) and only to construct
 * historical fixtures. Historical rows need historical timestamps (a set
 * logged three months ago has a three-month-old `createdAt`, which the
 * "latest working weight" read relies on), which the live write path —
 * correctly — stamps with "now". So history is inserted as the facts it is,
 * and everything DERIVED from it is produced by the application's own code
 * while it is written:
 *
 *  - Gym baselines: `applyBaselineOnCompletion` (src/lib/gyms/baselines.ts),
 *    called in chronological order exactly as the logging transaction calls
 *    it, so establishment/correction follows the shipped rule per gym.
 *  - Cardio placement and plan snapshot: `cardioWeekOccurrences` over the real
 *    effective schedule (`loadScheduleContext`).
 *  - Goal completion: `reconcileGoalCompletions`, the one completion engine.
 *
 * Nothing here writes a progression tag, e1RM, trend, or goal percentage —
 * no such column exists, and the application derives them on read.
 */

type Tx = Prisma.TransactionClient;

export type WrittenIds = {
  exercises: Record<ExerciseKey, string>;
  gyms: Record<string, string>;
  mesocycles: Record<string, string>;
  goals: Record<string, string>;
};

/** A UTC timestamp on a calendar date ("2026-10-12", "17:30"). */
function at(iso: string, hhmm: string): Date {
  return new Date(`${iso}T${hhmm}:00.000Z`);
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dateOf(iso: string): Date {
  const d = parseIsoDate(iso);
  if (!d) throw new Error(`Scenario fact has an invalid date: ${iso}`);
  return d;
}

/** Library exercises by stable source id; refuses missing or archived ones. */
async function resolveExercises(
  tx: Tx,
  needed: Set<ExerciseKey>,
): Promise<Record<ExerciseKey, string>> {
  const sourceIds = [...needed].map((k) => LIBRARY[k]);
  const rows = await tx.exercise.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { id: true, sourceId: true, name: true, deletedAt: true },
  });
  const out = {} as Record<ExerciseKey, string>;
  const problems: string[] = [];
  for (const key of needed) {
    const row = rows.find((r) => r.sourceId === LIBRARY[key]);
    if (!row) {
      problems.push(
        `${LIBRARY[key]} is not in the exercise library (run \`npm run db:seed\` to import it)`,
      );
    } else if (row.deletedAt) {
      problems.push(
        `${row.name} is archived in the library; un-archive it in Exercises first`,
      );
    } else {
      out[key] = row.id;
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Scenario needs library exercises that aren't available:\n  - ${problems.join("\n  - ")}`,
    );
  }
  return out;
}

export async function writeScenarioFacts(
  tx: Tx,
  facts: ScenarioFacts,
  scope: { scenario: string; anchorIso: string },
): Promise<WrittenIds> {
  const id = (...parts: string[]) =>
    stableId(scope.scenario, scope.anchorIso, ...parts);

  const needed = new Set<ExerciseKey>();
  for (const m of facts.mesocycles)
    for (const s of m.sessions) for (const sl of s.slots) needed.add(sl.ex);
  for (const w of facts.workouts)
    for (const e of w.exercises) if (e.performed) needed.add(e.performed);
  for (const g of facts.goals) needed.add(g.ex);
  const exercises = await resolveExercises(tx, needed);

  // Gyms exist from before the earliest plan.
  const earliest = facts.mesocycles.map((m) => m.startIso).sort()[0] as string;
  const gyms: Record<string, string> = {};
  for (const g of facts.gyms) {
    gyms[g.key] = id("gym", g.key);
    const created = at(addDays(earliest, -10), "12:00");
    await tx.gym.create({
      data: {
        id: gyms[g.key],
        name: g.name,
        address: g.address ?? null,
        deletedAt: g.archivedIso ? at(g.archivedIso, "12:00") : null,
        createdAt: created,
        updatedAt: g.archivedIso ? at(g.archivedIso, "12:00") : created,
      },
    });
  }

  // Plan: mesocycles, sessions on weekdays, planned exercises, planned cardio.
  const mesocycles: Record<string, string> = {};
  const slotIds = new Map<string, string>(); // meso|session|ex → SessionExercise id
  const sessionIds = new Map<string, string>(); // meso|session → Session id
  for (const m of facts.mesocycles) {
    const mesoId = id("meso", m.key);
    mesocycles[m.key] = mesoId;
    const created = at(addDays(m.startIso, -5), "12:00");
    await tx.mesocycle.create({
      data: {
        id: mesoId,
        name: m.name,
        splitType: m.splitType,
        status: m.status,
        startDate: dateOf(m.startIso),
        lengthWeeks: m.lengthWeeks,
        deloadEveryWeeks: m.deloadEveryWeeks,
        createdAt: created,
        updatedAt: created,
      },
    });
    for (const [pos, s] of m.sessions.entries()) {
      const sessionId = id("session", m.key, s.key);
      sessionIds.set(`${m.key}|${s.key}`, sessionId);
      await tx.session.create({
        data: {
          id: sessionId,
          mesocycleId: mesoId,
          name: s.name,
          dayOfWeek: isoWeekday(addDays(m.startIso, s.dayOffset)),
          position: pos,
          createdAt: created,
          updatedAt: created,
        },
      });
      await tx.sessionExercise.createMany({
        data: s.slots.map((sl, i) => {
          const slotId = id("slot", m.key, s.key, sl.ex);
          slotIds.set(`${m.key}|${s.key}|${sl.ex}`, slotId);
          return {
            id: slotId,
            sessionId,
            exerciseId: exercises[sl.ex],
            position: i,
            plannedSets: sl.sets,
            targetRepMin: sl.repMin,
            targetRepMax: sl.repMax,
            createdAt: created,
            updatedAt: created,
          };
        }),
      });
    }
    if (m.cardio?.length) {
      await tx.plannedCardio.createMany({
        data: m.cardio.map((c) => ({
          id: id("planned-cardio", m.key, String(c.dayOffset)),
          mesocycleId: mesoId,
          dayOfWeek: isoWeekday(addDays(m.startIso, c.dayOffset)),
          type: c.type,
          durationMin: c.durationMin,
          createdAt: created,
          updatedAt: created,
        })),
      });
    }
  }

  // Missed-day resolutions (dated facts; recorded the morning after).
  for (const r of facts.resolutions) {
    const m = facts.mesocycles.find((x) => x.key === r.meso);
    if (!m)
      throw new Error(`Resolution references unknown mesocycle ${r.meso}`);
    const session = m.sessions.find(
      (s) =>
        isoWeekday(addDays(m.startIso, s.dayOffset)) === isoWeekday(r.missedOn),
    );
    const created = at(addDays(r.missedOn, 1), "08:00");
    await tx.missedDayResolution.create({
      data: {
        id: id("resolution", r.meso, r.missedOn),
        mesocycleId: mesocycles[r.meso],
        sessionId: session ? sessionIds.get(`${m.key}|${session.key}`) : null,
        missedOn: dateOf(r.missedOn),
        outcome: r.outcome,
        createdAt: created,
        updatedAt: created,
      },
    });
  }

  // Workouts, oldest first, each followed by the real baseline rule.
  const workouts = [...facts.workouts].sort((a, b) =>
    a.scheduledFor === b.scheduledFor
      ? a.session.localeCompare(b.session)
      : a.scheduledFor < b.scheduledFor
        ? -1
        : 1,
  );
  for (const w of workouts) {
    const m = facts.mesocycles.find((x) => x.key === w.meso);
    const s = m?.sessions.find((x) => x.key === w.session);
    if (!m || !s) {
      throw new Error(`Workout references unknown ${w.meso}/${w.session}`);
    }
    const sessionId = sessionIds.get(`${m.key}|${s.key}`) as string;
    const lsId = id("logged-session", w.meso, w.scheduledFor, w.session);
    const started = at(w.scheduledFor, "17:00");
    const completedAt = at(w.scheduledFor, "18:15");
    await tx.loggedSession.create({
      data: {
        id: lsId,
        mesocycleId: mesocycles[w.meso],
        sessionId,
        performedOn: dateOf(w.scheduledFor),
        scheduledFor: dateOf(w.scheduledFor),
        status: "complete",
        completedAt,
        createdAt: started,
        updatedAt: completedAt,
      },
    });
    for (const [i, e] of w.exercises.entries()) {
      const slot = s.slots.find((sl) => sl.ex === e.ex);
      if (!slot) {
        throw new Error(
          `${w.session} on ${w.scheduledFor} has no ${e.ex} slot`,
        );
      }
      if (e.sets.length !== slot.sets) {
        throw new Error(
          `${e.ex} on ${w.scheduledFor} has ${e.sets.length} sets; the plan has ${slot.sets}`,
        );
      }
      const leId = id("logged-exercise", lsId, e.ex);
      const leCreated = minutesAfter(started, i * 12);
      await tx.loggedExercise.create({
        data: {
          id: leId,
          loggedSessionId: lsId,
          exerciseId: exercises[e.performed ?? e.ex],
          plannedExerciseId: exercises[e.ex],
          sessionExerciseId: slotIds.get(`${m.key}|${s.key}|${e.ex}`) ?? null,
          gymId: gyms[w.gym],
          position: i,
          plannedSets: slot.sets,
          targetRepMin: slot.repMin,
          targetRepMax: slot.repMax,
          createdAt: leCreated,
          updatedAt: leCreated,
        },
      });
      await tx.loggedSet.createMany({
        data: e.sets.map((set, k) => {
          const createdAt = minutesAfter(leCreated, (k + 1) * 3);
          return {
            id: id("logged-set", leId, String(k + 1)),
            loggedExerciseId: leId,
            setNumber: k + 1,
            weightLbs: set.weightLbs,
            reps: set.reps,
            createdAt,
            updatedAt: createdAt,
          };
        }),
      });
      // The application's own baseline rule, as the logging transaction runs it.
      await applyBaselineOnCompletion(leId, tx);
    }
  }

  // Cardio logs: placed and snapshotted through the real effective schedule.
  for (const c of facts.cardioLogs) {
    const m = facts.mesocycles.find((x) => x.key === c.meso);
    if (!m)
      throw new Error(`Cardio log references unknown mesocycle ${c.meso}`);
    const meso = await tx.mesocycle.findUniqueOrThrow({
      where: { id: mesocycles[c.meso] },
      include: { sessions: true, plannedCardio: true },
    });
    const ctx = await loadScheduleContext(tx, {
      id: meso.id,
      startDate: meso.startDate as Date,
      lengthWeeks: meso.lengthWeeks,
      sessions: meso.sessions,
    });
    const week = mesocycleWeekForDate(m.startIso, c.scheduledFor) ?? 0;
    const occurrence = cardioWeekOccurrences(
      ctx,
      meso.plannedCardio.map((p) => ({
        id: p.id,
        dayOfWeek: p.dayOfWeek,
        type: p.type,
        durationMin: p.durationMin,
        createdIso: toIsoDate(p.createdAt),
      })),
      week,
    ).find((o) => o.authoredIso === c.scheduledFor);
    if (!occurrence || occurrence.effectiveIso === null) {
      throw new Error(`No planned cardio occurrence on ${c.scheduledFor}`);
    }
    const created = at(occurrence.effectiveIso, "19:00");
    await tx.cardioLog.create({
      data: {
        id: id("cardio-log", c.meso, c.scheduledFor),
        mesocycleId: meso.id,
        scheduledFor: dateOf(c.scheduledFor),
        plannedType: occurrence.type,
        plannedDurationMin: occurrence.durationMin,
        type: c.type,
        durationMin: c.durationMin,
        performedOn: dateOf(occurrence.effectiveIso),
        createdAt: created,
        updatedAt: created,
      },
    });
  }

  // Goals as the lifter set them; completion only by the real engine.
  const goals: Record<string, string> = {};
  for (const g of facts.goals) {
    goals[g.key] = id("goal", g.key);
    const created = at(g.createdIso, "20:00");
    await tx.goal.create({
      data: {
        id: goals[g.key],
        exerciseId: exercises[g.ex],
        gymId: g.gym ? gyms[g.gym] : null,
        targetWeightLbs: g.targetWeightLbs,
        targetReps: g.targetReps,
        status: "active",
        createdAt: created,
        updatedAt: created,
      },
    });
    if (g.reconcileOn) {
      const now = at(g.reconcileOn, "18:30");
      const completed = await reconcileGoalCompletions(
        { goalIds: [goals[g.key]], now },
        tx,
      );
      if (!completed.includes(goals[g.key])) {
        throw new Error(
          `Goal ${g.key} was meant to be reached by ${g.reconcileOn}, but the history doesn't reach it.`,
        );
      }
      // The lifter dismissed the "Goal reached" card that evening.
      const acknowledged = minutesAfter(now, 90);
      await tx.goal.update({
        where: { id: goals[g.key] },
        data: {
          completionAcknowledgedAt: acknowledged,
          updatedAt: acknowledged,
        },
      });
    }
  }

  return { exercises, gyms, mesocycles, goals };
}
