/**
 * Pitch 21e Checkpoint A (RD-23): native missed-day resolution, end to end
 * through the route handlers. Shift and skip go through
 * `PUT /mesocycles/{id}/missed-days/{date}` (the web's resolveMissedDay);
 * log it late is `POST /workouts` with the missed date. Only Supabase Auth is
 * replaced. Cross-account cases live in the isolation suite.
 *
 * The block is anchored on the real date so "this week" is the block's
 * current week: it starts two days ago (T-2), with "Missed Upper" planned
 * yesterday (T-1) and "Later Lower" in two days (T+2). Week 2 repeats both.
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

import type { Account } from "@/lib/data/account";
import { PUT as resolveRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/missed-days/[missedOn]/route";
import { POST as startRoute } from "@/app/api/mobile/v1/workouts/route";
import { PUT as setRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]/route";
import { POST as completeRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/complete/route";
import { GET as todayRoute } from "@/app/api/mobile/v1/today/route";
import { GET as historyWeekRoute } from "@/app/api/mobile/v1/history/route";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type { TodayDto } from "@overload/shared/contracts/views";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();

async function call(
  handler: unknown,
  account: Account,
  opts: {
    method?: string;
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
      {
        method: opts.method ?? (body === undefined ? "GET" : "POST"),
        headers,
        body,
      },
    ),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const T = () => todayIso("UTC");

async function missedWeek(opts: { entitlement?: "pro" | "none" } = {}) {
  const account = await createTestAccount("UTC", undefined, opts);
  const userId = account.userId;
  const meso = await createActiveTestMesocycle({
    userId,
    startDate: new Date(`${addDays(T(), -2)}T00:00:00Z`),
    lengthWeeks: 2,
    deloadEveryWeeks: 2,
  });
  const exercise = await createTestExercise({ userId, name: "Bench Press" });
  const missed = await createTestSession(meso.id, {
    userId,
    name: "Missed Upper",
    dayOfWeek: isoWeekday(addDays(T(), -1)),
  });
  const later = await createTestSession(meso.id, {
    userId,
    name: "Later Lower",
    dayOfWeek: isoWeekday(addDays(T(), 2)),
  });
  for (const s of [missed, later]) {
    await createTestSessionExercise(s.id, exercise.id, { userId });
  }
  const gym = await db().gym.create({ data: { userId, name: "Home Gym" } });
  return { account, meso, missed, later, gym, missedOn: addDays(T(), -1) };
}

type Week = Awaited<ReturnType<typeof missedWeek>>;

const resolve = (w: Week, outcome: unknown, missedOn = w.missedOn) =>
  call(resolveRoute, w.account, {
    method: "PUT",
    json: { outcome },
    params: { mesocycleId: w.meso.id, missedOn },
  });

async function dashboard(account: Account) {
  const r = await call(todayRoute, account);
  expect(r.status).toBe(200);
  return (r.body as TodayDto).dashboard;
}

async function week(account: Account, weekStart?: string) {
  const r = await call(historyWeekRoute, account, {
    query: weekStart ? `week=${weekStart}` : undefined,
  });
  expect(r.status).toBe(200);
  const view = (r.body as HistoryWeekDto).view;
  if (view.kind !== "active") throw new Error("expected the active week");
  return view.days;
}

describe("PUT /mesocycles/{id}/missed-days/{date} (RD-23)", () => {
  it("Today blocks on the missed day first, as on the web", async () => {
    const w = await missedWeek();
    const d = await dashboard(w.account);
    expect(d.kind).toBe("missed_day");
    if (d.kind !== "missed_day") return;
    expect(d.missed).toMatchObject({
      mesocycleId: w.meso.id,
      sessionId: w.missed.id,
      missedOn: w.missedOn,
      daysAgo: 1,
    });
  });

  it("shift moves only the rest of this week; next week keeps its days", async () => {
    const w = await missedWeek();
    const r = await resolve(w, "shifted");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ missedOn: w.missedOn, outcome: "shifted" });

    // The missed workout lands today, so Today offers it, unblocked.
    const d = await dashboard(w.account);
    expect(d.kind).toBe("pending");
    if (d.kind === "pending") expect(d.sessionId).toBe(w.missed.id);

    const thisWeek = await week(w.account);
    const lower = thisWeek.filter((x) => x.sessionName === "Later Lower");
    expect(lower.map((x) => x.dateIso)).toEqual([addDays(T(), 3)]);
    const nextWeek = await week(w.account, addDays(T(), 5));
    expect(
      nextWeek
        .filter((x) => x.sessionName === "Later Lower")
        .map((x) => x.dateIso),
    ).toEqual([addDays(T(), 9)]);
    expect(
      nextWeek
        .filter((x) => x.sessionName === "Missed Upper")
        .map((x) => x.dateIso),
    ).toEqual([addDays(T(), 6)]);
  });

  it("skip records the day and never prompts again", async () => {
    const w = await missedWeek();
    expect((await resolve(w, "skipped")).status).toBe(200);
    for (let i = 0; i < 2; i++) {
      // Nothing is planned today: a rest day, not a missed day.
      expect((await dashboard(w.account)).kind).toBe("rest");
    }
    const row = (await week(w.account)).find(
      (x) => x.sessionName === "Missed Upper",
    );
    expect(row?.state).toBe("skipped");
    expect(
      await db().missedDayResolution.count({
        where: { userId: w.account.userId },
      }),
    ).toBe(1);
  });

  it("the same outcome again is the stored answer; a different one is a 409", async () => {
    const w = await missedWeek();
    const first = await resolve(w, "skipped");
    const again = await resolve(w, "skipped");
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    const other = await resolve(w, "shifted");
    expect([other.status, other.body.error.code]).toEqual([409, "conflict"]);
    expect(
      await db().missedDayResolution.count({
        where: { userId: w.account.userId },
      }),
    ).toBe(1);
  });

  it("refuses what isn't a resolvable missed day; nothing is written", async () => {
    const w = await missedWeek();
    const cases: [unknown, string][] = [
      ["logged_late", w.missedOn], // log it late is a workout, not a record
      [undefined, w.missedOn],
      ["skipped", "not-a-date"],
      ["skipped", T()], // today
      ["skipped", addDays(T(), 2)], // the future
      ["skipped", addDays(T(), -2)], // nothing was planned
    ];
    for (const [outcome, date] of cases) {
      const r = await resolve(w, outcome, date);
      expect([r.status, r.body.error.code]).toEqual([400, "validation_error"]);
    }
    const missing = await call(resolveRoute, w.account, {
      method: "PUT",
      json: { outcome: "skipped" },
      params: { mesocycleId: "not-a-uuid", missedOn: w.missedOn },
    });
    expect([missing.status, missing.body.error.code]).toEqual([
      404,
      "not_found",
    ]);
    expect(
      await db().missedDayResolution.count({
        where: { userId: w.account.userId },
      }),
    ).toBe(0);
  });

  it("log it late starts the missed date's workout; Today moves on", async () => {
    const w = await missedWeek();
    const start = () =>
      call(startRoute, w.account, {
        json: {
          sessionId: w.missed.id,
          scheduledFor: w.missedOn,
          gymId: w.gym.id,
        },
      });
    const r = await start();
    expect(r.status).toBe(200);
    // A repeated tap resumes the same workout.
    expect((await start()).body).toEqual(r.body);
    const { loggedSessionId } = r.body as { loggedSessionId: string };
    const logged = await db().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    expect(logged.scheduledFor.toISOString().slice(0, 10)).toBe(w.missedOn);
    expect((await dashboard(w.account)).kind).not.toBe("missed_day");

    // The sets done that day, then finish.
    const le = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId },
    });
    for (const setNumber of ["1", "2", "3"]) {
      const set = await call(setRoute, w.account, {
        method: "PUT",
        json: { weightLbs: 135, reps: 8 },
        params: { loggedExerciseId: le.id, setNumber },
      });
      expect(set.status).toBe(200);
    }
    expect(
      (
        await call(completeRoute, w.account, {
          method: "POST",
          params: { loggedSessionId },
        })
      ).status,
    ).toBe(200);
    expect((await dashboard(w.account)).kind).toBe("rest");
    // Log late is a workout, never a resolution record.
    expect(
      await db().missedDayResolution.count({
        where: { userId: w.account.userId },
      }),
    ).toBe(0);
  });

  it("is Free: a Free account resolves its own missed day", async () => {
    const w = await missedWeek({ entitlement: "none" });
    expect((await resolve(w, "skipped")).status).toBe(200);
  });
});
