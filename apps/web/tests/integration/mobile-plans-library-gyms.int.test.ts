/**
 * Pitch 21h — Plans, Library & Gyms's mobile endpoints, end to end through the
 * route handlers (spec §12 "API"). Only Supabase Auth is replaced: an opaque
 * token "t.<userId>.s" verifies as that user. The handlers, the pipeline, and
 * every read and write module are the production code, against a real
 * database. Cross-account cases live in the isolation suite.
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
import { GET as planRoute } from "@/app/api/mobile/v1/plan/route";
import { GET as planSessionRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/sessions/[sessionId]/route";
import { GET as exercisesRoute } from "@/app/api/mobile/v1/exercises/route";
import { GET as exerciseRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/route";
import type {
  ExerciseDetailDto,
  ExerciseList,
} from "@overload/shared/contracts/exercises";
import { setExerciseFavorite } from "@/lib/exercises/exercises";
import { activateMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { addPlannedCardio } from "@/lib/plan/cardio";
import { createGym } from "@/lib/gyms/gyms";
import {
  archiveExercise,
  createCustomExercise,
} from "@/lib/exercises/exercises";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import { snapshotAccount } from "./isolation/support";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();
const today = () => todayIso("UTC");

async function call(
  handler: unknown,
  account: Account,
  opts: {
    method?: string;
    json?: unknown;
    params?: Record<string, string>;
    query?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
    ...opts.headers,
  });
  const body = opts.json === undefined ? undefined : JSON.stringify(opts.json);
  if (body !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request(
      `http://localhost/api/mobile/v1/x${opts.query ? `?${opts.query}` : ""}`,
      {
        method: opts.method ?? (body === undefined ? "GET" : "POST"),
        headers,
        body,
      },
    ),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: text ? JSON.parse(text) : null,
  };
}

async function libraryExercise(
  name: string,
  equipmentType: "barbell" | "machine" | "bodyweight",
  primaryMuscle: "chest" | "back" | "core" = "chest",
) {
  return db().exercise.create({
    data: {
      name,
      primaryMuscle,
      equipmentType,
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
}

/**
 * A block whose week `currentWeek` starts `weekOffset` days before today:
 * "Push" on today's weekday (bench 3 × 6–8, pull-ups 3 × 10, a custom lift),
 * "Pull" on the weekday of today + 2, and planned cardio on today's weekday.
 */
async function blockFor(
  account: Account,
  opts: {
    name?: string;
    startOffsetDays?: number;
    lengthWeeks?: number;
    deloadEveryWeeks?: number;
    activate?: boolean;
    pullOffsetDays?: number;
  } = {},
) {
  const startDate = addDays(today(), opts.startOffsetDays ?? -14);
  const bench = await libraryExercise(`Bench ${randomUUID()}`, "barbell");
  const pullups = await libraryExercise(
    `Pull-up ${randomUUID()}`,
    "bodyweight",
    "back",
  );
  const custom = await createCustomExercise(account, {
    name: "Landmine Press",
    primaryMuscle: "chest",
    equipmentType: "barbell",
  });
  const meso = await createMesocycle(account, {
    name: opts.name ?? "Spring Strength",
    startDate,
    lengthWeeks: String(opts.lengthWeeks ?? 6),
    deloadEveryWeeks: String(opts.deloadEveryWeeks ?? 3),
    splitType: "custom",
  });
  const push = await addSession(account, {
    mesocycleId: meso.id,
    name: "Push",
    dayOfWeek: isoWeekday(today()),
  });
  const pull = await addSession(account, {
    mesocycleId: meso.id,
    name: "Pull",
    dayOfWeek: isoWeekday(addDays(today(), opts.pullOffsetDays ?? 2)),
  });
  const slots = [
    [push.id, bench.id, "3", "6", "8"],
    [push.id, pullups.id, "3", "10", "10"],
    [push.id, custom.id, "3", "8", "10"],
    [pull.id, pullups.id, "4", "6", "8"],
  ] as const;
  for (const [sessionId, exerciseId, sets, min, max] of slots) {
    await addSessionExercise(account, {
      sessionId,
      exerciseId,
      plannedSets: sets,
      targetRepMin: min,
      targetRepMax: max,
    });
  }
  await addPlannedCardio(account, {
    mesocycleId: meso.id,
    dayOfWeek: isoWeekday(today()),
    type: "Bike",
    durationMin: "20",
  });
  if (opts.activate !== false) {
    const current = await db().mesocycle.findFirst({
      where: { userId: account.userId, status: "active" },
      select: { id: true },
    });
    await activateMesocycle(account, {
      mesocycleId: meso.id,
      expectedActiveId: current?.id ?? null,
    });
  }
  return { meso, push, pull, bench, pullups, custom, startDate };
}

describe("GET /plan", () => {
  it("no active block: block null and the other blocks counted", async () => {
    const a = await createTestAccount();
    const r = await call(planRoute, a);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      today: today(),
      block: null,
      otherBlocks: { drafts: 0, previous: 0 },
    });

    await blockFor(a, { name: "Draft One", activate: false });
    await blockFor(a, { name: "First" });
    await blockFor(a, { name: "Second" }); // archives First
    const r2 = (await call(planRoute, a)).body as PlanOverviewDto;
    expect(r2.block?.summary.name).toBe("Second");
    expect(r2.otherBlocks).toEqual({ drafts: 1, previous: 1 });
  });

  it("an active block: position, deload weeks, template, and a seven-day dated week", async () => {
    const a = await createTestAccount();
    const plan = await blockFor(a, { startOffsetDays: -14 });
    const r = await call(planRoute, a);
    expect(r.status).toBe(200);
    const body = r.body as PlanOverviewDto;
    const block = body.block!;
    expect(block.summary).toMatchObject({
      id: plan.meso.id,
      name: "Spring Strength",
      status: "active",
      startDate: plan.startDate,
      lengthWeeks: 6,
      deloadEveryWeeks: 3,
      sessionCount: 2,
    });
    // Started 14 days ago: today opens week 3, which is a deload week (every 3rd).
    expect(block.position).toEqual({
      kind: "running",
      week: 3,
      scheduledDeloadWeek: true,
    });
    expect(block.deloadWeeks).toEqual([3, 6]);

    const week = block.week;
    expect(week).toMatchObject({
      weekNumber: 3,
      lengthWeeks: 6,
      scheduledDeloadWeek: true,
      isCurrentWeek: true,
    });
    expect(week.days.map((d) => d.dateIso)).toEqual(
      Array.from({ length: 7 }, (_, i) => addDays(today(), i)),
    );
    expect(week.days.filter((d) => d.isToday).map((d) => d.dateIso)).toEqual([
      today(),
    ]);
    // Today: Push, upcoming, with its cardio. +2: Pull. Every other day rest.
    expect(week.days[0].sessions).toEqual([
      {
        sessionId: plan.push.id,
        sessionName: "Push",
        state: "upcoming",
        loggedSessionId: null,
      },
    ]);
    expect(week.days[0].cardio.map((c) => c.planned)).toEqual([
      { type: "Bike", durationMin: 20 },
    ]);
    expect(week.days[2].sessions.map((s) => s.sessionName)).toEqual(["Pull"]);
    for (const i of [1, 3, 4, 5, 6]) {
      expect(week.days[i].sessions).toEqual([]);
    }

    // Template: Push on today's weekday, Pull two days on; cardio on Push's day.
    const pushIdx = isoWeekday(today()) - 1;
    expect(block.template[pushIdx]?.name).toBe("Push");
    expect(block.template[(pushIdx + 2) % 7]?.name).toBe("Pull");
    expect(block.templateCardio[pushIdx]).toMatchObject({
      type: "Bike",
      durationMin: 20,
    });
    expect(block.unscheduled).toEqual([]);
  });

  it("?week= walks the block, is clamped to it, and ignores anything else", async () => {
    const a = await createTestAccount();
    const plan = await blockFor(a, { startOffsetDays: -14 });
    const weekOf = async (query: string) =>
      ((await call(planRoute, a, { query })).body as PlanOverviewDto).block!
        .week;
    const w1 = await weekOf("week=1");
    expect(w1).toMatchObject({
      weekNumber: 1,
      isCurrentWeek: false,
      scheduledDeloadWeek: false,
    });
    expect(w1.days[0].dateIso).toBe(plan.startDate);
    expect(w1.days.some((d) => d.isToday)).toBe(false);
    expect((await weekOf("week=999")).weekNumber).toBe(6);
    expect((await weekOf("week=abc")).weekNumber).toBe(3);
    expect((await weekOf("week=0")).weekNumber).toBe(3);
  });

  it("logged state uses History's words; a shifted day sits where it landed", async () => {
    const a = await createTestAccount();
    // Week 3 began two days ago; Pull sits on yesterday's weekday.
    const plan = await blockFor(a, {
      startOffsetDays: -16,
      pullOffsetDays: -1,
    });
    const gym = await createGym(a, { name: "Northside" });
    await startOrResumeWorkout(a, {
      sessionId: plan.push.id,
      scheduledFor: today(),
      gymId: gym.id,
    });
    await resolveMissedDay(a, {
      mesocycleId: plan.meso.id,
      missedOn: addDays(today(), -1),
      outcome: "shifted",
    });
    const week = ((await call(planRoute, a)).body as PlanOverviewDto).block!
      .week;
    const byDate = Object.fromEntries(week.days.map((d) => [d.dateIso, d]));
    // Yesterday's Pull moved to today; Push moved with it to tomorrow.
    expect(byDate[addDays(today(), -1)].sessions).toEqual([]);
    expect(
      byDate[today()].sessions.map((s) => [s.sessionName, s.state]),
    ).toEqual([["Pull", "shifted"]]);
    const tomorrow = byDate[addDays(today(), 1)].sessions;
    expect(tomorrow.map((s) => s.sessionName)).toEqual(["Push"]);
    expect(tomorrow[0].state).toBe("in_progress");
    expect(tomorrow[0].loggedSessionId).toEqual(expect.any(String));
  });

  it("a block that hasn't started, and one past its planned end", async () => {
    const a = await createTestAccount();
    await blockFor(a, { startOffsetDays: 7 });
    const upcoming = ((await call(planRoute, a)).body as PlanOverviewDto)
      .block!;
    expect(upcoming.position).toEqual({
      kind: "upcoming",
      startsOn: addDays(today(), 7),
    });
    expect(upcoming.week.weekNumber).toBe(1);
    expect(upcoming.week.days.some((d) => d.isToday)).toBe(false);

    const b = await createTestAccount();
    await blockFor(b, { startOffsetDays: -50, lengthWeeks: 6 });
    const ended = ((await call(planRoute, b)).body as PlanOverviewDto).block!;
    expect(ended.position).toEqual({
      kind: "ended",
      endedOn: addDays(today(), -50 + 41),
    });
    expect(ended.week.weekNumber).toBe(6);
  });

  it("today is the account's own calendar date", async () => {
    const k = await createTestAccount("Pacific/Kiritimati");
    const r = (await call(planRoute, k)).body as PlanOverviewDto;
    expect(r.today).toBe(todayIso("Pacific/Kiritimati"));
  });

  it("reading the plan writes nothing", async () => {
    const a = await createTestAccount();
    const plan = await blockFor(a);
    // The pipeline stamps last-active once a day; take the snapshot after it.
    await call(planRoute, a);
    const before = await snapshotAccount(a.userId);
    await call(planRoute, a);
    await call(planRoute, a, { query: "week=1" });
    await call(planSessionRoute, a, {
      params: { mesocycleId: plan.meso.id, sessionId: plan.push.id },
    });
    expect(await snapshotAccount(a.userId)).toEqual(before);
  });
});

describe("GET /mesocycles/{id}/sessions/{id}", () => {
  it("the authored session in plan order, with prescriptions, bodyweight, and its day's cardio", async () => {
    const a = await createTestAccount();
    const plan = await blockFor(a);
    await archiveExercise(a, { exerciseId: plan.custom.id });
    const r = await call(planSessionRoute, a, {
      params: { mesocycleId: plan.meso.id, sessionId: plan.push.id },
    });
    expect(r.status).toBe(200);
    const s = r.body as PlanSessionDto;
    expect(s).toMatchObject({
      id: plan.push.id,
      name: "Push",
      dayOfWeek: isoWeekday(today()),
      mesocycle: {
        id: plan.meso.id,
        name: "Spring Strength",
        status: "active",
      },
      cardio: { type: "Bike", durationMin: 20, dayOfWeek: isoWeekday(today()) },
    });
    expect(s).not.toHaveProperty("occupancy");
    expect(
      s.exercises.map((e) => [
        e.exerciseId,
        e.plannedSets,
        e.targetRepMin,
        e.targetRepMax,
        e.requiresExternalWeight,
        e.isCustom,
        e.isArchived,
      ]),
    ).toEqual([
      [plan.bench.id, 3, 6, 8, true, false, false],
      [plan.pullups.id, 3, 10, 10, false, false, false],
      [plan.custom.id, 3, 8, 10, true, true, true],
    ]);
    expect(s.exercises.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it("a session from another block, or a malformed id, is a 404", async () => {
    const a = await createTestAccount();
    const one = await blockFor(a, { name: "One" });
    const two = await blockFor(a, { name: "Two", activate: false });
    for (const params of [
      { mesocycleId: one.meso.id, sessionId: two.push.id },
      { mesocycleId: "nope", sessionId: one.push.id },
      { mesocycleId: one.meso.id, sessionId: randomUUID() },
    ]) {
      const r = await call(planSessionRoute, a, { params });
      expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
    }
  });

  it("an unscheduled session has no cardio", async () => {
    const a = await createTestAccount();
    const plan = await blockFor(a, { activate: false });
    const loose = await addSession(a, {
      mesocycleId: plan.meso.id,
      name: "Extra",
      dayOfWeek: null,
    });
    const s = (
      await call(planSessionRoute, a, {
        params: { mesocycleId: plan.meso.id, sessionId: loose.id },
      })
    ).body as PlanSessionDto;
    expect([s.dayOfWeek, s.cardio, s.exercises]).toEqual([null, null, []]);
  });
});

describe("GET /exercises", () => {
  /** A small private catalog per test: unique words keep searches exact. */
  async function catalog(account: Account) {
    const tag = randomUUID().slice(0, 8);
    const names = {
      bench: `Zq${tag} Barbell Bench Press`,
      incline: `Zq${tag} Incline Bench Press`,
      row: `Zq${tag} Cable Row`,
      pct: `Zq${tag} 100% Effort_Squat`,
    };
    const bench = await libraryExercise(names.bench, "barbell", "chest");
    const incline = await libraryExercise(names.incline, "barbell", "chest");
    const row = await libraryExercise(names.row, "machine", "back");
    const pct = await libraryExercise(names.pct, "barbell", "core");
    const custom = await createCustomExercise(account, {
      name: `Zq${tag} Landmine Press`,
      primaryMuscle: "chest",
      equipmentType: "barbell",
    });
    const archived = await createCustomExercise(account, {
      name: `Zq${tag} Old Fly`,
      primaryMuscle: "chest",
      equipmentType: "cable",
    });
    await archiveExercise(account, { exerciseId: archived.id });
    return { tag, bench, incline, row, pct, custom, archived };
  }
  const list = async (account: Account, query: string) => {
    const r = await call(exercisesRoute, account, { query });
    expect(r.status).toBe(200);
    return r.body as ExerciseList;
  };
  const q = (s: string) => `q=${encodeURIComponent(s)}`;

  it("every search word must match, in any order; archived ones never appear", async () => {
    const a = await createTestAccount();
    const c = await catalog(a);
    const all = await list(a, q(`Zq${c.tag}`));
    expect(all.items.map((e) => e.id).sort()).toEqual(
      [c.bench.id, c.incline.id, c.row.id, c.pct.id, c.custom.id].sort(),
    );
    expect(all.total).toBe(5);
    const press = await list(a, q(`press bench Zq${c.tag}`));
    expect(press.items.map((e) => e.name)).toEqual([
      c.bench.name,
      c.incline.name,
    ]);
    const mine = all.items.find((e) => e.id === c.custom.id)!;
    expect(mine).toMatchObject({ isCustom: true, imageUrl: null });
  });

  it("% and _ are literal, not wildcards", async () => {
    const a = await createTestAccount();
    const c = await catalog(a);
    expect(
      (await list(a, q(`Zq${c.tag} 100%`))).items.map((e) => e.id),
    ).toEqual([c.pct.id]);
    expect((await list(a, q(`Zq${c.tag} %`))).items.map((e) => e.id)).toEqual([
      c.pct.id,
    ]);
    expect((await list(a, q(`Zq${c.tag} t_S`))).items.map((e) => e.id)).toEqual(
      [c.pct.id],
    );
    expect((await list(a, q(`Zq${c.tag} B_rbell`))).items).toEqual([]);
  });

  it("the muscle filter is primary muscle only; favorites view lists only favorites", async () => {
    const a = await createTestAccount();
    const c = await catalog(a);
    const back = await list(a, `${q(`Zq${c.tag}`)}&muscle=back`);
    expect(back.items.map((e) => e.id)).toEqual([c.row.id]);
    expect((await list(a, `${q(`Zq${c.tag}`)}&view=favorites`)).items).toEqual(
      [],
    );
    await setExerciseFavorite(a, {
      exerciseId: c.incline.id,
      isFavorite: true,
    });
    const favs = await list(a, `${q(`Zq${c.tag}`)}&view=favorites`);
    expect(favs.items.map((e) => [e.id, e.isFavorite])).toEqual([
      [c.incline.id, true],
    ]);
    expect(favs.hasAnyFavorites).toBe(true);
    // Unknown values fall back to the defaults, as on the web.
    const odd = await list(a, `${q(`Zq${c.tag}`)}&view=nope&muscle=wings`);
    expect(odd.total).toBe(5);
  });

  it("pages by limit (50 minimum, the web's), keeping the total", async () => {
    const a = await createTestAccount();
    const tag = randomUUID().slice(0, 8);
    for (let i = 0; i < 55; i++) {
      await libraryExercise(
        `Zp${tag} Lift ${String(i).padStart(2, "0")}`,
        "barbell",
      );
    }
    const first = await list(a, q(`Zp${tag}`));
    expect([first.items.length, first.total, first.limit]).toEqual([
      50, 55, 50,
    ]);
    const more = await list(a, `${q(`Zp${tag}`)}&limit=100`);
    expect([more.items.length, more.limit]).toEqual([55, 100]);
    expect((await list(a, `${q(`Zp${tag}`)}&limit=3`)).limit).toBe(50);
  });

  it("no match is an empty answer, not an error", async () => {
    const a = await createTestAccount();
    const r = await list(a, q(`nothing-${randomUUID()}`));
    expect([r.items, r.total]).toEqual([[], 0]);
  });
});

describe("GET /exercises/{id}", () => {
  it("a library exercise: classification, image, read-only", async () => {
    const before = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://images.example.test";
    try {
      await libraryDetailCase();
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = before;
    }
  });

  async function libraryDetailCase() {
    const a = await createTestAccount();
    const ex = await db().exercise.create({
      data: {
        name: `Detail ${randomUUID()}`,
        primaryMuscle: "chest",
        secondaryMuscles: ["shoulders", "triceps"],
        equipmentType: "barbell",
        isCustom: false,
        sourceId: randomUUID(),
        imageRef: "Barbell_Bench_Press/0.jpg",
      },
    });
    const r = await call(exerciseRoute, a, { params: { exerciseId: ex.id } });
    expect(r.status).toBe(200);
    expect(r.body as ExerciseDetailDto).toMatchObject({
      id: ex.id,
      primaryMuscleLabel: "Chest",
      equipmentLabel: "Barbell",
      equipmentType: "barbell",
      secondaryMuscleLabels: ["Shoulders", "Triceps"],
      isCustom: false,
      isArchived: false,
      canArchive: false,
      isFavorite: false,
      imageUrl: expect.stringContaining("Barbell_Bench_Press/0.jpg"),
    });
  }

  it("an archived custom exercise still resolves, marked; a bad id is a 404", async () => {
    const a = await createTestAccount();
    const custom = await createCustomExercise(a, {
      name: "Old Fly",
      primaryMuscle: "chest",
      equipmentType: "cable",
    });
    await archiveExercise(a, { exerciseId: custom.id });
    const r = await call(exerciseRoute, a, {
      params: { exerciseId: custom.id },
    });
    expect(r.body).toMatchObject({
      isCustom: true,
      isArchived: true,
      canArchive: true,
      imageUrl: null,
    });
    for (const exerciseId of ["nope", randomUUID()]) {
      const missing = await call(exerciseRoute, a, { params: { exerciseId } });
      expect([missing.status, missing.body.error.code]).toEqual([
        404,
        "not_found",
      ]);
    }
  });
});
