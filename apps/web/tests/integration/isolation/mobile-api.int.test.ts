/**
 * Pitch 21c (spec §17.2; RD-13): the mobile API's endpoint isolation suite.
 *
 * Route handlers are called directly with real Requests against a real
 * database. Only the Supabase Auth call is replaced: an opaque test token
 * "t.<userId>.s" verifies as that user (a token starting "rejected" is refused,
 * "down" means Auth is unreachable). Everything else — the version gate, the
 * no-create account resolution, suspension, the rate limit, the scoped reads,
 * the gates — is the production code.
 *
 * Every registry entry (tests/support/mobile-endpoints.ts) must have a case
 * here; the last test fails otherwise.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    if (token.startsWith("down.")) return { kind: "unavailable" };
    if (token.startsWith("rejected.")) return { kind: "rejected" };
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

// Pitch 21d: native signup and the reset request run the web's own modules
// against this real database. Only Supabase Auth's admin create and the
// stateless sign-in / reset email are faked, at their seams.
const authUsers = new Map<string, string>(); // email -> user id
jest.mock("@/lib/supabase/admin", () => ({
  ...jest.requireActual("@/lib/supabase/admin"),
  createConfirmedUser: async ({ email }: { email: string }) => {
    if (authUsers.has(email)) {
      return { ok: false as const, code: "email_exists" };
    }
    const id = jest.requireActual("node:crypto").randomUUID() as string;
    authUsers.set(email, id);
    return { ok: true as const, user: { id } };
  },
  deleteAuthUser: async () => "deleted" as const,
}));
const resetEmails: string[] = [];
jest.mock("@/lib/supabase/stateless", () => ({
  createStatelessAuthClient: () => ({
    signInWithPassword: async ({ email }: { email: string }) => {
      const id = authUsers.get(email);
      return id
        ? {
            data: {
              user: { id },
              session: {
                access_token: `access.${id}`,
                refresh_token: `refresh.${id}`,
                expires_at: 1_900_000_000,
                expires_in: 3600,
              },
            },
            error: null,
          }
        : { data: { user: null, session: null }, error: { status: 400 } };
    },
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async (email: string) => {
      resetEmails.push(email);
      return { error: null };
    },
  }),
}));

import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { GET as appConfig } from "@/app/api/mobile/v1/app-config/route";
import { GET as me } from "@/app/api/mobile/v1/me/route";
import { GET as today } from "@/app/api/mobile/v1/today/route";
import { GET as gyms } from "@/app/api/mobile/v1/gyms/route";
import * as catchAll from "@/app/api/mobile/[[...path]]/route";
import { mobileBotChallenge } from "@/lib/api/mobile/version";
import { POST as signUpRoute } from "@/app/api/mobile/v1/accounts/route";
import { POST as passwordReset } from "@/app/api/mobile/v1/password-reset/route";
import { PUT as putAppearance } from "@/app/api/mobile/v1/me/appearance/route";
import { POST as startWorkoutRoute } from "@/app/api/mobile/v1/workouts/route";
import { GET as getWorkoutRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/route";
import { POST as completeWorkoutRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/complete/route";
import { GET as historyWeekRoute } from "@/app/api/mobile/v1/history/route";
import { GET as historyWorkoutRoute } from "@/app/api/mobile/v1/history/[loggedSessionId]/route";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import { PUT as resolveMissedDayRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/missed-days/[missedOn]/route";
import { PUT as putSetRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]/route";
import { PUT as changeGymRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/gym/route";
import { GET as swapCandidatesRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/swap-candidates/route";
import { PUT as swapExerciseRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/exercise/route";
import { PUT as setSkippedRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/skipped/route";
import { PATCH as plannedSetsRoute } from "@/app/api/mobile/v1/logged-exercises/[loggedExerciseId]/planned-sets/route";
import { PATCH as editSetRoute } from "@/app/api/mobile/v1/sets/[loggedSetId]/route";
import { PUT as logCardioRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/cardio-logs/[scheduledFor]/route";
import { PATCH as editCardioRoute } from "@/app/api/mobile/v1/cardio-logs/[cardioLogId]/route";
import { GET as planRoute } from "@/app/api/mobile/v1/plan/route";
import { GET as planSessionRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/sessions/[sessionId]/route";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { createCustomExercise } from "@/lib/exercises/exercises";
import { logCardio } from "@/lib/cardio/cardio-logs";
import type { SwapContextDto } from "@overload/shared/contracts/logging";
import { createGoal } from "@/lib/goals/goals";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import {
  completeWorkoutAndReconcile,
  logSetAndReconcile,
} from "@/lib/logging/workflows";
import { addDays } from "@overload/shared/plan/calendar";
import type {
  LoggedSetDto,
  LoggedWorkoutDetailViewDto,
  TodayDto,
  WorkoutViewDto,
} from "@overload/shared/contracts/views";
import type { MeDto } from "@overload/shared/contracts/account";
import type { GymsResponseDto } from "@overload/shared/contracts/gyms";
import { createTestAccount } from "../support/accounts";
import { getTestPrisma } from "../support/db";
import { endpointKey, MOBILE_ENDPOINTS } from "../../support/mobile-endpoints";
import { activePlan, library, today as todayIso, type Lib } from "./fixtures";
import { snapshotAccount } from "./support";

/** Any route method: a static route's params are `{}`, a dynamic one's its segments. */
type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const PINNED_ENV = {
  MOBILE_MIN_APP_VERSION: "1.2.0",
  // Native signup (Pitch 21d) runs in public mode; the shared test database
  // holds many recent profiles, so the hourly cap is raised for this file.
  OVERLOAD_SIGNUP_MODE: "public",
  OVERLOAD_SIGNUP_HOURLY_CAP: "1000000",
} as const;
const ORIGINAL_ENV = Object.fromEntries(
  Object.keys(PINNED_ENV).map((k) => [k, process.env[k]]),
);
beforeAll(() => {
  Object.assign(process.env, PINNED_ENV);
});
afterAll(() => {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const tokenFor = (userId: string) => `t.${userId}.s`;

type CallInit = {
  method?: string;
  json?: unknown;
  ip?: string;
  /** Dynamic route segments (Pitch 21e). */
  params?: Record<string, string>;
  /** A query string without the "?" (Pitch 21e). */
  query?: string;
};

async function call(
  handler: Handler,
  opts: { token?: string | null; version?: string | null } & CallInit = {},
) {
  const headers = new Headers();
  const version = opts.version === undefined ? "1.2.0" : opts.version;
  if (version !== null) headers.set("x-overload-app-version", version);
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  const hasBody = opts.json !== undefined;
  if (hasBody) headers.set("content-type", "application/json");
  const res = await handler(
    new Request(
      `http://localhost/api/mobile/v1/x${opts.query ? `?${opts.query}` : ""}`,
      {
        method: opts.method ?? (hasBody ? "POST" : "GET"),
        headers,
        body: hasBody ? JSON.stringify(opts.json) : undefined,
      },
    ),
    { params: Promise.resolve(opts.params ?? {}) } as {
      params: Promise<never>;
    },
  );
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: text ? JSON.parse(text) : null,
  };
}

/** A with a real plan, finished history, gyms, and goals; B with its own gym. */
async function twoAccounts(lib: Lib) {
  const a = await createTestAccount();
  const b = await createTestAccount();
  const plan = await activePlan(a, lib, "Alpha", { startWeeksAgo: 2 });
  for (const weeksAgo of [2, 1]) {
    const { loggedSessionId } = await startOrResumeWorkout(a, {
      sessionId: plan.session.id,
      scheduledFor: addDays(todayIso(), -7 * weeksAgo),
      gymId: plan.gym.id,
    });
    const les = await getTestPrisma().loggedExercise.findMany({
      where: { loggedSessionId },
    });
    for (const le of les) {
      for (let n = 1; n <= le.plannedSets; n++) {
        await logSetAndReconcile(a, {
          loggedExerciseId: le.id,
          setNumber: n,
          weightLbs: 135,
          reps: 5,
        });
      }
    }
    await completeWorkoutAndReconcile(a, { loggedSessionId });
  }
  await createGoal(a, {
    exerciseId: lib.incline.id,
    gymId: null,
    targetWeightLbs: "275",
    targetReps: "3",
  });
  const bGym = await getTestPrisma().gym.create({
    data: { userId: b.userId, name: "Bravo Garage Gym", address: "B street" },
  });
  return { a, b, plan, bGym };
}

/** Strings that would reveal A to anyone else. */
function aMarkers(a: Account, plan: Awaited<ReturnType<typeof activePlan>>) {
  return [
    a.userId,
    plan.gym.id,
    plan.gym.name,
    plan.meso.id,
    plan.session.id,
    "Alpha Push",
    "Alpha Landmine Press",
    plan.custom.id,
  ];
}

async function suspend(account: Account) {
  await getTestPrisma().profile.update({
    where: { userId: account.userId },
    data: { status: "suspended" },
  });
}

let lib: Lib;
beforeEach(async () => {
  lib = await library();
});

/** The authentication, suspension, and version matrix every account endpoint must pass. */
function accountEndpointMatrix(
  name: string,
  handler: Handler,
  init: CallInit = {},
  /**
   * What a valid account past every gate gets. 200 for a read of one's own
   * data; an endpoint whose target doesn't exist for a fresh account answers
   * its own 4xx from the handler (Pitch 21e), which still proves the gates
   * let it through.
   */
  servedStatus = 200,
) {
  describe(`${name}: authentication, suspension, version`, () => {
    it("no token, a malformed header, and a rejected token are a JSON 401", async () => {
      for (const token of [null, "not-a-token", "rejected.x.y"]) {
        const r = await call(handler, {
          ...init,
          token,
        });
        expect([token, r.status, r.body?.error?.code]).toEqual([
          token,
          401,
          "unauthorized",
        ]);
        expect(r.headers.get("location")).toBeNull();
        expect(r.headers.get("cache-control")).toBe("no-store");
      }
    });

    it("an unreachable Auth server is a 503, not a sign-out", async () => {
      const r = await call(handler, {
        ...init,
        token: "down.x.y",
      });
      expect(r.status).toBe(503);
    });

    it("a verified user with no profile is 401, and no profile is created", async () => {
      const ghost = randomUUID();
      const r = await call(handler, {
        ...init,
        token: tokenFor(ghost),
      });
      expect(r.status).toBe(401);
      expect(
        await getTestPrisma().profile.count({ where: { userId: ghost } }),
      ).toBe(0);
    });

    it("a suspended account is 403 account_suspended, and nothing is recorded", async () => {
      const s = await createTestAccount();
      await suspend(s);
      const before = await snapshotAccount(s.userId);
      const r = await call(handler, {
        ...init,
        token: tokenFor(s.userId),
      });
      expect([r.status, r.body.error.code]).toEqual([403, "account_suspended"]);
      expect(await snapshotAccount(s.userId)).toEqual(before);
    });

    it("an old app version is 426 and a missing one is 400, even before the token", async () => {
      const ok = await createTestAccount();
      const old = await call(handler, {
        ...init,
        token: tokenFor(ok.userId),
        version: "1.1.9",
      });
      expect([old.status, old.body.error.code]).toEqual([
        426,
        "upgrade_required",
      ]);
      const none = await call(handler, {
        ...init,
        token: null,
        version: null,
      });
      expect([none.status, none.body.error.code]).toEqual([
        400,
        "validation_error",
      ]);
    });

    it("an app at or above the minimum is served", async () => {
      const ok = await createTestAccount();
      const r = await call(handler, {
        ...init,
        token: tokenFor(ok.userId),
        version: "3.0.0",
      });
      expect(r.status).toBe(servedStatus);
      expect(JSON.parse(JSON.stringify(r.body))).toEqual(r.body);
    });
  });
}

/** A's workout for today's occurrence, started through the API, and its first exercise. */
async function aStartsToday(
  a: Account,
  plan: Awaited<ReturnType<typeof activePlan>>,
) {
  const r = await call(startWorkoutRoute as Handler, {
    token: tokenFor(a.userId),
    json: {
      sessionId: plan.session.id,
      scheduledFor: todayIso(),
      gymId: plan.gym.id,
    },
  });
  expect(r.status).toBe(200);
  const loggedSessionId = r.body.loggedSessionId as string;
  const first = await getTestPrisma().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
  });
  return { loggedSessionId, loggedExerciseId: first.id };
}

const loggedSessionCount = (userId: string) =>
  getTestPrisma().loggedSession.count({ where: { userId } });

/** Pitch 21e: the workout endpoints (spec §11, isolation cases E1–E4). */
const WORKOUT_CASES: Record<string, () => void> = {
  "PUT api/mobile/v1/mesocycles/[mesocycleId]/missed-days/[missedOn]": () => {
    accountEndpointMatrix(
      "PUT /mesocycles/{id}/missed-days/{date}",
      resolveMissedDayRoute as Handler,
      {
        method: "PUT",
        json: { outcome: "skipped" },
        params: { mesocycleId: randomUUID(), missedOn: "2026-01-05" },
      },
      // A fresh account has no such block: the resolver's own 404.
      404,
    );
    describe("PUT /mesocycles/{id}/missed-days/{date}: isolation and retry", () => {
      /** A fresh account whose block started last week: last week's day is missed. */
      async function withMissedDay(label: string) {
        const account = await createTestAccount();
        const plan = await activePlan(account, lib, label, {
          startWeeksAgo: 1,
        });
        return { account, plan, missedOn: addDays(todayIso(), -7) };
      }
      const put = (
        token: string,
        mesocycleId: string,
        missedOn: string,
        outcome: unknown = "skipped",
      ) =>
        call(resolveMissedDayRoute as Handler, {
          token,
          method: "PUT",
          json: { outcome, userId: undefined },
          params: { mesocycleId, missedOn },
        });

      it("B can't resolve A's missed day: a 404 like a missing block, nothing written", async () => {
        const a = await withMissedDay("Alpha");
        const b = await createTestAccount();
        const aSnap = await snapshotAccount(a.account.userId);
        const missing = await put(tokenFor(b.userId), randomUUID(), a.missedOn);
        for (const outcome of ["skipped", "shifted"]) {
          const r = await call(resolveMissedDayRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            // An account id in the body is ignored: the token decides.
            json: { outcome, userId: a.account.userId },
            params: { mesocycleId: a.plan.meso.id, missedOn: a.missedOn },
          });
          expect([r.status, r.body]).toEqual([missing.status, missing.body]);
          expect(r.status).toBe(404);
          for (const marker of aMarkers(a.account, a.plan))
            expect(r.text).not.toContain(marker);
        }
        expect(await snapshotAccount(a.account.userId)).toEqual(aSnap);
        expect(
          await getTestPrisma().missedDayResolution.count({
            where: { userId: { in: [a.account.userId, b.userId] } },
          }),
        ).toBe(0);
        // A's Today still asks about its own missed day.
        const aToday = await call(today as Handler, {
          token: tokenFor(a.account.userId),
        });
        expect((aToday.body as TodayDto).dashboard.kind).toBe("missed_day");
      });

      it("A resolves its own day once; B's resolution of its own block never touches A", async () => {
        const a = await withMissedDay("Alpha");
        const b = await withMissedDay("Bravo");
        const r = await put(
          tokenFor(a.account.userId),
          a.plan.meso.id,
          a.missedOn,
        );
        expect(r.status).toBe(200);
        const again = await put(
          tokenFor(a.account.userId),
          a.plan.meso.id,
          a.missedOn,
        );
        expect(again.body).toEqual(r.body);
        const conflict = await put(
          tokenFor(a.account.userId),
          a.plan.meso.id,
          a.missedOn,
          "shifted",
        );
        expect([conflict.status, conflict.body.error.code]).toEqual([
          409,
          "conflict",
        ]);
        const aSnap = await snapshotAccount(a.account.userId);
        const bR = await put(
          tokenFor(b.account.userId),
          b.plan.meso.id,
          b.missedOn,
          "shifted",
        );
        expect(bR.status).toBe(200);
        expect(await snapshotAccount(a.account.userId)).toEqual(aSnap);
        const rows = await getTestPrisma().missedDayResolution.findMany({
          where: { userId: { in: [a.account.userId, b.account.userId] } },
          select: { userId: true, mesocycleId: true, outcome: true },
        });
        expect(rows).toHaveLength(2);
        expect(rows).toEqual(
          expect.arrayContaining([
            {
              userId: a.account.userId,
              mesocycleId: a.plan.meso.id,
              outcome: "skipped",
            },
            {
              userId: b.account.userId,
              mesocycleId: b.plan.meso.id,
              outcome: "shifted",
            },
          ]),
        );
      });
    });
  },

  "GET api/mobile/v1/history": () => {
    accountEndpointMatrix("GET /history", historyWeekRoute as Handler);
    describe("GET /history: isolation", () => {
      it("B sees none of A's weeks, even on A's dates", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const weeks = [
          undefined,
          `week=${addDays(todayIso(), -7)}`,
          `week=${addDays(todayIso(), -14)}`,
        ];
        for (const query of weeks) {
          const r = await call(historyWeekRoute as Handler, {
            token: tokenFor(b.userId),
            query,
          });
          expect(r.status).toBe(200);
          const week = r.body as HistoryWeekDto;
          expect(week.hasAnyHistory).toBe(false);
          expect(week.earlierBlocks).toEqual([]);
          for (const marker of aMarkers(a, plan))
            expect(r.text).not.toContain(marker);
        }
      });

      it("A reaches its own earlier weeks", async () => {
        const { a } = await twoAccounts(lib);
        const r = await call(historyWeekRoute as Handler, {
          token: tokenFor(a.userId),
          query: `week=${addDays(todayIso(), -14)}`,
        });
        const week = r.body as HistoryWeekDto;
        expect(week.hasAnyHistory).toBe(true);
        expect(r.text).toContain("Alpha Push");
      });
    });
  },

  "GET api/mobile/v1/history/[loggedSessionId]": () => {
    accountEndpointMatrix(
      "GET /history/{id}",
      historyWorkoutRoute as Handler,
      { params: { loggedSessionId: randomUUID() } },
      404,
    );
    describe("GET /history/{id}: isolation and gating", () => {
      it("another account's logged workout is a 404, like a missing one", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const done = await getTestPrisma().loggedSession.findFirstOrThrow({
          where: { userId: a.userId, status: "complete" },
        });
        const missing = await call(historyWorkoutRoute as Handler, {
          token: tokenFor(b.userId),
          params: { loggedSessionId: randomUUID() },
        });
        const r = await call(historyWorkoutRoute as Handler, {
          token: tokenFor(b.userId),
          params: { loggedSessionId: done.id },
        });
        expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        expect(r.status).toBe(404);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
      });

      it("A reads its own sets; a Free account's summary is locked", async () => {
        const { a } = await twoAccounts(lib);
        // The later finished workout: the first gives it a call to make.
        const done = await getTestPrisma().loggedSession.findFirstOrThrow({
          where: { userId: a.userId, status: "complete" },
          orderBy: { scheduledFor: "desc" },
        });
        const read = async () =>
          (
            await call(historyWorkoutRoute as Handler, {
              token: tokenFor(a.userId),
              params: { loggedSessionId: done.id },
            })
          ).body as LoggedWorkoutDetailViewDto;
        const pro = await read();
        expect(pro.detail.loggedSessionId).toBe(done.id);
        expect(pro.detail.exercises.every((e) => e.sets.length > 0)).toBe(true);
        expect(pro.summary?.locked ?? null).toBeNull();
        await getTestPrisma().entitlement.deleteMany({
          where: { userId: a.userId },
        });
        const free = await read();
        expect(free.detail).toEqual(pro.detail);
        // The gate's own rule: nothing Pro on a Free account, and `locked`
        // names the capability whenever the Pro summary held a call.
        for (const e of free.summary?.exercises ?? []) {
          expect(e.tag).toBeNull();
          expect(e.recommendation).toBeNull();
        }
        const proHadCalls = (pro.summary?.exercises ?? []).some(
          (e) => e.tag !== null || e.recommendation !== null,
        );
        expect(proHadCalls).toBe(true);
        expect(free.summary?.locked).toBe("progression_insights");
      });
    });
  },

  "POST api/mobile/v1/workouts": () => {
    accountEndpointMatrix(
      "POST /workouts",
      startWorkoutRoute as Handler,
      {
        method: "POST",
        json: {
          sessionId: randomUUID(),
          scheduledFor: "2026-01-05",
          gymId: randomUUID(),
        },
      },
      // A fresh account has no such gym: the start rule's own refusal.
      400,
    );
    describe("POST /workouts: isolation and retry", () => {
      it("B can't start A's session, even with its own gym; nothing is created", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        const r = await call(startWorkoutRoute as Handler, {
          token: tokenFor(b.userId),
          json: {
            sessionId: plan.session.id,
            scheduledFor: todayIso(),
            gymId: bGym.id,
            userId: a.userId,
          },
        });
        expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
        expect(await loggedSessionCount(b.userId)).toBe(0);
      });

      it("A can't start with B's gym: it reads as unavailable", async () => {
        const { a, plan, bGym } = await twoAccounts(lib);
        const before = await loggedSessionCount(a.userId);
        const r = await call(startWorkoutRoute as Handler, {
          token: tokenFor(a.userId),
          json: {
            sessionId: plan.session.id,
            scheduledFor: todayIso(),
            gymId: bGym.id,
          },
        });
        expect([r.status, r.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        expect(await loggedSessionCount(a.userId)).toBe(before);
      });

      it("starting twice returns the same workout and creates one", async () => {
        const { a, plan } = await twoAccounts(lib);
        const before = await loggedSessionCount(a.userId);
        const first = await aStartsToday(a, plan);
        const again = await aStartsToday(a, plan);
        expect(again.loggedSessionId).toBe(first.loggedSessionId);
        expect(await loggedSessionCount(a.userId)).toBe(before + 1);
      });
    });
  },

  "GET api/mobile/v1/workouts/[loggedSessionId]": () => {
    accountEndpointMatrix(
      "GET /workouts/{id}",
      getWorkoutRoute as Handler,
      { params: { loggedSessionId: randomUUID() } },
      404,
    );
    describe("GET /workouts/{id}: isolation and gating", () => {
      it("another account's workout is a 404 with nothing of A's", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const { loggedSessionId } = await aStartsToday(a, plan);
        const missing = await call(getWorkoutRoute as Handler, {
          token: tokenFor(b.userId),
          params: { loggedSessionId: randomUUID() },
        });
        const r = await call(getWorkoutRoute as Handler, {
          token: tokenFor(b.userId),
          params: { loggedSessionId },
        });
        // Indistinguishable from a workout that doesn't exist.
        expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        expect(r.status).toBe(404);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
      });

      it("A reads its own; a Free account's card calls are locked", async () => {
        const { a, plan } = await twoAccounts(lib);
        const { loggedSessionId } = await aStartsToday(a, plan);
        const pro = (
          await call(getWorkoutRoute as Handler, {
            token: tokenFor(a.userId),
            params: { loggedSessionId },
          })
        ).body as WorkoutViewDto;
        expect(pro.workout.loggedSessionId).toBe(loggedSessionId);
        expect(pro.workout.status).toBe("in_progress");
        await getTestPrisma().entitlement.deleteMany({
          where: { userId: a.userId },
        });
        const free = (
          await call(getWorkoutRoute as Handler, {
            token: tokenFor(a.userId),
            params: { loggedSessionId },
          })
        ).body as WorkoutViewDto;
        // Capture is Free: the same workout and card weights.
        expect(free.workout).toEqual(pro.workout);
        for (const { progression } of free.progression) {
          expect(progression.tag).toBeNull();
          expect(progression.recommendation).toBeNull();
        }
        expect(
          free.progression.some(
            (p) => p.progression.locked === "progression_insights",
          ),
        ).toBe(true);
      });
    });
  },

  "PUT api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]":
    () => {
      accountEndpointMatrix(
        "PUT /logged-exercises/{id}/sets/{n}",
        putSetRoute as Handler,
        {
          method: "PUT",
          json: { weightLbs: 135, reps: 5 },
          params: { loggedExerciseId: randomUUID(), setNumber: "1" },
        },
        404,
      );
      describe("PUT /logged-exercises/{id}/sets/{n}: isolation and retry", () => {
        it("B can't log into A's workout; A's history is unchanged", async () => {
          const { a, b, plan } = await twoAccounts(lib);
          const { loggedExerciseId } = await aStartsToday(a, plan);
          const aSnap = await snapshotAccount(a.userId);
          const r = await call(putSetRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            json: { weightLbs: 135, reps: 5, userId: a.userId },
            params: { loggedExerciseId, setNumber: "1" },
          });
          expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
          expect(await snapshotAccount(a.userId)).toEqual(aSnap);
          expect(
            await getTestPrisma().loggedSet.count({
              where: { userId: b.userId },
            }),
          ).toBe(0);
        });

        it("an identical re-send is the same set; different values are a 409", async () => {
          const { a, plan } = await twoAccounts(lib);
          const { loggedExerciseId } = await aStartsToday(a, plan);
          const send = (json: unknown) =>
            call(putSetRoute as Handler, {
              token: tokenFor(a.userId),
              method: "PUT",
              json,
              params: { loggedExerciseId, setNumber: "1" },
            });
          const first = await send({ weightLbs: 137.5, reps: 5 });
          expect(first.status).toBe(200);
          const set = first.body as LoggedSetDto;
          expect(set).toMatchObject({
            loggedExerciseId,
            setNumber: 1,
            weightLbs: 137.5,
            reps: 5,
            rir: null,
          });
          const replay = await send({ weightLbs: 137.5, reps: 5 });
          expect([replay.status, (replay.body as LoggedSetDto).id]).toEqual([
            200,
            set.id,
          ]);
          const different = await send({ weightLbs: 140, reps: 5 });
          expect([different.status, different.body.error.code]).toEqual([
            409,
            "conflict",
          ]);
          const stored = await getTestPrisma().loggedSet.findMany({
            where: { loggedExerciseId },
          });
          expect(stored.map((s) => [s.setNumber, Number(s.weightLbs)])).toEqual(
            [[1, 137.5]],
          );
        });
      });
    },

  "POST api/mobile/v1/workouts/[loggedSessionId]/complete": () => {
    accountEndpointMatrix(
      "POST /workouts/{id}/complete",
      completeWorkoutRoute as Handler,
      { method: "POST", params: { loggedSessionId: randomUUID() } },
      404,
    );
    describe("POST /workouts/{id}/complete: isolation and retry", () => {
      it("B can't finish A's workout; finishing twice keeps the first finish", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const { loggedSessionId, loggedExerciseId } = await aStartsToday(
          a,
          plan,
        );
        await call(putSetRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          json: { weightLbs: 135, reps: 5 },
          params: { loggedExerciseId, setNumber: "1" },
        });
        const byB = await call(completeWorkoutRoute as Handler, {
          token: tokenFor(b.userId),
          method: "POST",
          params: { loggedSessionId },
        });
        expect([byB.status, byB.body.error.code]).toEqual([404, "not_found"]);
        const status = () =>
          getTestPrisma().loggedSession.findUniqueOrThrow({
            where: { id: loggedSessionId },
            select: { status: true, completedAt: true },
          });
        expect((await status()).status).toBe("in_progress");

        const done = await call(completeWorkoutRoute as Handler, {
          token: tokenFor(a.userId),
          method: "POST",
          params: { loggedSessionId },
        });
        expect([done.status, done.body]).toEqual([
          200,
          { loggedSessionId, status: "complete" },
        ]);
        const first = await status();
        const again = await call(completeWorkoutRoute as Handler, {
          token: tokenFor(a.userId),
          method: "POST",
          params: { loggedSessionId },
        });
        expect(again.status).toBe(200);
        expect(await status()).toEqual(first);
      });
    });
  },
};

/**
 * Pitch 21f: the logging-completeness endpoints (spec §12, isolation cases
 * E8–E15). For every write, B naming A's record must get exactly what it gets
 * for a record that doesn't exist, and A's rows must not change.
 */
async function expectLikeMissing(
  a: Account,
  plan: Awaited<ReturnType<typeof activePlan>>,
  foreign: () => ReturnType<typeof call>,
  missing: () => ReturnType<typeof call>,
) {
  const aSnap = await snapshotAccount(a.userId);
  const m = await missing();
  const r = await foreign();
  expect([r.status, r.body]).toEqual([m.status, m.body]);
  expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
  for (const marker of aMarkers(a, plan)) expect(r.text).not.toContain(marker);
  expect(await snapshotAccount(a.userId)).toEqual(aSnap);
}

/** One of A's finished sets (twoAccounts logs two full workouts). */
const aLoggedSet = (a: Account) =>
  getTestPrisma().loggedSet.findFirstOrThrow({
    where: { userId: a.userId },
    orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }],
  });

const LOGGING_CASES: Record<string, () => void> = {
  "PUT api/mobile/v1/workouts/[loggedSessionId]/gym": () => {
    accountEndpointMatrix(
      "PUT /workouts/{id}/gym",
      changeGymRoute as Handler,
      {
        method: "PUT",
        json: { gymId: randomUUID() },
        params: { loggedSessionId: randomUUID() },
      },
      404,
    );
    describe("PUT /workouts/{id}/gym: isolation", () => {
      it("B can't change the gym of A's workout, even to its own gym", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const { loggedSessionId } = await aStartsToday(a, plan);
        const put = (id: string) =>
          call(changeGymRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            json: { gymId: bGym.id, userId: a.userId },
            params: { loggedSessionId: id },
          });
        await expectLikeMissing(
          a,
          plan,
          () => put(loggedSessionId),
          () => put(randomUUID()),
        );
      });

      it("A can't move its workout to B's gym: it reads as unavailable", async () => {
        const { a, plan, bGym } = await twoAccounts(lib);
        const { loggedSessionId } = await aStartsToday(a, plan);
        const aSnap = await snapshotAccount(a.userId);
        const put = (gymId: string) =>
          call(changeGymRoute as Handler, {
            token: tokenFor(a.userId),
            method: "PUT",
            json: { gymId },
            params: { loggedSessionId },
          });
        const missing = await put(randomUUID());
        const foreign = await put(bGym.id);
        expect([foreign.status, foreign.body]).toEqual([
          missing.status,
          missing.body,
        ]);
        expect([foreign.status, foreign.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
      });
    });
  },

  "GET api/mobile/v1/logged-exercises/[loggedExerciseId]/swap-candidates":
    () => {
      accountEndpointMatrix(
        "GET /logged-exercises/{id}/swap-candidates",
        swapCandidatesRoute as Handler,
        { params: { loggedExerciseId: randomUUID() } },
        404,
      );
      describe("GET /logged-exercises/{id}/swap-candidates: isolation", () => {
        it("another account's exercise occurrence is a 404 with nothing of A's", async () => {
          const { a, b, plan } = await twoAccounts(lib);
          const { loggedExerciseId } = await aStartsToday(a, plan);
          const get = (id: string) =>
            call(swapCandidatesRoute as Handler, {
              token: tokenFor(b.userId),
              params: { loggedExerciseId: id },
            });
          await expectLikeMissing(
            a,
            plan,
            () => get(loggedExerciseId),
            () => get(randomUUID()),
          );
        });

        it("lists the library and the account's own exercises, never another account's", async () => {
          const { a, b, plan } = await twoAccounts(lib);
          const bCustom = await createCustomExercise(b, {
            name: "Bravo Secret Press",
            primaryMuscle: "chest",
            equipmentType: "other",
          });
          const { loggedExerciseId } = await aStartsToday(a, plan);
          const r = await call(swapCandidatesRoute as Handler, {
            token: tokenFor(a.userId),
            params: { loggedExerciseId },
            query: "muscle=chest",
          });
          expect(r.status).toBe(200);
          const ctx = r.body as SwapContextDto;
          const ids = ctx.candidates.map((c) => c.id);
          expect(ids).toContain(plan.custom.id);
          expect(ids).toContain(lib.incline.id);
          expect(ids).not.toContain(bCustom.id);
          expect(r.text).not.toContain("Bravo Secret Press");
        });
      });
    },

  "PUT api/mobile/v1/logged-exercises/[loggedExerciseId]/exercise": () => {
    accountEndpointMatrix(
      "PUT /logged-exercises/{id}/exercise",
      swapExerciseRoute as Handler,
      {
        method: "PUT",
        json: { newExerciseId: randomUUID() },
        params: { loggedExerciseId: randomUUID() },
      },
      404,
    );
    describe("PUT /logged-exercises/{id}/exercise: isolation", () => {
      it("B can't swap A's exercise", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const { loggedExerciseId } = await aStartsToday(a, plan);
        const put = (id: string) =>
          call(swapExerciseRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            json: { newExerciseId: lib.incline.id, userId: a.userId },
            params: { loggedExerciseId: id },
          });
        await expectLikeMissing(
          a,
          plan,
          () => put(loggedExerciseId),
          () => put(randomUUID()),
        );
      });

      it("A can't swap to B's custom exercise: it reads as unavailable", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const bCustom = await createCustomExercise(b, {
          name: "Bravo Secret Press",
          primaryMuscle: "chest",
          equipmentType: "other",
        });
        const { loggedExerciseId } = await aStartsToday(a, plan);
        const aSnap = await snapshotAccount(a.userId);
        const put = (newExerciseId: string) =>
          call(swapExerciseRoute as Handler, {
            token: tokenFor(a.userId),
            method: "PUT",
            json: { newExerciseId },
            params: { loggedExerciseId },
          });
        const missing = await put(randomUUID());
        const foreign = await put(bCustom.id);
        expect([foreign.status, foreign.body]).toEqual([
          missing.status,
          missing.body,
        ]);
        expect(foreign.status).toBe(400);
        expect(foreign.text).not.toContain("Bravo");
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
      });
    });
  },

  "PUT api/mobile/v1/logged-exercises/[loggedExerciseId]/skipped": () => {
    accountEndpointMatrix(
      "PUT /logged-exercises/{id}/skipped",
      setSkippedRoute as Handler,
      {
        method: "PUT",
        json: { skipped: true },
        params: { loggedExerciseId: randomUUID() },
      },
      404,
    );
    describe("PUT /logged-exercises/{id}/skipped: isolation", () => {
      it("B can't mark A's exercise not done, or undo it", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const { loggedExerciseId } = await aStartsToday(a, plan);
        for (const skipped of [true, false]) {
          const put = (id: string) =>
            call(setSkippedRoute as Handler, {
              token: tokenFor(b.userId),
              method: "PUT",
              json: { skipped, userId: a.userId },
              params: { loggedExerciseId: id },
            });
          await expectLikeMissing(
            a,
            plan,
            () => put(loggedExerciseId),
            () => put(randomUUID()),
          );
        }
      });
    });
  },

  "PATCH api/mobile/v1/logged-exercises/[loggedExerciseId]/planned-sets":
    () => {
      accountEndpointMatrix(
        "PATCH /logged-exercises/{id}/planned-sets",
        plannedSetsRoute as Handler,
        {
          method: "PATCH",
          json: { plannedSets: 1 },
          params: { loggedExerciseId: randomUUID() },
        },
        404,
      );
      describe("PATCH /logged-exercises/{id}/planned-sets: isolation", () => {
        it("B can't lower the planned sets of A's logged exercise", async () => {
          const { a, b, plan } = await twoAccounts(lib);
          const le = await getTestPrisma().loggedExercise.findFirstOrThrow({
            where: { userId: a.userId },
          });
          const patch = (id: string) =>
            call(plannedSetsRoute as Handler, {
              token: tokenFor(b.userId),
              method: "PATCH",
              json: { plannedSets: 1, userId: a.userId },
              params: { loggedExerciseId: id },
            });
          await expectLikeMissing(
            a,
            plan,
            () => patch(le.id),
            () => patch(randomUUID()),
          );
        });
      });
    },

  "PATCH api/mobile/v1/sets/[loggedSetId]": () => {
    accountEndpointMatrix(
      "PATCH /sets/{id}",
      editSetRoute as Handler,
      {
        method: "PATCH",
        json: { weightLbs: 100, reps: 5 },
        params: { loggedSetId: randomUUID() },
      },
      404,
    );
    describe("PATCH /sets/{id}: isolation", () => {
      it("B can't correct A's logged set: a 404 like a missing set, nothing changed", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const set = await aLoggedSet(a);
        const patch = (id: string) =>
          call(editSetRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PATCH",
            json: { weightLbs: 999, reps: 1, rir: 0, userId: a.userId },
            params: { loggedSetId: id },
          });
        await expectLikeMissing(
          a,
          plan,
          () => patch(set.id),
          () => patch(randomUUID()),
        );
        expect(
          await getTestPrisma().loggedSet.count({
            where: { userId: b.userId },
          }),
        ).toBe(0);
      });

      it("A corrects its own set, and a Free account can too", async () => {
        const { a } = await twoAccounts(lib);
        const set = await aLoggedSet(a);
        await getTestPrisma().entitlement.deleteMany({
          where: { userId: a.userId },
        });
        const r = await call(editSetRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PATCH",
          json: { weightLbs: 140, reps: 6 },
          params: { loggedSetId: set.id },
        });
        expect(r.status).toBe(200);
        expect(r.body as LoggedSetDto).toMatchObject({
          id: set.id,
          weightLbs: 140,
          reps: 6,
        });
      });
    });
  },

  "PUT api/mobile/v1/mesocycles/[mesocycleId]/cardio-logs/[scheduledFor]":
    () => {
      accountEndpointMatrix(
        "PUT /mesocycles/{id}/cardio-logs/{date}",
        logCardioRoute as Handler,
        {
          method: "PUT",
          json: { type: "Incline walk", durationMin: 20 },
          params: { mesocycleId: randomUUID(), scheduledFor: "2026-01-05" },
        },
        404,
      );
      describe("PUT /mesocycles/{id}/cardio-logs/{date}: isolation and retry", () => {
        const put = (
          token: string,
          mesocycleId: string,
          json: unknown = { type: "Incline walk", durationMin: 25 },
        ) =>
          call(logCardioRoute as Handler, {
            token,
            method: "PUT",
            json,
            params: { mesocycleId, scheduledFor: todayIso() },
          });
        const cardioCount = (userId: string) =>
          getTestPrisma().cardioLog.count({ where: { userId } });

        it("B can't log A's planned cardio: a 404 like a missing block, no record", async () => {
          const { a, b, plan } = await twoAccounts(lib);
          await expectLikeMissing(
            a,
            plan,
            () =>
              put(tokenFor(b.userId), plan.meso.id, {
                type: "Incline walk",
                durationMin: 25,
                userId: a.userId,
              }),
            () => put(tokenFor(b.userId), randomUUID()),
          );
          expect(await cardioCount(a.userId)).toBe(0);
          expect(await cardioCount(b.userId)).toBe(0);
        });

        it("A logs its own once; a repeat returns the stored record", async () => {
          const { a, plan } = await twoAccounts(lib);
          const first = await put(tokenFor(a.userId), plan.meso.id);
          expect([first.status, first.body.alreadyLogged]).toEqual([
            200,
            false,
          ]);
          const again = await put(tokenFor(a.userId), plan.meso.id, {
            type: "Bike",
            durationMin: 99,
          });
          expect(again.body).toEqual({
            cardioLogId: first.body.cardioLogId,
            alreadyLogged: true,
          });
          expect(await cardioCount(a.userId)).toBe(1);
        });
      });
    },

  "PATCH api/mobile/v1/cardio-logs/[cardioLogId]": () => {
    accountEndpointMatrix(
      "PATCH /cardio-logs/{id}",
      editCardioRoute as Handler,
      {
        method: "PATCH",
        json: { type: "Bike", durationMin: 30 },
        params: { cardioLogId: randomUUID() },
      },
      404,
    );
    describe("PATCH /cardio-logs/{id}: isolation", () => {
      it("B can't correct A's cardio record", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const { cardioLogId } = await logCardio(a, {
          mesocycleId: plan.meso.id,
          scheduledFor: todayIso(),
          type: "Incline walk",
          durationMin: 20,
        });
        const patch = (id: string) =>
          call(editCardioRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PATCH",
            json: { type: "Stolen", durationMin: 1, userId: a.userId },
            params: { cardioLogId: id },
          });
        await expectLikeMissing(
          a,
          plan,
          () => patch(cardioLogId),
          () => patch(randomUUID()),
        );
      });
    });
  },
};

const CASES: Record<string, () => void> = {
  "GET api/mobile/v1/app-config": () =>
    describe("GET /app-config", () => {
      it("is public, never version-gated, and carries no secret", async () => {
        const r = await call(appConfig as Handler, {
          token: null,
          version: "0.0.1",
        });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({
          minimumAppVersion: "1.2.0",
          latestAppVersion: "1.2.0",
          killSwitches: {
            planImportEnabled: expect.any(Boolean),
            maintenance: expect.any(Boolean),
          },
          signupMode: expect.stringMatching(/^(public|closed)$/),
          // Pitch 21d: public widget key and web origin only, or null.
          botChallenge: mobileBotChallenge(),
        });
      });
    }),

  "GET api/mobile/v1/me": () => {
    accountEndpointMatrix("GET /me", me as Handler);
    describe("GET /me: isolation", () => {
      it("is the token's account only, with its verified email", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const r = await call(me as Handler, { token: tokenFor(b.userId) });
        const body = r.body as MeDto;
        expect(r.status).toBe(200);
        expect(body.email).toBe(`${b.userId}@example.test`);
        for (const marker of [...aMarkers(a, plan), `${a.userId}@example.test`])
          expect(r.text).not.toContain(marker);
        expect(Object.keys(body).sort()).toEqual(
          [
            "appearance",
            "email",
            "emailVerified",
            "entitlement",
            "profile",
            "tour",
            "trialNotice",
            "whatsNew",
          ].sort(),
        );
      });
    });
  },

  "GET api/mobile/v1/today": () => {
    accountEndpointMatrix("GET /today", today as Handler);
    describe("GET /today: isolation and gating", () => {
      it("B sees none of A's plan, calls, history, or goals", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        const r = await call(today as Handler, { token: tokenFor(b.userId) });
        const body = r.body as TodayDto;
        expect(r.status).toBe(200);
        expect(body.dashboard).toEqual({ kind: "no_plan" });
        expect(body.goals).toEqual({ reached: [], active: [], activeTotal: 0 });
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
        // B's read changed nothing of A's.
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
      });

      it("A (Pro) gets its own calls; a Free account gets them locked", async () => {
        const { a } = await twoAccounts(lib);
        const pro = (
          await call(today as Handler, { token: tokenFor(a.userId) })
        ).body as TodayDto;
        expect(pro.dashboard.kind).toBe("pending");
        expect(pro.plannedProgression.length).toBe(2);
        expect(
          pro.plannedProgression.every((p) => p.progression.locked === null),
        ).toBe(true);
        expect(
          pro.plannedProgression.some(
            (p) => p.progression.recommendation !== null,
          ),
        ).toBe(true);

        // The same history with the comp revoked: Free.
        await getTestPrisma().entitlement.deleteMany({
          where: { userId: a.userId },
        });
        const free = (
          await call(today as Handler, { token: tokenFor(a.userId) })
        ).body as TodayDto;
        expect(free.plannedProgression.length).toBe(2);
        for (const { progression } of free.plannedProgression) {
          expect(progression.tag).toBeNull();
          expect(progression.suggestion).toBeNull();
          expect(progression.recommendation).toBeNull();
        }
        expect(
          free.plannedProgression.some(
            (p) => p.progression.locked === "progression_insights",
          ),
        ).toBe(true);
      });

      it("today is the account's own calendar date", async () => {
        const k = await createTestAccount("Pacific/Kiritimati");
        const r = await call(today as Handler, { token: tokenFor(k.userId) });
        expect((r.body as TodayDto).today).toBe(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Pacific/Kiritimati",
          }).format(new Date()),
        );
      });
    });
  },

  // Pitch 21h: the plan (read-only).
  "GET api/mobile/v1/plan": () => {
    accountEndpointMatrix("GET /plan", planRoute as Handler);
    describe("GET /plan: isolation", () => {
      it("B sees its own (empty) plan and nothing of A's, at any week", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        for (const query of [undefined, "week=1", "week=2"]) {
          const rb = await call(planRoute as Handler, {
            token: tokenFor(b.userId),
            query,
          });
          expect(rb.status).toBe(200);
          expect((rb.body as PlanOverviewDto).block).toBeNull();
          for (const marker of aMarkers(a, plan))
            expect(rb.text).not.toContain(marker);
        }
        const ra = await call(planRoute as Handler, {
          token: tokenFor(a.userId),
        });
        expect((ra.body as PlanOverviewDto).block?.summary.id).toBe(
          plan.meso.id,
        );
      });

      it("a Free account gets the same plan as Pro, with no progression field", async () => {
        const { a } = await twoAccounts(lib);
        const free = await createTestAccount("UTC", undefined, {
          entitlement: "none",
        });
        await activePlan(free, lib, "Free", { startWeeksAgo: 2 });
        for (const account of [a, free]) {
          const r = await call(planRoute as Handler, {
            token: tokenFor(account.userId),
          });
          expect(r.status).toBe(200);
          expect(r.text).not.toMatch(
            /"(progression|recommendation|locked|tag|e1rm|evidence)"/i,
          );
        }
      });
    });
  },
  "GET api/mobile/v1/mesocycles/[mesocycleId]/sessions/[sessionId]": () => {
    accountEndpointMatrix(
      "GET /mesocycles/{id}/sessions/{id}",
      planSessionRoute as Handler,
      { params: { mesocycleId: randomUUID(), sessionId: randomUUID() } },
      404,
    );
    describe("GET /mesocycles/{id}/sessions/{id}: isolation", () => {
      it("B can't read A's session, even mixing in its own block: a 404 like a missing one", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const own = await activePlan(b, lib, "Bravo");
        const missing = await call(planSessionRoute as Handler, {
          token: tokenFor(b.userId),
          params: { mesocycleId: randomUUID(), sessionId: randomUUID() },
        });
        for (const params of [
          { mesocycleId: plan.meso.id, sessionId: plan.session.id },
          { mesocycleId: own.meso.id, sessionId: plan.session.id },
          { mesocycleId: plan.meso.id, sessionId: own.session.id },
        ]) {
          const r = await call(planSessionRoute as Handler, {
            token: tokenFor(b.userId),
            params,
          });
          expect([r.status, r.body]).toEqual([missing.status, missing.body]);
          for (const marker of aMarkers(a, plan))
            expect(r.text).not.toContain(marker);
        }
        const ra = await call(planSessionRoute as Handler, {
          token: tokenFor(a.userId),
          params: { mesocycleId: plan.meso.id, sessionId: plan.session.id },
        });
        expect((ra.body as PlanSessionDto).name).toBe("Alpha Push");
      });
    });
  },

  "GET api/mobile/v1/gyms": () => {
    accountEndpointMatrix("GET /gyms", gyms as Handler);
    describe("GET /gyms: isolation", () => {
      it("lists only the token's account's active gyms", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const rb = await call(gyms as Handler, { token: tokenFor(b.userId) });
        expect(rb.body as GymsResponseDto).toEqual({
          gyms: [
            { id: bGym.id, name: "Bravo Garage Gym", address: "B street" },
          ],
        });
        for (const marker of aMarkers(a, plan))
          expect(rb.text).not.toContain(marker);
        const ra = await call(gyms as Handler, { token: tokenFor(a.userId) });
        expect((ra.body as GymsResponseDto).gyms.map((g) => g.id)).toEqual([
          plan.gym.id,
        ]);
      });
    });
  },
  "POST api/mobile/v1/accounts": () =>
    describe("POST /accounts (native signup, Pitch 21d)", () => {
      const form = (n: string) => ({
        firstName: "Native",
        lastName: "Lifter",
        username: `native_${n}`,
        email: `native-${n}@example.com`,
        password: "barbell-315-strong",
        confirmPassword: "barbell-315-strong",
        timeZone: "America/Chicago",
        challengeToken: "turnstile-token",
      });

      it("creates exactly one new account with the web signup's rows and returns its session", async () => {
        const { a, plan } = await twoAccounts(lib);
        const beforeA = await snapshotAccount(a.userId);
        const n = randomUUID().slice(0, 8);
        // A's own token rides along: the new account still comes from Auth.
        const r = await call(signUpRoute as Handler, {
          token: tokenFor(a.userId),
          json: form(n),
          ip: "198.51.100.10",
        });
        expect(r.status).toBe(201);
        const id = authUsers.get(`native-${n}@example.com`)!;
        expect(r.body).toEqual({
          session: {
            accessToken: `access.${id}`,
            refreshToken: `refresh.${id}`,
            expiresAt: 1_900_000_000,
            tokenType: "bearer",
          },
        });
        const db = getTestPrisma();
        expect(
          await db.profile.findUnique({
            where: { userId: id },
            select: { firstName: true, username: true, timeZone: true },
          }),
        ).toEqual({
          firstName: "Native",
          username: `native_${n}`,
          timeZone: "America/Chicago",
        });
        expect(
          await db.entitlement.count({
            where: { userId: id, source: "trial" },
          }),
        ).toBe(1);
        // Nothing about A changed, and the response names nothing of A's.
        expect(await snapshotAccount(a.userId)).toEqual(beforeA);
        for (const marker of aMarkers(a, plan)) {
          expect(r.text).not.toContain(marker);
        }
      });

      it("refuses a missing challenge, a taken email, and bad fields without creating anything", async () => {
        const n = randomUUID().slice(0, 8);
        const before = await getTestPrisma().profile.count();
        const noChallenge = await call(signUpRoute as Handler, {
          json: { ...form(n), challengeToken: undefined },
          ip: "198.51.100.11",
        });
        expect([noChallenge.status, noChallenge.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        const bad = await call(signUpRoute as Handler, {
          json: { ...form(n), username: "admin_x", email: "x@mailinator.com" },
          ip: "198.51.100.11",
        });
        expect([
          bad.status,
          Object.keys(bad.body.error.details).sort(),
        ]).toEqual([400, ["email", "username"]]);
        expect(await getTestPrisma().profile.count()).toBe(before);

        const ok = await call(signUpRoute as Handler, {
          json: form(n),
          ip: "198.51.100.12",
        });
        expect(ok.status).toBe(201);
        const again = await call(signUpRoute as Handler, {
          json: { ...form(n), username: `other_${n}` },
          ip: "198.51.100.12",
        });
        expect([again.status, again.body.error.code]).toEqual([
          409,
          "conflict",
        ]);
      });

      it("is version-gated before any work, and a non-JSON body is a 400", async () => {
        const before = await getTestPrisma().profile.count();
        const old = await call(signUpRoute as Handler, {
          version: "1.1.9",
          json: form(randomUUID().slice(0, 8)),
        });
        expect([old.status, old.body.error.code]).toEqual([
          426,
          "upgrade_required",
        ]);
        const none = await call(signUpRoute as Handler, {
          version: null,
          json: form(randomUUID().slice(0, 8)),
        });
        expect([none.status, none.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        const res = await signUpRoute(
          new Request("http://localhost/api/mobile/v1/accounts", {
            method: "POST",
            headers: { "x-overload-app-version": "1.2.0" },
            body: "firstName=Sam",
          }),
          { params: Promise.resolve({}) } as never,
        );
        expect(res.status).toBe(400);
        expect(await getTestPrisma().profile.count()).toBe(before);
      });
    }),

  "POST api/mobile/v1/password-reset": () =>
    describe("POST /password-reset (Pitch 21d)", () => {
      it("answers identically for an account's email and an unknown one", async () => {
        const n = randomUUID().slice(0, 8);
        await call(signUpRoute as Handler, {
          json: {
            firstName: "Reset",
            lastName: "Me",
            username: `reset_${n}`,
            email: `reset-${n}@example.com`,
            password: "barbell-315-strong",
            confirmPassword: "barbell-315-strong",
            timeZone: "UTC",
            challengeToken: "t",
          },
          ip: "198.51.100.20",
        });
        const known = await call(passwordReset as Handler, {
          json: { email: `reset-${n}@example.com`, challengeToken: "t" },
          ip: "198.51.100.21",
        });
        const unknown = await call(passwordReset as Handler, {
          json: { email: `nobody-${n}@example.com`, challengeToken: "t" },
          ip: "198.51.100.22",
        });
        expect([known.status, known.text]).toEqual([
          unknown.status,
          unknown.text,
        ]);
        expect(known.body).toEqual({ sent: true });
        expect(resetEmails).toContain(`reset-${n}@example.com`);
      });

      it("reports only a malformed email or a missing challenge, and is version-gated", async () => {
        const bad = await call(passwordReset as Handler, {
          json: { email: "nope", challengeToken: "t" },
        });
        expect([bad.status, bad.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        const robot = await call(passwordReset as Handler, {
          json: { email: "a@example.com" },
        });
        expect([robot.status, robot.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        const old = await call(passwordReset as Handler, {
          version: "0.9.0",
          json: { email: "a@example.com", challengeToken: "t" },
        });
        expect(old.status).toBe(426);
      });
    }),

  "PUT api/mobile/v1/me/appearance": () => {
    accountEndpointMatrix("PUT /me/appearance", putAppearance as Handler, {
      method: "PUT",
      json: { appearance: "dark" },
    });
    describe("PUT /me/appearance: isolation", () => {
      it("changes only the token's account", async () => {
        const { a, b } = await twoAccounts(lib);
        const appearance = (userId: string) =>
          getTestPrisma()
            .profile.findUnique({
              where: { userId },
              select: { appearance: true },
            })
            .then((p) => p?.appearance);
        const beforeA = await appearance(a.userId);
        const r = await call(putAppearance as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { appearance: "dark", userId: a.userId },
        });
        expect([r.status, r.body]).toEqual([200, { appearance: "dark" }]);
        expect(await appearance(b.userId)).toBe("dark");
        expect(await appearance(a.userId)).toBe(beforeA);
        // A retry sets the same value again.
        const again = await call(putAppearance as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { appearance: "dark" },
        });
        expect(again.status).toBe(200);
      });

      it("an unknown value is a validation error and changes nothing", async () => {
        const a = await createTestAccount();
        const r = await call(putAppearance as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          json: { appearance: "sepia" },
        });
        expect([r.status, r.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
      });
    });
  },
  ...WORKOUT_CASES,
  ...LOGGING_CASES,
};

// The unknown-path 404, one case per method.
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
  CASES[`${method} api/mobile/[[...path]]`] = () =>
    describe(`${method} unknown /api/mobile path`, () => {
      it("is a JSON 404 with no data, token or not", async () => {
        const { a } = await twoAccounts(lib);
        for (const token of [null, tokenFor(a.userId)]) {
          // The bare /api/mobile path too (optional catch-all): no segments.
          const bare = await catchAll[method](
            new Request("http://localhost/api/mobile", {
              method,
              headers: token ? { authorization: `Bearer ${token}` } : {},
            }),
            { params: Promise.resolve({}) },
          );
          expect(bare.status).toBe(404);
          const res = await catchAll[method](
            new Request("http://localhost/api/mobile/v1/nope", {
              method,
              headers: token ? { authorization: `Bearer ${token}` } : {},
            }),
            { params: Promise.resolve({ path: ["v1", "nope"] }) },
          );
          expect(res.status).toBe(404);
          expect(await res.json()).toEqual({
            error: { code: "not_found", message: expect.any(String) },
          });
        }
      });
    });
}

for (const endpoint of MOBILE_ENDPOINTS) CASES[endpointKey(endpoint)]?.();

describe("endpoint coverage", () => {
  it("every registered endpoint has isolation cases", () => {
    const missing = MOBILE_ENDPOINTS.map(endpointKey).filter((k) => !CASES[k]);
    expect(missing).toEqual([]);
  });
});
