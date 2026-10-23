import {
  getAdminAccount,
  listAccounts,
  suspendAccount,
} from "@/lib/data/admin/accounts";
import { listAudit } from "@/lib/data/admin/audit-read";
import { getAdminOverview } from "@/lib/data/admin/metrics";
import { adminActorFor } from "@/lib/data/admin/identity";
import type { Account } from "@/lib/data/account";
import { addSessionExercise } from "@/lib/plan/sessions";
import { createGoal } from "@/lib/goals/goals";
import { logSet } from "@/lib/logging/logged-sets";
import { logCardio } from "@/lib/cardio/cardio-logs";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import { activePlan, library, startToday, today } from "./isolation/fixtures";

/**
 * THE ADMIN PRIVACY SENTINEL (Admin Center & Feedback, spec §6.5, §14.2;
 * R2). Two accounts with every kind of training content, each carrying
 * unique marker strings and numbers; then every admin read the owner can make
 * is serialized and searched. Not one marker may appear: the boundary holds
 * in the server's response itself, not just on screen.
 */

const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad03";
const saved = process.env.OVERLOAD_ADMIN_USER_IDS;
beforeAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN_ID;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = saved;
});

const MARKERS = [
  "SENTINEL-MESO",
  "SENTINEL-SESSION",
  "SENTINEL-LIFT",
  "SENTINEL-GYM",
  "SENTINEL-ADDRESS",
  "SENTINEL-CARDIO",
  "987.5",
  "912.5",
  "987,5",
];

type Lib = Awaited<ReturnType<typeof library>>;

async function trainingFor(account: Account, lib: Lib, label: string) {
  const plan = await activePlan(account, lib, `SENTINEL-${label}`);
  const p = getTestPrisma();
  await p.mesocycle.update({
    where: { id: plan.meso.id },
    data: { name: `SENTINEL-MESO ${label}` },
  });
  await p.session.update({
    where: { id: plan.session.id },
    data: { name: `SENTINEL-SESSION ${label}` },
  });
  await p.exercise.update({
    where: { id: plan.custom.id },
    data: { name: `SENTINEL-LIFT ${label}` },
  });
  await p.gym.update({
    where: { id: plan.gym.id },
    data: { name: `SENTINEL-GYM ${label}`, address: "SENTINEL-ADDRESS" },
  });
  await addSessionExercise(account, {
    sessionId: plan.session.id,
    exerciseId: plan.custom.id,
    plannedSets: "1",
    targetRepMin: "10",
    targetRepMax: "13",
  });
  const { les } = await startToday(account, plan);
  for (const le of les) {
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 987.5,
      reps: 13,
    });
  }
  await createGoal(account, {
    exerciseId: lib.bench.id,
    targetWeightLbs: 912.5,
    targetReps: 1,
  });
  await logCardio(account, {
    mesocycleId: plan.meso.id,
    scheduledFor: today(),
    type: "SENTINEL-CARDIO",
    durationMin: "41",
  });
  await account.db.feedback.create({
    data: { userId: account.userId, category: "bug", message: "Plain words." },
  });
}

it("no admin read returns any training content", async () => {
  const admin = await createTestAccount("UTC", ADMIN_ID);
  const a = await createTestAccount();
  const b = await createTestAccount();
  const lib = await library();
  await trainingFor(a, lib, "A");
  await trainingFor(b, lib, "B");
  const actor = adminActorFor(admin.userId, "UTC");
  await suspendAccount(actor, b.userId);
  const emails = async () =>
    new Map([
      [a.userId, "a@example.test"],
      [b.userId, "b@example.test"],
    ]);

  const responses = {
    overview: await getAdminOverview(actor),
    directory: await listAccounts(actor, {}, emails),
    search: await listAccounts(actor, { q: "SENTINEL" }, emails),
    accountA: await getAdminAccount(actor, a.userId, emails),
    accountB: await getAdminAccount(actor, b.userId, emails),
    audit: await listAudit(actor, {}, emails),
    auditB: await listAudit(actor, { account: b.userId }, emails),
  };
  const json = JSON.stringify(responses);
  for (const marker of MARKERS) {
    expect([marker, json.includes(marker)]).toEqual([marker, false]);
  }
  // Searching for training text finds nothing: it is not searchable.
  expect(responses.search.rows).toEqual([]);
  // And the counts are still right without it.
  expect(responses.overview).toMatchObject({
    registered: 3,
    withPlan: 2,
    loggedWorkout: 2,
    suspended: 1,
  });
  expect(responses.accountA?.feedbackCount).toBe(1);
  expect(responses.accountA).not.toHaveProperty("mesocycles");
});
