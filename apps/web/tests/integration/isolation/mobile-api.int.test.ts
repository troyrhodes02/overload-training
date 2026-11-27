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
// Pitch 21j: the password re-check before deletion. "right" is every test
// account's password; anything else is wrong.
jest.mock("@/lib/accounts/password", () => ({
  verifyCurrentPassword: async (_email: string, password: string) =>
    password === "right" ? "ok" : "wrong",
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
import {
  GET as gyms,
  POST as createGymRoute,
} from "@/app/api/mobile/v1/gyms/route";
import { PUT as gymArchivedRoute } from "@/app/api/mobile/v1/gyms/[gymId]/archived/route";
import * as catchAll from "@/app/api/mobile/[[...path]]/route";
import { mobileBotChallenge } from "@/lib/api/mobile/version";
import { POST as signUpRoute } from "@/app/api/mobile/v1/accounts/route";
import { POST as passwordReset } from "@/app/api/mobile/v1/password-reset/route";
import { PUT as putAppearance } from "@/app/api/mobile/v1/me/appearance/route";
import { PUT as putTourOutcome } from "@/app/api/mobile/v1/me/tour/outcome/route";
import { POST as postTourOffered } from "@/app/api/mobile/v1/me/tour/offered/route";
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
import { GET as exercisesRoute } from "@/app/api/mobile/v1/exercises/route";
import { GET as exerciseRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/route";
import { POST as createExerciseRoute } from "@/app/api/mobile/v1/exercises/route";
import { PUT as favoriteRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/favorite/route";
import { PUT as exerciseArchivedRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/archived/route";
import type { ExerciseList } from "@overload/shared/contracts/exercises";
import {
  createCustomExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
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
import {
  GET as goalsRoute,
  POST as createGoalRoute,
} from "@/app/api/mobile/v1/goals/route";
import { GET as thisWeekRoute } from "@/app/api/mobile/v1/this-week/route";
import { POST as scheduleSkipRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/schedule/skip/route";
import { POST as scheduleMoveRoute } from "@/app/api/mobile/v1/mesocycles/[mesocycleId]/schedule/move/route";
import { GET as exerciseHistoryRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/history/route";
import { GET as goalFormRoute } from "@/app/api/mobile/v1/exercises/[exerciseId]/goal-form/route";
import { GET as goalHistoryRoute } from "@/app/api/mobile/v1/goals/history/route";
import { GET as goalRoute } from "@/app/api/mobile/v1/goals/[goalId]/route";
import { PUT as goalArchivedRoute } from "@/app/api/mobile/v1/goals/[goalId]/archived/route";
import { PUT as goalAcknowledgedRoute } from "@/app/api/mobile/v1/goals/[goalId]/acknowledged/route";
import type {
  GoalHistoryListDto,
  GoalsOverviewDto,
} from "@overload/shared/contracts/goals";
import { endpointKey, MOBILE_ENDPOINTS } from "../../support/mobile-endpoints";
import { POST as startWingItRoute } from "@/app/api/mobile/v1/wing-it-workouts/route";
import { GET as addCandidatesRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/exercise-candidates/route";
import { PUT as addWingItExerciseRoute } from "@/app/api/mobile/v1/workouts/[loggedSessionId]/exercises/[exerciseId]/route";
import {
  GET as meProfileRoute,
  PUT as meProfileUpdateRoute,
} from "@/app/api/mobile/v1/me/profile/route";
import { GET as mePlanRoute } from "@/app/api/mobile/v1/me/plan/route";
import { GET as releaseNotesRoute } from "@/app/api/mobile/v1/release-notes/route";
import { POST as releaseNotesSeenRoute } from "@/app/api/mobile/v1/me/release-notes/seen/route";
import { GET as meExportRoute } from "@/app/api/mobile/v1/me/export/route";
import { GET as deletionInventoryRoute } from "@/app/api/mobile/v1/me/deletion-inventory/route";
import { POST as deleteAccountRoute } from "@/app/api/mobile/v1/me/delete/route";
import { POST as feedbackRoute } from "@/app/api/mobile/v1/feedback/route";
import { orderedReleaseNotes } from "@overload/shared/release-notes/catalog";
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
  /** Extra request headers, e.g. an Idempotency-Key (Pitch 21h). */
  headers?: Record<string, string>;
  /** A multipart body (Pitch 21j feedback). */
  form?: FormData;
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
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v);
  const hasBody = opts.json !== undefined;
  if (hasBody) headers.set("content-type", "application/json");
  const res = await handler(
    new Request(
      `http://localhost/api/mobile/v1/x${opts.query ? `?${opts.query}` : ""}`,
      {
        method: opts.method ?? (hasBody || opts.form ? "POST" : "GET"),
        headers,
        body: hasBody ? JSON.stringify(opts.json) : opts.form,
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
      for (let n = 1; n <= (le.plannedSets ?? 0); n++) {
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

/** Pitch 21i (spec §12): goals. A's goal is on Incline Bench Press. */
async function goalOf(account: Account) {
  return getTestPrisma().goal.findFirstOrThrow({
    where: { userId: account.userId },
    orderBy: { createdAt: "asc" },
  });
}

/** A goal A's own history (bench 135 × 5, twice) already meets: a reached card. */
async function reachedGoal(a: Account) {
  await createGoal(a, {
    exerciseId: lib.bench.id,
    gymId: null,
    targetWeightLbs: "135",
    targetReps: "5",
  });
  return getTestPrisma().goal.findFirstOrThrow({
    where: { userId: a.userId, exerciseId: lib.bench.id },
  });
}

const GOAL_CASES: Record<string, () => void> = {
  "GET api/mobile/v1/exercises/[exerciseId]/history": () => {
    accountEndpointMatrix(
      "GET /exercises/{id}/history",
      exerciseHistoryRoute as Handler,
      { params: { exerciseId: randomUUID() } },
      404,
    );
    describe("GET /exercises/{id}/history: isolation and gating", () => {
      it("B reads none of A's sessions, records, or goals, even on a shared library lift", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const custom = await call(exerciseHistoryRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: plan.custom.id },
        });
        const missing = await call(exerciseHistoryRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: randomUUID() },
        });
        expect([custom.status, custom.body]).toEqual([
          missing.status,
          missing.body,
        ]);
        // A trained bench twice and has a goal on Incline; B has neither.
        for (const exerciseId of [
          lib.bench.id,
          lib.incline.id,
          lib.chestPress.id,
        ]) {
          const r = await call(exerciseHistoryRoute as Handler, {
            token: tokenFor(b.userId),
            params: { exerciseId },
            query: `scope=${plan.gym.id}`,
          });
          expect(r.status).toBe(200);
          expect(r.body.history.hasHistory).toBe(false);
          expect(r.body.history.sessions.rows).toEqual([]);
          expect(r.body.history.records).toBeNull();
          expect(r.body.goals.active).toBeNull();
          expect(r.body.goals.past).toEqual([]);
          for (const marker of aMarkers(a, plan))
            expect(r.text).not.toContain(marker);
        }
        const own = await call(exerciseHistoryRoute as Handler, {
          token: tokenFor(a.userId),
          params: { exerciseId: lib.bench.id },
        });
        expect(own.body.history.sessions.rows).toHaveLength(2);
      });

      it("a Free account's answer carries no Pro value, and says what was withheld", async () => {
        const { a } = await twoAccounts(lib);
        await getTestPrisma().entitlement.deleteMany({
          where: { userId: a.userId },
        });
        const r = await call(exerciseHistoryRoute as Handler, {
          token: tokenFor(a.userId),
          params: { exerciseId: lib.bench.id },
        });
        expect(r.body.history.sessions.rows).toHaveLength(2);
        expect(r.body.history.trend.e1rm).toBeNull();
        expect(r.body.history.records.bestE1rm).toBeNull();
        expect(r.body.history.records.repRecords).toBeNull();
        expect(r.body.history.locked).not.toBeNull();
      });
    });
  },

  "POST api/mobile/v1/goals": () => {
    accountEndpointMatrix(
      "POST /goals",
      createGoalRoute as Handler,
      {
        json: { exerciseId: randomUUID(), targetWeightLbs: 100, targetReps: 5 },
        headers: { "idempotency-key": "ovl-matrix-key" },
      },
      400,
    );
    describe("POST /goals: isolation and retry", () => {
      it("B can't set a goal on A's custom exercise or at A's gym; A's goals are unchanged", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const before = await snapshotAccount(a.userId);
        const onCustom = await call(createGoalRoute as Handler, {
          token: tokenFor(b.userId),
          json: {
            exerciseId: plan.custom.id,
            targetWeightLbs: 100,
            targetReps: 5,
          },
          headers: { "idempotency-key": `ovl-${randomUUID()}` },
        });
        expect([onCustom.status, onCustom.body.error.details]).toEqual([
          400,
          { exerciseId: "Pick an active exercise." },
        ]);
        const atGym = await call(createGoalRoute as Handler, {
          token: tokenFor(b.userId),
          json: {
            exerciseId: lib.chestPress.id,
            gymId: plan.gym.id,
            targetWeightLbs: 100,
            targetReps: 5,
          },
          headers: { "idempotency-key": `ovl-${randomUUID()}` },
        });
        expect([atGym.status, atGym.body.error.details]).toEqual([
          400,
          { gymId: "Choose the gym this goal is measured at." },
        ]);
        for (const r of [onCustom, atGym])
          for (const marker of aMarkers(a, plan))
            expect(r.text).not.toContain(marker);
        expect(await snapshotAccount(a.userId)).toEqual(before);
        // B's own goal on the same library exercise A has a goal on is fine:
        // one active goal per exercise is per account.
        const own = await call(createGoalRoute as Handler, {
          token: tokenFor(b.userId),
          json: {
            exerciseId: lib.incline.id,
            targetWeightLbs: 275,
            targetReps: 3,
          },
          headers: { "idempotency-key": "ovl-shared-key" },
        });
        expect(own.status).toBe(201);
        // The same key used by A is A's own key: it never replays B's answer.
        const aSame = await call(createGoalRoute as Handler, {
          token: tokenFor(a.userId),
          json: {
            exerciseId: lib.bench.id,
            targetWeightLbs: 300,
            targetReps: 1,
          },
          headers: { "idempotency-key": "ovl-shared-key" },
        });
        expect(aSame.status).toBe(201);
        expect(aSame.body.id).not.toBe(own.body.id);
      });
    });
  },

  "GET api/mobile/v1/exercises/[exerciseId]/goal-form": () => {
    accountEndpointMatrix(
      "GET /exercises/{id}/goal-form",
      goalFormRoute as Handler,
      { params: { exerciseId: randomUUID() } },
    );
    describe("GET /exercises/{id}/goal-form: isolation", () => {
      it("A's custom exercise and A's gyms never reach B's form", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const custom = await call(goalFormRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: plan.custom.id },
        });
        expect([custom.status, custom.body]).toEqual([
          200,
          { kind: "not_found" },
        ]);
        const machine = await call(goalFormRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: lib.chestPress.id },
          query: `gymId=${plan.gym.id}`,
        });
        expect(machine.body).toMatchObject({
          kind: "ok",
          gyms: [{ name: "Bravo Garage Gym" }],
          defaultGymId: expect.not.stringMatching(plan.gym.id),
        });
        // A's active goal on Incline doesn't make it a duplicate for B.
        const incline = await call(goalFormRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: lib.incline.id },
        });
        expect(incline.body.kind).toBe("ok");
        for (const r of [custom, machine, incline])
          for (const marker of aMarkers(a, plan))
            expect(r.text).not.toContain(marker);
      });
    });
  },

  "GET api/mobile/v1/goals": () => {
    accountEndpointMatrix("GET /goals", goalsRoute as Handler);
    describe("GET /goals: isolation", () => {
      it("B sees none of A's goals; A sees its own", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        await reachedGoal(a);
        const rb = await call(goalsRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect([rb.status, rb.body]).toEqual([
          200,
          { reached: [], active: [], historyCount: 0 },
        ]);
        for (const marker of [...aMarkers(a, plan), lib.incline.id])
          expect(rb.text).not.toContain(marker);
        const ra = await call(goalsRoute as Handler, {
          token: tokenFor(a.userId),
        });
        const body = ra.body as GoalsOverviewDto;
        expect(body.active.map((g) => g.exerciseId)).toEqual([lib.incline.id]);
        expect(body.reached.map((g) => g.exerciseId)).toEqual([lib.bench.id]);
        expect(body.historyCount).toBe(1);
      });
    });
  },

  "GET api/mobile/v1/goals/history": () => {
    accountEndpointMatrix("GET /goals/history", goalHistoryRoute as Handler);
    describe("GET /goals/history: isolation", () => {
      it("B's history never lists A's goals", async () => {
        const { a, b } = await twoAccounts(lib);
        await reachedGoal(a);
        const rb = await call(goalHistoryRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect([rb.status, rb.body]).toEqual([200, { goals: [] }]);
        const ra = await call(goalHistoryRoute as Handler, {
          token: tokenFor(a.userId),
        });
        expect(
          (ra.body as GoalHistoryListDto).goals.map((g) => g.outcome),
        ).toEqual(["completed"]);
      });
    });
  },

  "GET api/mobile/v1/goals/[goalId]": () => {
    accountEndpointMatrix(
      "GET /goals/{id}",
      goalRoute as Handler,
      { params: { goalId: randomUUID() } },
      404,
    );
    describe("GET /goals/{id}: isolation", () => {
      it("A's goal is a 404 for B, exactly like a missing one", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const goal = await goalOf(a);
        const missing = await call(goalRoute as Handler, {
          token: tokenFor(b.userId),
          params: { goalId: randomUUID() },
        });
        const r = await call(goalRoute as Handler, {
          token: tokenFor(b.userId),
          params: { goalId: goal.id },
        });
        expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        expect(r.status).toBe(404);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
        const own = await call(goalRoute as Handler, {
          token: tokenFor(a.userId),
          params: { goalId: goal.id },
        });
        expect([own.status, own.body.kind, own.body.goalId]).toEqual([
          200,
          "active",
          goal.id,
        ]);
      });
    });
  },

  "PUT api/mobile/v1/goals/[goalId]/archived": () => {
    accountEndpointMatrix(
      "PUT /goals/{id}/archived",
      goalArchivedRoute as Handler,
      {
        method: "PUT",
        params: { goalId: randomUUID() },
        json: { archived: true },
      },
      404,
    );
    describe("PUT /goals/{id}/archived: isolation and retry", () => {
      it("B can't archive A's goal; A archives once and a retry changes nothing", async () => {
        const { a, b } = await twoAccounts(lib);
        const goal = await goalOf(a);
        const before = await snapshotAccount(a.userId);
        const rb = await call(goalArchivedRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { archived: true },
        });
        expect([rb.status, rb.body.error.code]).toEqual([404, "not_found"]);
        expect(await snapshotAccount(a.userId)).toEqual(before);

        const first = await call(goalArchivedRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { archived: true },
        });
        expect([first.status, first.body]).toEqual([
          200,
          { id: goal.id, archived: true, outcome: "manual" },
        ]);
        const stored = await getTestPrisma().goal.findUniqueOrThrow({
          where: { id: goal.id },
        });
        const again = await call(goalArchivedRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { archived: true },
        });
        expect([again.status, again.body]).toEqual([200, first.body]);
        expect(
          await getTestPrisma().goal.findUniqueOrThrow({
            where: { id: goal.id },
          }),
        ).toEqual(stored);
        // There is no unarchive.
        const reopen = await call(goalArchivedRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { archived: false },
        });
        expect([reopen.status, reopen.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
      });
    });
  },

  "PUT api/mobile/v1/goals/[goalId]/acknowledged": () => {
    accountEndpointMatrix(
      "PUT /goals/{id}/acknowledged",
      goalAcknowledgedRoute as Handler,
      {
        method: "PUT",
        params: { goalId: randomUUID() },
        json: { acknowledged: true },
      },
      404,
    );
    describe("PUT /goals/{id}/acknowledged: isolation and retry", () => {
      it("B can't dismiss A's card; A dismisses it once", async () => {
        const { a, b } = await twoAccounts(lib);
        const goal = await reachedGoal(a);
        const rb = await call(goalAcknowledgedRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { acknowledged: true },
        });
        expect([rb.status, rb.body.error.code]).toEqual([404, "not_found"]);
        expect(
          (
            await getTestPrisma().goal.findUniqueOrThrow({
              where: { id: goal.id },
            })
          ).completionAcknowledgedAt,
        ).toBeNull();
        const first = await call(goalAcknowledgedRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { acknowledged: true },
        });
        expect([first.status, first.body]).toEqual([
          200,
          { id: goal.id, acknowledged: true },
        ]);
        const at = (
          await getTestPrisma().goal.findUniqueOrThrow({
            where: { id: goal.id },
          })
        ).completionAcknowledgedAt;
        expect(at).not.toBeNull();
        const again = await call(goalAcknowledgedRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          params: { goalId: goal.id },
          json: { acknowledged: true },
        });
        expect(again.status).toBe(200);
        expect(
          (
            await getTestPrisma().goal.findUniqueOrThrow({
              where: { id: goal.id },
            })
          ).completionAcknowledgedAt,
        ).toEqual(at);
        // An active goal has no card.
        const active = await goalOf(a);
        const refused = await call(goalAcknowledgedRoute as Handler, {
          token: tokenFor(a.userId),
          method: "PUT",
          params: { goalId: active.id },
          json: { acknowledged: true },
        });
        expect([refused.status, refused.body.error.code]).toEqual([
          400,
          "invalid_state_transition",
        ]);
      });
    });
  },
};

/** OVE-241: this week's schedule. A's block has "Alpha Push" today. */
const SCHEDULE_CASES: Record<string, () => void> = {
  "GET api/mobile/v1/this-week": () => {
    accountEndpointMatrix("GET /this-week", thisWeekRoute as Handler);
    describe("GET /this-week: isolation", () => {
      it("B's week is its own (none); A's is A's", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const rb = await call(thisWeekRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect([rb.status, rb.body]).toEqual([200, { week: null }]);
        for (const marker of aMarkers(a, plan))
          expect(rb.text).not.toContain(marker);
        const ra = await call(thisWeekRoute as Handler, {
          token: tokenFor(a.userId),
        });
        expect(ra.body.week.mesocycleId).toBe(plan.meso.id);
        expect(ra.text).toContain("Alpha Push");
      });
    });
  },

  "POST api/mobile/v1/mesocycles/[mesocycleId]/schedule/skip": () => {
    accountEndpointMatrix(
      "POST /mesocycles/{id}/schedule/skip",
      scheduleSkipRoute as Handler,
      {
        params: { mesocycleId: randomUUID() },
        json: { sessionId: randomUUID(), scheduledFor: todayIso() },
      },
      404,
    );
    describe("POST /mesocycles/{id}/schedule/skip: isolation", () => {
      it("B can't skip A's workout: a 404 like a missing block, nothing written", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const before = await snapshotAccount(a.userId);
        const r = await call(scheduleSkipRoute as Handler, {
          token: tokenFor(b.userId),
          params: { mesocycleId: plan.meso.id },
          json: { sessionId: plan.session.id, scheduledFor: todayIso() },
        });
        const missing = await call(scheduleSkipRoute as Handler, {
          token: tokenFor(b.userId),
          params: { mesocycleId: randomUUID() },
          json: { sessionId: plan.session.id, scheduledFor: todayIso() },
        });
        expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        expect(r.status).toBe(404);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
        expect(await snapshotAccount(a.userId)).toEqual(before);
      });
    });
  },

  "POST api/mobile/v1/mesocycles/[mesocycleId]/schedule/move": () => {
    accountEndpointMatrix(
      "POST /mesocycles/{id}/schedule/move",
      scheduleMoveRoute as Handler,
      {
        params: { mesocycleId: randomUUID() },
        json: {
          sessionId: randomUUID(),
          scheduledFor: todayIso(),
          from: todayIso(),
          to: addDays(todayIso(), 1),
          occupant: null,
        },
      },
      404,
    );
    describe("POST /mesocycles/{id}/schedule/move: isolation", () => {
      it("B can't move A's workout: a 404 like a missing block, nothing written", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const before = await snapshotAccount(a.userId);
        const r = await call(scheduleMoveRoute as Handler, {
          token: tokenFor(b.userId),
          params: { mesocycleId: plan.meso.id },
          json: {
            sessionId: plan.session.id,
            scheduledFor: todayIso(),
            from: todayIso(),
            to: addDays(todayIso(), 1),
            occupant: null,
          },
        });
        expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
        expect(await snapshotAccount(a.userId)).toEqual(before);
      });
    });
  },
};

/** Pitch 21j (spec §13): account settings. Each answers about the token's account only. */
const ACCOUNT_SETTINGS_CASES: Record<string, () => void> = {
  "GET api/mobile/v1/me/profile": () => {
    accountEndpointMatrix("GET /me/profile", meProfileRoute as Handler);
    describe("GET /me/profile: isolation", () => {
      it("B reads only its own profile", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        await getTestPrisma().profile.update({
          where: { userId: a.userId },
          data: { firstName: "Alphaname", lastName: "Alphasurname" },
        });
        const rb = await call(meProfileRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect(rb.status).toBe(200);
        for (const marker of [
          ...aMarkers(a, plan),
          "Alphaname",
          "Alphasurname",
        ])
          expect(rb.text).not.toContain(marker);
      });
    });
  },
  "PUT api/mobile/v1/me/profile": () => {
    accountEndpointMatrix("PUT /me/profile", meProfileUpdateRoute as Handler, {
      method: "PUT",
      json: {
        firstName: "Matrix",
        lastName: "Lifter",
        username: "",
        timeZone: "UTC",
      },
    });
    describe("PUT /me/profile: isolation", () => {
      it("B's save changes only B; a body naming A is ignored", async () => {
        const { a, b } = await twoAccounts(lib);
        const before = await snapshotAccount(a.userId);
        const r = await call(meProfileUpdateRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: {
            userId: a.userId,
            firstName: "Bravo",
            lastName: "Lifter",
            username: "",
            timeZone: "America/Chicago",
          },
        });
        expect(r.status).toBe(200);
        expect(await snapshotAccount(a.userId)).toEqual(before);
        const bProfile = await getTestPrisma().profile.findUniqueOrThrow({
          where: { userId: b.userId },
        });
        expect([bProfile.firstName, bProfile.timeZone]).toEqual([
          "Bravo",
          "America/Chicago",
        ]);
      });
    });
  },
  "GET api/mobile/v1/me/plan": () => {
    accountEndpointMatrix("GET /me/plan", mePlanRoute as Handler);
    describe("GET /me/plan: isolation", () => {
      it("answers about B alone, with no purchase field", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const rb = await call(mePlanRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect(rb.status).toBe(200);
        for (const marker of aMarkers(a, plan))
          expect(rb.text).not.toContain(marker);
        for (const key of [
          "prices",
          "canSubscribe",
          "canManage",
          "promoReminder",
        ])
          expect(rb.body).not.toHaveProperty(key);
      });
    });
  },
  "GET api/mobile/v1/release-notes": () => {
    accountEndpointMatrix("GET /release-notes", releaseNotesRoute as Handler);
    describe("GET /release-notes: isolation", () => {
      it("is the same catalog for every account and reveals no one", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const ra = await call(releaseNotesRoute as Handler, {
          token: tokenFor(a.userId),
        });
        const rb = await call(releaseNotesRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect(rb.body).toEqual(ra.body);
        for (const marker of aMarkers(a, plan))
          expect(rb.text).not.toContain(marker);
      });
    });
  },
  "POST api/mobile/v1/me/release-notes/seen": () => {
    const newest = () => orderedReleaseNotes()[0]?.id ?? "none";
    accountEndpointMatrix(
      "POST /me/release-notes/seen",
      releaseNotesSeenRoute as Handler,
      { json: { throughId: newest() } },
    );
    describe("POST /me/release-notes/seen: isolation", () => {
      it("B's mark moves only B's seen point", async () => {
        const { a, b } = await twoAccounts(lib);
        const catalog = orderedReleaseNotes();
        if (catalog.length < 2) return; // nothing to move with one entry
        const older = catalog[catalog.length - 1].id;
        for (const acct of [a, b]) {
          await getTestPrisma().releaseSeen.upsert({
            where: { userId: acct.userId },
            create: {
              userId: acct.userId,
              lastSeenReleaseId: older,
              lastSeenAt: new Date(),
            },
            update: { lastSeenReleaseId: older },
          });
        }
        const r = await call(releaseNotesSeenRoute as Handler, {
          token: tokenFor(b.userId),
          json: { throughId: catalog[0].id, userId: a.userId },
        });
        expect([r.status, r.body]).toEqual([200, { moved: true }]);
        const seen = async (userId: string) =>
          (
            await getTestPrisma().releaseSeen.findUniqueOrThrow({
              where: { userId },
            })
          ).lastSeenReleaseId;
        expect(await seen(a.userId)).toBe(older);
        expect(await seen(b.userId)).toBe(catalog[0].id);
      });
    });
  },
  "GET api/mobile/v1/me/export": () => {
    accountEndpointMatrix("GET /me/export", meExportRoute as Handler);
    describe("GET /me/export: isolation", () => {
      it("B's export holds only B's rows; A's holds A's", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const rb = await call(meExportRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect(rb.status).toBe(200);
        for (const marker of aMarkers(a, plan))
          expect(rb.text).not.toContain(marker);
        expect(rb.text).toContain(bGym.id);
        const ra = await call(meExportRoute as Handler, {
          token: tokenFor(a.userId),
        });
        expect(ra.text).toContain(plan.gym.id);
        expect(ra.text).not.toContain(bGym.id);
        expect(ra.body.loggedSets.length).toBeGreaterThan(0);
      });
    });
  },
};

/** Pitch 21j (spec §13): deletion. Only the token's own account is ever counted or removed. */
const ACCOUNT_DELETION_CASES: Record<string, () => void> = {
  "GET api/mobile/v1/me/deletion-inventory": () => {
    accountEndpointMatrix(
      "GET /me/deletion-inventory",
      deletionInventoryRoute as Handler,
    );
    describe("GET /me/deletion-inventory: isolation", () => {
      it("counts only B's rows", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const rb = await call(deletionInventoryRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect(rb.body).toEqual({
          mesocycles: 0,
          loggedSessions: 0,
          loggedSets: 0,
          goals: 0,
          gyms: 1,
          customExercises: 0,
          cardioLogs: 0,
        });
        for (const marker of aMarkers(a, plan))
          expect(rb.text).not.toContain(marker);
        const ra = await call(deletionInventoryRoute as Handler, {
          token: tokenFor(a.userId),
        });
        expect(ra.body.loggedSessions).toBe(2);
      });
    });
  },
  "POST api/mobile/v1/me/delete": () => {
    accountEndpointMatrix(
      "POST /me/delete",
      deleteAccountRoute as Handler,
      { json: { password: "wrong" } },
      400,
    );
    describe("POST /me/delete: isolation", () => {
      it("B deletes B only; a body naming A changes nothing of A's", async () => {
        const { a, b } = await twoAccounts(lib);
        const aBefore = await snapshotAccount(a.userId);
        const r = await call(deleteAccountRoute as Handler, {
          token: tokenFor(b.userId),
          json: { password: "right", userId: a.userId, accountId: a.userId },
        });
        expect([r.status, r.body]).toEqual([200, { outcome: "deleted" }]);
        expect(await snapshotAccount(a.userId)).toEqual(aBefore);
        expect(
          await getTestPrisma().profile.count({ where: { userId: b.userId } }),
        ).toBe(0);
        const after = await call(deletionInventoryRoute as Handler, {
          token: tokenFor(b.userId),
        });
        expect(after.status).toBe(401);
      });
    });
  },
  "POST api/mobile/v1/feedback": () => {
    const feedbackForm = (message: string) => {
      const fd = new FormData();
      fd.set("category", "bug");
      fd.set("message", message);
      return fd;
    };
    accountEndpointMatrix(
      "POST /feedback",
      feedbackRoute as Handler,
      {
        form: feedbackForm("Matrix message"),
        headers: { "idempotency-key": "matrix-feedback-0001" },
      },
      201,
    );
    describe("POST /feedback: isolation", () => {
      it("B's message is stamped B; A's key in B's hands is just B's key", async () => {
        const { a, b } = await twoAccounts(lib);
        const key = "shared-feedback-key-01";
        const ra = await call(feedbackRoute as Handler, {
          token: tokenFor(a.userId),
          form: feedbackForm("From A"),
          headers: { "idempotency-key": key },
        });
        expect(ra.status).toBe(201);
        const aBefore = await snapshotAccount(a.userId);
        const rb = await call(feedbackRoute as Handler, {
          token: tokenFor(b.userId),
          form: feedbackForm("From B"),
          headers: { "idempotency-key": key },
        });
        // Not A's replay: a fresh create for B (keys are per account).
        expect([rb.status, rb.headers.get("idempotent-replayed")]).toEqual([
          201,
          null,
        ]);
        expect(rb.text).not.toContain("From A");
        expect(await snapshotAccount(a.userId)).toEqual(aBefore);
        const rows = await getTestPrisma().feedback.findMany({
          where: { message: { in: ["From A", "From B"] } },
          select: { userId: true, message: true },
          orderBy: { message: "asc" },
        });
        expect(rows).toEqual([
          { userId: a.userId, message: "From A" },
          { userId: b.userId, message: "From B" },
        ]);
      });
    });
  },
};

/**
 * Pitch 25: A's Wing-It workout, open, at A's gym, with one exercise and one
 * saved set (so a second account has every kind of target to try).
 */
async function aWingIt(
  a: Account,
  plan: Awaited<ReturnType<typeof activePlan>>,
) {
  const started = await call(startWingItRoute as Handler, {
    token: tokenFor(a.userId),
    json: { gymId: plan.gym.id },
  });
  expect(started.status).toBe(200);
  const loggedSessionId = started.body.loggedSessionId as string;
  const added = await call(addWingItExerciseRoute as Handler, {
    token: tokenFor(a.userId),
    method: "PUT",
    params: { loggedSessionId, exerciseId: plan.custom.id },
  });
  expect(added.status).toBe(200);
  const loggedExerciseId = added.body.loggedExerciseId as string;
  const set = await call(putSetRoute as Handler, {
    token: tokenFor(a.userId),
    method: "PUT",
    json: { weightLbs: 100, reps: 8 },
    params: { loggedExerciseId, setNumber: "1" },
  });
  expect(set.status).toBe(200);
  return { loggedSessionId, loggedExerciseId };
}

const WING_IT_CASES: Record<string, () => void> = {
  "POST api/mobile/v1/wing-it-workouts": () => {
    accountEndpointMatrix(
      "POST /wing-it-workouts",
      startWingItRoute as Handler,
      { json: { gymId: randomUUID() } },
      400,
    );
    describe("POST /wing-it-workouts: isolation", () => {
      it("B can't start at A's gym: it reads as unavailable, like a missing gym", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        const post = (gymId: string) =>
          call(startWingItRoute as Handler, {
            token: tokenFor(b.userId),
            json: { gymId, userId: a.userId },
          });
        const missing = await post(randomUUID());
        const foreign = await post(plan.gym.id);
        expect([foreign.status, foreign.body]).toEqual([
          missing.status,
          missing.body,
        ]);
        for (const marker of aMarkers(a, plan))
          expect(foreign.text).not.toContain(marker);
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
      });

      it("B's start never resumes, names, or is blocked by A's open workout", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const aw = await aWingIt(a, plan);
        const aSnap = await snapshotAccount(a.userId);
        const r = await call(startWingItRoute as Handler, {
          token: tokenFor(b.userId),
          json: { gymId: bGym.id },
        });
        expect(r.status).toBe(200);
        expect(r.body.resumed).toBe(false);
        expect(r.body.loggedSessionId).not.toBe(aw.loggedSessionId);
        for (const marker of [...aMarkers(a, plan), aw.loggedSessionId])
          expect(r.text).not.toContain(marker);
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
        // A's own start resumes A's workout.
        const again = await call(startWingItRoute as Handler, {
          token: tokenFor(a.userId),
          json: { gymId: plan.gym.id },
        });
        expect(again.body).toEqual({
          loggedSessionId: aw.loggedSessionId,
          resumed: true,
        });
      });
    });
  },

  "GET api/mobile/v1/workouts/[loggedSessionId]/exercise-candidates": () => {
    accountEndpointMatrix(
      "GET /workouts/{id}/exercise-candidates",
      addCandidatesRoute as Handler,
      { params: { loggedSessionId: randomUUID() } },
      404,
    );
    describe("GET /workouts/{id}/exercise-candidates: isolation", () => {
      it("B can't read A's Wing-It workout's picker", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aw = await aWingIt(a, plan);
        const get = (id: string) =>
          call(addCandidatesRoute as Handler, {
            token: tokenFor(b.userId),
            params: { loggedSessionId: id },
          });
        await expectLikeMissing(
          a,
          plan,
          () => get(aw.loggedSessionId),
          () => get(randomUUID()),
        );
      });

      it("B's own picker lists the library and B's exercises, never A's custom exercise", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const started = await call(startWingItRoute as Handler, {
          token: tokenFor(b.userId),
          json: { gymId: bGym.id },
        });
        const r = await call(addCandidatesRoute as Handler, {
          token: tokenFor(b.userId),
          params: { loggedSessionId: started.body.loggedSessionId },
        });
        expect(r.status).toBe(200);
        expect(r.body.candidates.length).toBeGreaterThan(0);
        expect(r.text).not.toContain(plan.custom.id);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
      });
    });
  },

  "PUT api/mobile/v1/workouts/[loggedSessionId]/exercises/[exerciseId]": () => {
    accountEndpointMatrix(
      "PUT /workouts/{id}/exercises/{exerciseId}",
      addWingItExerciseRoute as Handler,
      {
        method: "PUT",
        params: { loggedSessionId: randomUUID(), exerciseId: randomUUID() },
      },
      404,
    );
    describe("PUT /workouts/{id}/exercises/{exerciseId}: isolation", () => {
      it("B can't add to A's Wing-It workout, even its own exercise", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aw = await aWingIt(a, plan);
        const put = (id: string) =>
          call(addWingItExerciseRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            params: { loggedSessionId: id, exerciseId: lib.bench.id },
          });
        await expectLikeMissing(
          a,
          plan,
          () => put(aw.loggedSessionId),
          () => put(randomUUID()),
        );
      });

      it("B can't add A's custom exercise to its own workout: unavailable, like a missing one", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const started = await call(startWingItRoute as Handler, {
          token: tokenFor(b.userId),
          json: { gymId: bGym.id },
        });
        const put = (exerciseId: string) =>
          call(addWingItExerciseRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            params: {
              loggedSessionId: started.body.loggedSessionId,
              exerciseId,
            },
          });
        const missing = await put(randomUUID());
        const foreign = await put(plan.custom.id);
        expect([foreign.status, foreign.body]).toEqual([
          missing.status,
          missing.body,
        ]);
        expect([foreign.status, foreign.body.error.code]).toEqual([
          400,
          "validation_error",
        ]);
        expect(foreign.text).not.toContain(a.userId);
      });

      it("B can't read, log in, remove from, change the gym of, or finish A's Wing-It workout", async () => {
        const { a, b, plan, bGym } = await twoAccounts(lib);
        const aw = await aWingIt(a, plan);
        const bt = tokenFor(b.userId);
        const attempts = [
          () =>
            call(getWorkoutRoute as Handler, {
              token: bt,
              params: { loggedSessionId: aw.loggedSessionId },
            }),
          () =>
            call(putSetRoute as Handler, {
              token: bt,
              method: "PUT",
              json: { weightLbs: 999, reps: 1 },
              params: { loggedExerciseId: aw.loggedExerciseId, setNumber: "2" },
            }),
          () =>
            call(setSkippedRoute as Handler, {
              token: bt,
              method: "PUT",
              json: { skipped: true },
              params: { loggedExerciseId: aw.loggedExerciseId },
            }),
          () =>
            call(changeGymRoute as Handler, {
              token: bt,
              method: "PUT",
              json: { gymId: bGym.id },
              params: { loggedSessionId: aw.loggedSessionId },
            }),
          () =>
            call(completeWorkoutRoute as Handler, {
              token: bt,
              method: "POST",
              params: { loggedSessionId: aw.loggedSessionId },
            }),
          () =>
            call(historyWorkoutRoute as Handler, {
              token: bt,
              params: { loggedSessionId: aw.loggedSessionId },
            }),
        ];
        const aSnap = await snapshotAccount(a.userId);
        for (const attempt of attempts) {
          const r = await attempt();
          expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
          for (const marker of [...aMarkers(a, plan), aw.loggedSessionId])
            expect(r.text).not.toContain(marker);
        }
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
        // B's Today and History know nothing of it.
        const bToday = await call(today as Handler, { token: bt });
        expect(bToday.body.wingIt).toEqual({
          open: null,
          finishedToday: [],
          blockedBy: null,
        });
        expect(bToday.text).not.toContain(aw.loggedSessionId);
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
          // Pitch 21j: the public support address, or null. Never a secret.
          supportEmail:
            process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL?.trim() || null,
          // Pitch 21k RD-15: off unless MOBILE_TOUR_AUTO_START is "true".
          tourAutoStart: process.env.MOBILE_TOUR_AUTO_START === "true",
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

  // Pitch 21h: the library.
  "GET api/mobile/v1/exercises": () => {
    accountEndpointMatrix("GET /exercises", exercisesRoute as Handler);
    describe("GET /exercises: isolation", () => {
      it("B's list and search never show A's custom exercise or favorites", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        await setExerciseFavorite(a, {
          exerciseId: lib.bench.id,
          isFavorite: true,
        });
        for (const query of [
          "q=Landmine",
          "q=Alpha",
          "view=favorites",
          "muscle=chest&limit=1000",
        ]) {
          const r = await call(exercisesRoute as Handler, {
            token: tokenFor(b.userId),
            query,
          });
          expect(r.status).toBe(200);
          for (const marker of aMarkers(a, plan))
            expect(r.text).not.toContain(marker);
          const body = r.body as ExerciseList;
          expect(body.items.some((e) => e.isFavorite)).toBe(false);
          expect(body.hasAnyFavorites).toBe(false);
        }
        const ra = await call(exercisesRoute as Handler, {
          token: tokenFor(a.userId),
          query: "q=Landmine",
        });
        expect((ra.body as ExerciseList).items.map((e) => e.id)).toEqual([
          plan.custom.id,
        ]);
      });
    });
  },
  "GET api/mobile/v1/exercises/[exerciseId]": () => {
    accountEndpointMatrix(
      "GET /exercises/{id}",
      exerciseRoute as Handler,
      { params: { exerciseId: randomUUID() } },
      404,
    );
    describe("GET /exercises/{id}: isolation", () => {
      it("A's custom exercise is a 404 for B, like a missing one; a library one is readable", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const missing = await call(exerciseRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: randomUUID() },
        });
        const r = await call(exerciseRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: plan.custom.id },
        });
        expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        for (const marker of aMarkers(a, plan))
          expect(r.text).not.toContain(marker);
        await setExerciseFavorite(a, {
          exerciseId: lib.bench.id,
          isFavorite: true,
        });
        const shared = await call(exerciseRoute as Handler, {
          token: tokenFor(b.userId),
          params: { exerciseId: lib.bench.id },
        });
        expect(shared.status).toBe(200);
        expect(shared.body).toMatchObject({
          isFavorite: false,
          canArchive: false,
        });
      });
    });
  },

  "POST api/mobile/v1/exercises": () => {
    const form = {
      name: "Bravo Sled Push",
      primaryMuscle: "quads",
      equipmentType: "other",
      secondaryMuscles: [],
    };
    accountEndpointMatrix(
      "POST /exercises",
      createExerciseRoute as Handler,
      { json: form, headers: { "idempotency-key": "matrix-key-0001" } },
      201,
    );
    describe("POST /exercises: isolation", () => {
      it("creates for the token's account only; another account's key reveals nothing", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const key = `shared-key-${randomUUID()}`;
        const ra = await call(createExerciseRoute as Handler, {
          token: tokenFor(a.userId),
          json: { ...form, name: "Alpha Sled Push" },
          headers: { "idempotency-key": key },
        });
        expect(ra.status).toBe(201);
        const aSnap = await snapshotAccount(a.userId);
        // B reuses A's key with another body: B's own fresh create, not a 409.
        const rb = await call(createExerciseRoute as Handler, {
          token: tokenFor(b.userId),
          json: { ...form, userId: a.userId },
          headers: { "idempotency-key": key },
        });
        expect(rb.status).toBe(201);
        expect(rb.headers.get("idempotent-replayed")).toBeNull();
        expect(rb.body.id).not.toBe(ra.body.id);
        for (const marker of [...aMarkers(a, plan), "Alpha Sled Push"])
          expect(rb.text).not.toContain(marker);
        const row = await getTestPrisma().exercise.findUniqueOrThrow({
          where: { id: rb.body.id },
        });
        expect(row.userId).toBe(b.userId);
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
      });
    });
  },
  "PUT api/mobile/v1/exercises/[exerciseId]/favorite": () => {
    accountEndpointMatrix(
      "PUT /exercises/{id}/favorite",
      favoriteRoute as Handler,
      {
        method: "PUT",
        json: { isFavorite: true },
        params: { exerciseId: randomUUID() },
      },
      404,
    );
    describe("PUT /exercises/{id}/favorite: isolation", () => {
      it("B can't star A's custom exercise (404 like a missing one); B's star on a library one is B's alone", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        const missing = await call(favoriteRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { isFavorite: true },
          params: { exerciseId: randomUUID() },
        });
        const r = await call(favoriteRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { isFavorite: true },
          params: { exerciseId: plan.custom.id },
        });
        expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        const shared = await call(favoriteRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { isFavorite: true },
          params: { exerciseId: lib.bench.id },
        });
        expect(shared.status).toBe(200);
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
        expect(
          await getTestPrisma().exerciseFavorite.count({
            where: { exerciseId: lib.bench.id, userId: a.userId },
          }),
        ).toBe(0);
      });
    });
  },
  "PUT api/mobile/v1/exercises/[exerciseId]/archived": () => {
    accountEndpointMatrix(
      "PUT /exercises/{id}/archived",
      exerciseArchivedRoute as Handler,
      {
        method: "PUT",
        json: { archived: true },
        params: { exerciseId: randomUUID() },
      },
      404,
    );
    describe("PUT /exercises/{id}/archived: isolation", () => {
      it("B can't archive or restore A's custom exercise, or any library one", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        for (const [exerciseId, archived] of [
          [plan.custom.id, true],
          [plan.custom.id, false],
          [lib.bench.id, true],
        ] as const) {
          const r = await call(exerciseArchivedRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            json: { archived },
            params: { exerciseId },
          });
          expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
        }
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
        expect(
          (
            await getTestPrisma().exercise.findUniqueOrThrow({
              where: { id: lib.bench.id },
            })
          ).deletedAt,
        ).toBeNull();
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
  "POST api/mobile/v1/gyms": () => {
    accountEndpointMatrix(
      "POST /gyms",
      createGymRoute as Handler,
      {
        json: { name: "Matrix Gym", address: null },
        headers: { "idempotency-key": "matrix-gym-0001" },
      },
      201,
    );
    describe("POST /gyms: isolation", () => {
      it("creates for the token's account only, never another's baseline; a shared key reveals nothing", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        const key = `gym-key-${randomUUID()}`;
        await call(createGymRoute as Handler, {
          token: tokenFor(a.userId),
          json: { name: "Alpha Annex" },
          headers: { "idempotency-key": key },
        });
        const aAfter = await snapshotAccount(a.userId);
        const r = await call(createGymRoute as Handler, {
          token: tokenFor(b.userId),
          json: { name: "Bravo Annex", userId: a.userId },
          headers: { "idempotency-key": key },
        });
        expect(r.status).toBe(201);
        expect(r.headers.get("idempotent-replayed")).toBeNull();
        for (const marker of [...aMarkers(a, plan), "Alpha Annex"])
          expect(r.text).not.toContain(marker);
        const row = await getTestPrisma().gym.findUniqueOrThrow({
          where: { id: r.body.id },
        });
        expect(row.userId).toBe(b.userId);
        expect(
          await getTestPrisma().gymExerciseBaseline.count({
            where: { gymId: row.id },
          }),
        ).toBe(0);
        expect(await snapshotAccount(a.userId)).toEqual(aAfter);
        expect(aAfter).not.toEqual(aSnap); // A's own create did land.
      });
    });
  },
  "PUT api/mobile/v1/gyms/[gymId]/archived": () => {
    accountEndpointMatrix(
      "PUT /gyms/{id}/archived",
      gymArchivedRoute as Handler,
      {
        method: "PUT",
        json: { archived: true },
        params: { gymId: randomUUID() },
      },
      404,
    );
    describe("PUT /gyms/{id}/archived: isolation", () => {
      it("B can't archive or restore A's gym: a 404 like a missing one, nothing changed", async () => {
        const { a, b, plan } = await twoAccounts(lib);
        const aSnap = await snapshotAccount(a.userId);
        const missing = await call(gymArchivedRoute as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { archived: true },
          params: { gymId: randomUUID() },
        });
        for (const archived of [true, false]) {
          const r = await call(gymArchivedRoute as Handler, {
            token: tokenFor(b.userId),
            method: "PUT",
            json: { archived },
            params: { gymId: plan.gym.id },
          });
          expect([r.status, r.body]).toEqual([missing.status, missing.body]);
        }
        expect(await snapshotAccount(a.userId)).toEqual(aSnap);
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

  // Pitch 21k: the native tour's progress (spec §6, §13 "Isolation").
  "PUT api/mobile/v1/me/tour/outcome": () => {
    accountEndpointMatrix("PUT /me/tour/outcome", putTourOutcome as Handler, {
      method: "PUT",
      json: { outcome: "completed" },
    });
    describe("PUT /me/tour/outcome: isolation", () => {
      it("B's outcome changes only B's row, whatever id the body names", async () => {
        const { a, b } = await twoAccounts(lib);
        for (const acct of [a, b]) {
          await getTestPrisma().tourProgress.upsert({
            where: { userId: acct.userId },
            create: { userId: acct.userId },
            update: { offeredAt: null, outcome: null, outcomeAt: null },
          });
        }
        const before = await getTestPrisma().tourProgress.findUnique({
          where: { userId: a.userId },
        });
        const r = await call(putTourOutcome as Handler, {
          token: tokenFor(b.userId),
          method: "PUT",
          json: { outcome: "skipped", userId: a.userId },
        });
        expect([r.status, r.body]).toEqual([200, { outcome: "skipped" }]);
        expect(
          (
            await getTestPrisma().tourProgress.findUnique({
              where: { userId: b.userId },
            })
          )?.outcome,
        ).toBe("skipped");
        expect(
          await getTestPrisma().tourProgress.findUnique({
            where: { userId: a.userId },
          }),
        ).toEqual(before);
      });
    });
  },
  "POST api/mobile/v1/me/tour/offered": () => {
    accountEndpointMatrix("POST /me/tour/offered", postTourOffered as Handler, {
      method: "POST",
    });
    describe("POST /me/tour/offered: isolation", () => {
      it("B's call spends only B's offer and never reveals A's", async () => {
        const { a, b } = await twoAccounts(lib);
        for (const acct of [a, b]) {
          await getTestPrisma().tourProgress.upsert({
            where: { userId: acct.userId },
            create: { userId: acct.userId },
            update: { offeredAt: null, outcome: null, outcomeAt: null },
          });
        }
        const r = await call(postTourOffered as Handler, {
          token: tokenFor(b.userId),
          method: "POST",
          json: { userId: a.userId },
        });
        expect([r.status, r.body]).toEqual([200, { spent: true }]);
        const rowOf = (userId: string) =>
          getTestPrisma().tourProgress.findUniqueOrThrow({ where: { userId } });
        expect((await rowOf(b.userId)).offeredAt).not.toBeNull();
        expect((await rowOf(a.userId)).offeredAt).toBeNull();
        // A second call by B answers the same as for any spent account.
        const again = await call(postTourOffered as Handler, {
          token: tokenFor(b.userId),
          method: "POST",
        });
        expect(again.body).toEqual({ spent: false });
        expect(again.text).not.toContain(a.userId);
      });
    });
  },

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
  ...GOAL_CASES,
  ...SCHEDULE_CASES,
  ...ACCOUNT_SETTINGS_CASES,
  ...ACCOUNT_DELETION_CASES,
  ...WING_IT_CASES,
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
