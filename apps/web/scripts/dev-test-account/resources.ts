/**
 * Pitch 21h (spec §11, RD-24): apply a resource plan to a seeded test account
 * and read it back. Every row goes through the app's own write modules —
 * createCustomExercise, setExerciseFavorite, archiveExercise, createGym,
 * archiveGym, swapExercise, logSet, completeWorkout — on the account's scoped
 * client, in ONE transaction: a failure leaves nothing partial. Nothing is
 * inserted any other way, and nothing is deleted.
 */
import type { Account } from "@/lib/data/account";
import {
  archiveExercise,
  createCustomExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import { listExercises } from "@/lib/exercises/queries";
import { archiveGym, createGym } from "@/lib/gyms/gyms";
import { listActiveGyms } from "@/lib/gyms/queries";
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, swapExercise } from "@/lib/logging/sessions";
import { getPlanOverview } from "@/lib/views/plan";
import { archiveGoal, createGoal } from "@/lib/goals/goals";
import { listActiveGoals, listGoalHistory } from "@/lib/goals/queries";
import { editLoggedSet } from "@/lib/logging/logged-sets";
import { getThisWeek } from "@/lib/logging/this-week";
import { DEMO_LIBRARY, VARIANT_LIBRARY } from "../demo/fixture";
import type { ResourcePlan } from "./resource-plans";

const LIBRARY: Record<string, string> = { ...DEMO_LIBRARY, ...VARIANT_LIBRARY };

/** A one-transaction budget, generous for a remote dev database. */
const TRANSACTION_TIMEOUT_MS = 120_000;

export async function applyResources(
  account: Account,
  plan: ResourcePlan,
): Promise<{ created: string[] }> {
  const created: string[] = [];
  await account.db.$transaction(
    async (tx) => {
      const libraryId = async (key: string) => {
        const row = await tx.exercise.findFirst({
          where: { sourceId: LIBRARY[key], isCustom: false, deletedAt: null },
          select: { id: true },
        });
        if (!row) throw new Error(`The library has no ${key} exercise.`);
        return row.id;
      };

      const customIds = new Map<string, string>();
      for (const c of plan.customExercises ?? []) {
        const row = await createCustomExercise(
          account,
          {
            name: c.name,
            primaryMuscle: c.primaryMuscle,
            equipmentType: c.equipmentType,
            secondaryMuscles: c.secondaryMuscles ?? [],
          },
          tx,
        );
        customIds.set(c.name, row.id);
        created.push(`custom exercise "${c.name}"`);
        if (c.favorite) {
          await setExerciseFavorite(
            account,
            { exerciseId: row.id, isFavorite: true },
            tx,
          );
        }
      }
      for (const key of plan.favorites ?? []) {
        await setExerciseFavorite(
          account,
          { exerciseId: await libraryId(key), isFavorite: true },
          tx,
        );
        created.push(`favorite ${key}`);
      }
      for (const g of plan.gyms ?? []) {
        await createGym(
          account,
          { name: g.name, address: g.address ?? null },
          tx,
        );
        created.push(`gym "${g.name}"`);
      }

      // Pitch 21i: RIR on the most recent finished sessions of one lift,
      // through the History correction path; weights and reps unchanged.
      if (plan.rir) {
        const exerciseId = await libraryId(plan.rir.ex);
        const recent = await tx.loggedExercise.findMany({
          where: { exerciseId, loggedSession: { status: "complete" } },
          orderBy: { loggedSession: { scheduledFor: "desc" } },
          take: plan.rir.sessions,
          select: {
            sets: {
              orderBy: { setNumber: "asc" },
              select: { id: true, weightLbs: true, reps: true },
            },
          },
        });
        for (const le of recent) {
          for (const [i, set] of le.sets.entries()) {
            const rir = plan.rir.values[i];
            if (rir === undefined) continue;
            await editLoggedSet(
              account,
              {
                loggedSetId: set.id,
                weightLbs:
                  set.weightLbs === null ? null : Number(set.weightLbs),
                reps: set.reps,
                rir,
              },
              tx,
            );
          }
        }
        created.push(
          `RIR on the last ${recent.length} ${plan.rir.ex} sessions`,
        );
      }

      // Pitch 21i: goals through the one create (completion as the app does it).
      for (const g of plan.goals ?? []) {
        const gym = g.gym
          ? await tx.gym.findFirst({
              where: { name: g.gym, deletedAt: null },
              select: { id: true },
            })
          : null;
        if (g.gym && !gym) throw new Error(`No gym named ${g.gym}.`);
        const goal = await createGoal(
          account,
          {
            exerciseId: await libraryId(g.ex),
            gymId: gym?.id ?? null,
            targetWeightLbs: String(g.weightLbs),
            targetReps: String(g.reps),
          },
          new Date(),
          tx,
        );
        if (g.archive)
          await archiveGoal(account, { goalId: goal.id }, new Date(), tx);
        created.push(
          `goal ${g.ex} ${g.weightLbs} × ${g.reps}${g.gym ? ` at ${g.gym}` : ""} (${g.archive ? "archived" : goal.outcome})`,
        );
      }

      const finish = plan.finishWithCustom;
      if (finish) {
        const open = await tx.loggedSession.findFirst({
          where: { status: "in_progress" },
          orderBy: { scheduledFor: "asc" },
          select: { id: true },
        });
        if (!open) throw new Error("No in-progress workout to finish.");
        const le = await tx.loggedExercise.findFirst({
          where: {
            loggedSessionId: open.id,
            exerciseId: await libraryId(finish.replace),
          },
          select: { id: true },
        });
        const customId = customIds.get(finish.custom);
        if (!le || !customId) throw new Error("Nothing to swap.");
        await swapExercise(
          account,
          { loggedExerciseId: le.id, newExerciseId: customId },
          tx,
        );
        let setNumber = 1;
        for (const [weightLbs, reps] of finish.sets) {
          await logSet(
            account,
            {
              loggedExerciseId: le.id,
              setNumber: setNumber++,
              weightLbs,
              reps,
            },
            tx,
          );
        }
        await completeWorkout(account, { loggedSessionId: open.id }, tx);
        created.push(`finished workout performing "${finish.custom}"`);
      }

      // Archived last: an archived exercise can't be swapped in or starred.
      for (const c of plan.customExercises ?? []) {
        if (!c.archived) continue;
        await archiveExercise(
          account,
          { exerciseId: customIds.get(c.name)! },
          tx,
        );
        created.push(`archived "${c.name}"`);
      }
      for (const name of plan.archiveGyms ?? []) {
        const gym = await tx.gym.findFirst({
          where: { name, deletedAt: null },
          select: { id: true },
        });
        if (!gym) throw new Error(`No gym named ${name} to archive.`);
        await archiveGym(account, { gymId: gym.id }, tx);
        created.push(`archived gym "${name}"`);
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS },
  );
  return { created };
}

export type ResourceReport = { lines: string[]; problems: string[] };

/**
 * What the app's own reads now say — the plan view, the library (favorites
 * and own exercises), the gym list, and a finished workout's performed
 * exercise — compared with the plan. Read-only.
 */
export async function resourceReport(
  account: Account,
  plan: ResourcePlan | null,
): Promise<ResourceReport> {
  const lines: string[] = [];
  const problems: string[] = [];

  const overview = await getPlanOverview(account);
  const block = overview.block;
  if (block) {
    const p = block.position;
    lines.push(
      `  Plan:      ${block.summary.name}, ${p.kind === "running" ? `week ${p.week} of ${block.summary.lengthWeeks}${p.scheduledDeloadWeek ? " (deload week)" : ""}` : p.kind}, deload weeks ${block.deloadWeeks.join(", ") || "none"}`,
    );
  } else {
    lines.push(
      `  Plan:      no active plan (${overview.otherBlocks.drafts} drafts, ${overview.otherBlocks.previous} earlier blocks)`,
    );
  }

  const favorites = await listExercises(account, {
    view: "favorites",
    limit: 1000,
  });
  lines.push(
    `  Favorites: ${favorites.items.map((e) => e.name).join(", ") || "none"}`,
  );
  const own = await account.db.exercise.findMany({
    where: { isCustom: true },
    select: { id: true, name: true, deletedAt: true },
    orderBy: { name: "asc" },
  });
  lines.push(
    `  Own:       ${own.map((e) => `${e.name}${e.deletedAt ? " (archived)" : ""}`).join(", ") || "none"}`,
  );
  const gyms = await listActiveGyms(account);
  lines.push(
    `  Gyms:      ${gyms.map((g) => (g.address ? `${g.name} (${g.address})` : g.name)).join(", ") || "none"}`,
  );
  // Pitch 21i and OVE-241: goals and this week, as the app reads them.
  const [activeGoals, goalHistory, week] = await Promise.all([
    listActiveGoals(account),
    listGoalHistory(account),
    getThisWeek(account),
  ]);
  lines.push(
    `  Goals:     ${activeGoals.map((g) => `${g.exerciseName}${g.gymName ? ` @ ${g.gymName}` : ""} ${g.targetLabel} ${g.percent === null ? "(no performance yet)" : `${g.percent}%`}`).join("; ") || "none active"}`,
  );
  if (goalHistory.length > 0) {
    lines.push(
      `  History:   ${goalHistory.map((g) => `${g.exerciseName} ${g.targetLabel} (${g.outcome === "completed" ? "reached" : "archived"})`).join("; ")}`,
    );
  }
  if (week) {
    lines.push(
      `  This week: ${week.days.map((d) => `${d.weekday} ${d.workout ? `${d.workout.sessionName}${d.workout.adjustable ? "" : ` (${d.workout.state})`}` : "rest"}`).join(" · ")}${week.blockedReason ? ` — ${week.blockedReason}` : ""}`,
    );
  }
  if (!plan) return { lines, problems };

  for (const g of plan.goals ?? []) {
    const found =
      activeGoals.some(
        (x) => x.targetWeightLbs === g.weightLbs && x.targetReps === g.reps,
      ) ||
      goalHistory.some(
        (x) => x.targetWeightLbs === g.weightLbs && x.targetReps === g.reps,
      );
    if (!found)
      problems.push(`goal ${g.ex} ${g.weightLbs} × ${g.reps} is missing`);
  }

  const favNames = new Set(favorites.items.map((e) => e.name));
  for (const c of plan.customExercises ?? []) {
    const row = own.find((e) => e.name === c.name);
    if (!row) {
      problems.push(`own exercise "${c.name}" is missing`);
      continue;
    }
    if (Boolean(row.deletedAt) !== Boolean(c.archived)) {
      problems.push(
        `"${c.name}" should ${c.archived ? "" : "not "}be archived`,
      );
    }
    if (c.favorite && !favNames.has(c.name)) {
      problems.push(`"${c.name}" should be a favorite`);
    }
  }
  const wantFavorites =
    (plan.favorites?.length ?? 0) +
    (plan.customExercises ?? []).filter((c) => c.favorite).length;
  if (favorites.items.length !== wantFavorites) {
    problems.push(
      `expected ${wantFavorites} favorites, the library says ${favorites.items.length}`,
    );
  }
  for (const g of plan.gyms ?? []) {
    if (!gyms.some((x) => x.name === g.name)) {
      problems.push(`gym "${g.name}" is not in the gym list`);
    }
  }
  for (const name of plan.archiveGyms ?? []) {
    if (gyms.some((x) => x.name === name)) {
      problems.push(`gym "${name}" should be archived`);
    }
  }
  const finish = plan.finishWithCustom;
  if (finish) {
    const custom = own.find((e) => e.name === finish.custom);
    const performed = custom
      ? await account.db.loggedExercise.findFirst({
          where: {
            exerciseId: custom.id,
            loggedSession: { status: "complete" },
          },
          select: { _count: { select: { sets: true } } },
        })
      : null;
    if (!performed || performed._count.sets !== finish.sets.length) {
      problems.push(
        `a finished workout should hold "${finish.custom}" with ${finish.sets.length} sets`,
      );
    } else {
      lines.push(
        `  History:   a finished workout performed "${finish.custom}" (${finish.sets.length} sets)`,
      );
    }
  }
  return { lines, problems };
}
