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
import { createGoal } from "@/lib/goals/goals";
import { startOrResumeWorkout } from "@/lib/logging/sessions";
import {
  completeWorkoutAndReconcile,
  logSetAndReconcile,
} from "@/lib/logging/workflows";
import { addDays } from "@overload/shared/plan/calendar";
import type { TodayDto } from "@overload/shared/contracts/views";
import type { MeDto } from "@overload/shared/contracts/account";
import type { GymsResponseDto } from "@overload/shared/contracts/gyms";
import { createTestAccount } from "../support/accounts";
import { getTestPrisma } from "../support/db";
import { endpointKey, MOBILE_ENDPOINTS } from "../../support/mobile-endpoints";
import { activePlan, library, today as todayIso, type Lib } from "./fixtures";
import { snapshotAccount } from "./support";

type Handler = (
  request: Request,
  route: { params: Promise<Record<string, never>> },
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

type CallInit = { method?: string; json?: unknown; ip?: string };

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
    new Request("http://localhost/api/mobile/v1/x", {
      method: opts.method ?? (hasBody ? "POST" : "GET"),
      headers,
      body: hasBody ? JSON.stringify(opts.json) : undefined,
    }),
    { params: Promise.resolve({}) },
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
      expect(r.status).toBe(200);
      expect(JSON.parse(JSON.stringify(r.body))).toEqual(r.body);
    });
  });
}

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
