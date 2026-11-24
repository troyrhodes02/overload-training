/**
 * OVE-241 — Native Weekly Scheduling Parity: the three mobile endpoints end
 * to end through the route handlers (chore spec §4). Only Supabase Auth is
 * replaced: an opaque token "t.<userId>.s" verifies as that user. The rules
 * are the released OVE-240 modules, unchanged; this proves the phone reaches
 * them with the same answers as the web. Blocks start relative to the real
 * today (UTC accounts), so day k of this week is today + k.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { GET as thisWeekRoute } from "@/app/api/mobile/v1/this-week/route";
import { POST as skipRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/schedule/skip/route";
import { POST as moveRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/schedule/move/route";
import { POST as startWorkoutRoute } from "@/app/api/mobile/v1/workouts/route";
import { GET as todayRoute } from "@/app/api/mobile/v1/today/route";
import { createGym } from "@/lib/gyms/gyms";
import { getThisWeek } from "@/lib/logging/this-week";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { ThisWeekDto } from "@overload/shared/contracts/schedule";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const p = () => getTestPrisma();
const today = () => todayIso("UTC");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function call(
  handler: unknown,
  account: Account,
  opts: {
    json?: unknown;
    params?: Record<string, string>;
    query?: string;
  } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
  });
  const body = opts.json === undefined ? undefined : JSON.stringify(opts.json);
  if (body !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request(
      `http://localhost/api/mobile/v1/x${opts.query ? `?${opts.query}` : ""}`,
      { method: body === undefined ? "GET" : "POST", headers, body },
    ),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, text, body: text ? JSON.parse(text) : null };
}

/** An active 4-week block starting `startOffset` days from today. */
async function weekPlan(
  account: Account,
  sessions: { name: string; offset: number }[],
  startOffset = 0,
) {
  const exercise = await p().exercise.create({
    data: {
      name: `Bench ${randomUUID().slice(0, 6)}`,
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
  const meso = await p().mesocycle.create({
    data: {
      userId: account.userId,
      name: "Week Block",
      lengthWeeks: 4,
      deloadEveryWeeks: 4,
      splitType: "custom",
      status: "active",
      startDate: d(addDays(today(), startOffset)),
    },
  });
  const s: Record<string, { id: string; authored: string; dayOfWeek: number }> =
    {};
  for (const x of sessions) {
    const authored = addDays(today(), x.offset);
    const row = await p().session.create({
      data: {
        userId: account.userId,
        mesocycleId: meso.id,
        name: x.name,
        dayOfWeek: isoWeekday(authored),
      },
    });
    await p().sessionExercise.create({
      data: {
        userId: account.userId,
        sessionId: row.id,
        exerciseId: exercise.id,
        position: 0,
        plannedSets: 1,
        targetRepMin: 5,
        targetRepMax: 8,
      },
    });
    s[x.name] = { id: row.id, authored, dayOfWeek: isoWeekday(authored) };
  }
  const gym = await createGym(account, { name: "Downtown Gym" });
  return { meso, s, gym };
}

type Plan = Awaited<ReturnType<typeof weekPlan>>;
const ref = (plan: Plan, name: string) => ({
  sessionId: plan.s[name].id,
  scheduledFor: plan.s[name].authored,
});
const on = (week: ThisWeekDto, offset: number) =>
  week.days.find((x) => x.dateIso === addDays(today(), offset))!;

async function week(account: Account): Promise<ThisWeekDto> {
  const r = await call(thisWeekRoute, account);
  expect(r.status).toBe(200);
  return r.body.week as ThisWeekDto;
}

describe("GET /this-week (S1)", () => {
  it("is the web strip's own read, and null with no active block", async () => {
    const a = await createTestAccount();
    expect((await call(thisWeekRoute, a)).body).toEqual({ week: null });
    await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    const r = await call(thisWeekRoute, a);
    expect(r.body.week).toEqual(
      JSON.parse(JSON.stringify(await getThisWeek(a))),
    );
    expect(r.body.week.days).toHaveLength(7);
    expect(on(r.body.week, 0)).toMatchObject({
      isToday: true,
      workout: { sessionName: "Pull", state: "upcoming", adjustable: true },
    });
  });
});

describe("POST /mesocycles/{id}/schedule/skip (S2)", () => {
  it("skips tomorrow's workout once; a retry changes nothing; the plan is untouched", async () => {
    const a = await createTestAccount();
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    const first = await call(skipRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: ref(plan, "Push"),
    });
    expect([first.status, first.body]).toEqual([
      200,
      { missedOn: plan.s.Push.authored, outcome: "skipped" },
    ]);
    const again = await call(skipRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: ref(plan, "Push"),
    });
    expect([again.status, again.body]).toEqual([200, first.body]);
    expect(
      await p().missedDayResolution.count({ where: { userId: a.userId } }),
    ).toBe(1);
    const w = await week(a);
    expect(on(w, 1).workout).toBeNull();
    expect(on(w, 1).skipped.map((x) => x.sessionName)).toEqual(["Push"]);
    const session = await p().session.findUniqueOrThrow({
      where: { id: plan.s.Push.id },
    });
    expect(session.dayOfWeek).toBe(plan.s.Push.dayOfWeek);
  });

  it("a started workout can't be skipped; bad shapes are a 400", async () => {
    const a = await createTestAccount();
    const plan = await weekPlan(a, [{ name: "Pull", offset: 0 }]);
    const started = await call(startWorkoutRoute, a, {
      json: { ...ref(plan, "Pull"), gymId: plan.gym.id },
    });
    expect(started.status).toBe(200);
    const r = await call(skipRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: ref(plan, "Pull"),
    });
    expect([r.status, r.body.error.code]).toEqual([
      400,
      "invalid_state_transition",
    ]);
    const bad = await call(skipRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: { sessionId: 7 },
    });
    expect([bad.status, bad.body.error.code]).toEqual([
      400,
      "validation_error",
    ]);
  });
});

describe("POST /mesocycles/{id}/schedule/move (S3)", () => {
  it("Train today: a later workout moves to a free today, then starts on today", async () => {
    const a = await createTestAccount();
    const plan = await weekPlan(a, [
      { name: "Push", offset: 1 },
      { name: "Legs", offset: 3 },
    ]);
    const body = {
      ...ref(plan, "Push"),
      from: plan.s.Push.authored,
      to: today(),
      occupant: null,
    };
    const moved = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: body,
    });
    expect([moved.status, moved.body]).toEqual([200, { status: "moved" }]);
    const replay = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: body,
    });
    expect([replay.status, replay.body]).toEqual([
      200,
      { status: "unchanged" },
    ]);
    const w = await week(a);
    expect(on(w, 0).workout).toMatchObject({
      sessionName: "Push",
      movedFrom: plan.s.Push.authored,
    });
    expect(on(w, 1).workout).toBeNull();
    // Today's dashboard offers it, and the usual start begins it today.
    const todayView = await call(todayRoute, a, { query: "fields=core" });
    expect(todayView.body.dashboard).toMatchObject({
      kind: "pending",
      sessionId: plan.s.Push.id,
      scheduledFor: plan.s.Push.authored,
    });
    const start = await call(startWorkoutRoute, a, {
      json: { ...ref(plan, "Push"), gymId: plan.gym.id },
    });
    expect(start.status).toBe(200);
    const logged = await p().loggedSession.findUniqueOrThrow({
      where: { id: start.body.loggedSessionId },
    });
    expect(logged.scheduledFor.toISOString().slice(0, 10)).toBe(
      plan.s.Push.authored,
    );
    expect(logged.performedOn?.toISOString().slice(0, 10)).toBe(today());
    // One occurrence, never two: tomorrow stays free.
    expect(on(await week(a), 1).workout).toBeNull();
  });

  it("swaps two workouts, or a workout with a rest day; a stale week is a 409", async () => {
    const a = await createTestAccount();
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 1 },
      { name: "Push", offset: 2 },
    ]);
    const swap = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: {
        ...ref(plan, "Pull"),
        from: plan.s.Pull.authored,
        to: plan.s.Push.authored,
        occupant: ref(plan, "Push"),
      },
    });
    expect(swap.body).toEqual({ status: "moved" });
    let w = await week(a);
    expect([
      on(w, 1).workout?.sessionName,
      on(w, 2).workout?.sessionName,
    ]).toEqual(["Push", "Pull"]);
    // A request built on the old week (Pull still on day 1) is a conflict.
    const stale = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: {
        ...ref(plan, "Pull"),
        from: plan.s.Pull.authored,
        to: addDays(today(), 4),
        occupant: null,
      },
    });
    expect([stale.status, stale.body.error.code]).toEqual([409, "conflict"]);
    // Push (now on day 1) trades with the rest day 4.
    const rest = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: {
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: addDays(today(), 4),
        occupant: null,
      },
    });
    expect(rest.body).toEqual({ status: "moved" });
    w = await week(a);
    expect(on(w, 1).workout).toBeNull();
    expect(on(w, 4).workout?.sessionName).toBe("Push");
    // The authored plan never moved.
    for (const name of ["Pull", "Push"]) {
      const session = await p().session.findUniqueOrThrow({
        where: { id: plan.s[name].id },
      });
      expect(session.dayOfWeek).toBe(plan.s[name].dayOfWeek);
    }
  });

  it("while a missed day waits for an answer, nothing moves", async () => {
    const a = await createTestAccount();
    // A block a week old: last week's day -5 was never trained or resolved.
    const plan = await weekPlan(
      a,
      [
        { name: "Old", offset: -5 },
        { name: "Push", offset: 1 },
      ],
      -7,
    );
    const w = await week(a);
    expect(w.blockedReason).toMatch(/missed workout/);
    const r = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: {
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: addDays(today(), 3),
        occupant: null,
      },
    });
    expect([r.status, r.body.error.code]).toEqual([
      400,
      "invalid_state_transition",
    ]);
  });

  it("an unknown block or a malformed occupant is refused", async () => {
    const a = await createTestAccount();
    const plan = await weekPlan(a, [{ name: "Push", offset: 1 }]);
    const unknown = await call(moveRoute, a, {
      params: { mesocycleId: randomUUID() },
      json: {
        ...ref(plan, "Push"),
        from: plan.s.Push.authored,
        to: today(),
        occupant: null,
      },
    });
    expect([unknown.status, unknown.body.error.code]).toEqual([
      404,
      "not_found",
    ]);
    const bad = await call(moveRoute, a, {
      params: { mesocycleId: plan.meso.id },
      json: {
        ...ref(plan, "Push"),
        from: plan.s.Push.authored,
        to: today(),
        occupant: "x",
      },
    });
    expect([bad.status, bad.body.error.code]).toEqual([
      400,
      "validation_error",
    ]);
  });
});
