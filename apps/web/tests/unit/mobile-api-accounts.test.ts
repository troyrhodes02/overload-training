/**
 * Pitch 21d (spec §10.2, §10.5; RD-7, RD-9): native signup and the native
 * reset request are thin adapters over the web's own modules. These tests
 * run the REAL signUp and requestPasswordReset with only their network and
 * database seams faked, so every web defense is exercised through the
 * mobile path.
 */
jest.mock("next/server", () => ({ connection: jest.fn(async () => {}) }));
// The modules signUp imports at load; every one is injected as a dep below.
jest.mock("@/lib/supabase/server", () => ({ createServerSupabase: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({
  createConfirmedUser: jest.fn(),
  deleteAuthUser: jest.fn(),
}));
jest.mock("@/lib/data/account", () => ({
  DEFAULT_PROFILE_TIME_ZONE: "UTC",
  establishProfile: jest.fn(),
}));
jest.mock("@/lib/data/usernames", () => ({ isUsernameAvailable: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: {} }));

import {
  mobileRequestPasswordReset,
  mobileSignUp,
  signUpFailure,
  type MobileAccountsDeps,
} from "@/lib/api/mobile/accounts";
import { ApiFailure } from "@/lib/api/mobile/errors";
import { requestPasswordReset } from "@/lib/accounts/recovery";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";
import { SIGNUPS_PAUSED } from "@/lib/accounts/signup-messages";

const USER = "00000000-0000-4000-8000-0000000000aa";
const OPEN = { OVERLOAD_SIGNUP_MODE: "public", NODE_ENV: "test" };

const STAGING_HOST = "overload-training-git-staging-x.vercel.app";

function headers(ip = "203.0.113.7") {
  return new Headers({
    "x-forwarded-for": `${ip}, 10.0.0.1`,
    "x-forwarded-host": STAGING_HOST,
    "x-forwarded-proto": "https",
  });
}

const body = (over: Record<string, unknown> = {}) => ({
  firstName: "Sam",
  lastName: "Ortiz",
  username: "sam_lifts",
  email: "sam@example.com",
  password: "barbell-315-strong",
  confirmPassword: "barbell-315-strong",
  timeZone: "America/Chicago",
  challengeToken: "cf-token",
  ...over,
});

/** The web signup's own deps, with only Supabase and the database faked. */
function signUpDeps(over: Partial<SignUpDeps> = {}) {
  const calls = {
    throttleKeys: [] as string[],
    challengeTokens: [] as unknown[],
    profiles: [] as unknown[],
    deleted: [] as string[],
  };
  const deps: SignUpDeps = {
    checkAndIncrement: async (_action, key) => {
      calls.throttleKeys.push(key);
      return { allowed: true, count: 1 };
    },
    verifyChallenge: async (token) => {
      calls.challengeTokens.push(token);
      return token === "cf-token";
    },
    isUsernameAvailable: async () => true,
    createConfirmedUser: async () => ({
      ok: true as const,
      user: { id: USER },
    }),
    deleteAuthUser: async (id) => {
      calls.deleted.push(id);
      return "deleted" as const;
    },
    // Replaced by the mobile adapter; a call here would be a bug.
    signIn: async () => {
      throw new Error("cookie sign-in must not run on the mobile path");
    },
    signOut: async () => {
      throw new Error("cookie sign-out must not run on the mobile path");
    },
    establishProfile: (async (user: unknown, profile: unknown) => {
      calls.profiles.push({ user, profile });
    }) as unknown as SignUpDeps["establishProfile"],
    countRecentSignups: async () => 0,
    claimTrial: async () => true,
    releaseTrialClaim: async () => {},
    ...over,
  };
  return { deps, calls };
}

function fakeAuth(opts: { signInFails?: boolean } = {}) {
  const signOut = jest.fn(async () => ({ error: null }));
  const auth = {
    signInWithPassword: jest.fn(async () =>
      opts.signInFails
        ? { data: { user: null, session: null }, error: { status: 500 } }
        : {
            data: {
              user: { id: USER },
              session: {
                access_token: "access.jwt",
                refresh_token: "refresh-1",
                expires_at: 1_900_000_000,
                expires_in: 3600,
              },
            },
            error: null,
          },
    ),
    signOut,
    resetPasswordForEmail: jest.fn(async () => ({ error: null })),
  };
  return auth;
}

function deps(
  over: Partial<MobileAccountsDeps> & { signUpDeps?: SignUpDeps } = {},
  auth: ReturnType<typeof fakeAuth> | null = fakeAuth(),
): MobileAccountsDeps {
  return {
    signUp,
    signUpDeps: signUpDeps().deps,
    requestPasswordReset,
    auth: () => auth as never,
    env: OPEN,
    ...over,
  };
}

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected an ApiFailure");
}

describe("mobileSignUp runs the web's signUp", () => {
  it("creates the account once and returns that sign-in's session", async () => {
    const { deps: sd, calls } = signUpDeps();
    const auth = fakeAuth();
    const result = await mobileSignUp(
      body(),
      headers(),
      deps({ signUpDeps: sd }, auth),
    );
    expect(result).toEqual({
      session: {
        accessToken: "access.jwt",
        refreshToken: "refresh-1",
        expiresAt: 1_900_000_000,
        tokenType: "bearer",
      },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    // The web's request fingerprint, never the email.
    expect(calls.throttleKeys).toEqual(["ip:203.0.113.7"]);
    expect(calls.challengeTokens).toEqual(["cf-token"]);
    expect(calls.profiles).toEqual([
      {
        user: { id: USER },
        profile: {
          firstName: "Sam",
          lastName: "Ortiz",
          username: "sam_lifts",
          timeZone: "America/Chicago",
        },
      },
    ]);
  });

  it("a missing or forged challenge token is refused before any account exists", async () => {
    for (const challengeToken of [undefined, null, "", "forged"]) {
      const created = jest.fn();
      const { deps: sd } = signUpDeps({ createConfirmedUser: created });
      const f = await failure(
        mobileSignUp(
          body({ challengeToken }),
          headers(),
          deps({ signUpDeps: sd }),
        ),
      );
      expect([f.code, f.status, f.details]).toEqual([
        "validation_error",
        400,
        { challengeToken: "Couldn't verify you're human. Try again." },
      ]);
      expect(created).not.toHaveBeenCalled();
    }
  });

  it("the closed mode refuses every signup, and invite mode reads as closed", async () => {
    for (const mode of ["closed", "invite", undefined]) {
      const f = await failure(
        mobileSignUp(
          body(),
          headers(),
          deps({ env: { OVERLOAD_SIGNUP_MODE: mode, NODE_ENV: "test" } }),
        ),
      );
      expect([f.code, f.message]).toEqual([
        "invalid_state_transition",
        "Signup isn't open right now.",
      ]);
    }
  });

  it("an invite code in the body is ignored (public mode needs none)", async () => {
    const result = await mobileSignUp(
      body({ inviteCode: "anything" }),
      headers(),
      deps(),
    );
    expect(result.session.accessToken).toBe("access.jwt");
  });

  it("the throttle, reserved names, and disposable domains still apply", async () => {
    const throttled = signUpDeps({
      checkAndIncrement: async () => ({ allowed: false, count: 11 }),
    }).deps;
    expect(
      (
        await failure(
          mobileSignUp(body(), headers(), deps({ signUpDeps: throttled })),
        )
      ).code,
    ).toBe("rate_limited");

    const reserved = await failure(
      mobileSignUp(body({ username: "Admin_Team" }), headers(), deps()),
    );
    expect([reserved.code, Object.keys(reserved.details ?? {})]).toEqual([
      "validation_error",
      ["username"],
    ]);

    const disposable = await failure(
      mobileSignUp(body({ email: "sam@mailinator.com" }), headers(), deps()),
    );
    expect([disposable.code, Object.keys(disposable.details ?? {})]).toEqual([
      "validation_error",
      ["email"],
    ]);
  });

  it("a failed sign-in after creation is compensated and returns no session", async () => {
    const { deps: sd, calls } = signUpDeps();
    const auth = fakeAuth({ signInFails: true });
    const f = await failure(
      mobileSignUp(body(), headers(), deps({ signUpDeps: sd }, auth)),
    );
    expect([f.code, f.status]).toEqual(["internal_error", 500]);
    expect(calls.deleted).toEqual([USER]);
    expect(calls.profiles).toEqual([]);
  });

  it("no Supabase configuration is an internal error before any work", async () => {
    const run = jest.fn();
    const f = await failure(
      mobileSignUp(body(), headers(), deps({ signUp: run as never }, null)),
    );
    expect(f.code).toBe("internal_error");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("signUpFailure maps every refused outcome to an existing code", () => {
  it.each([
    [{ kind: "closed" }, "invalid_state_transition", 400],
    [{ kind: "invite_invalid" }, "invalid_state_transition", 400],
    [{ kind: "rate_limited" }, "rate_limited", 429],
    [{ kind: "paused" }, "rate_limited", 429],
    [{ kind: "challenge_failed" }, "validation_error", 400],
    [
      { kind: "invalid", fieldErrors: { email: "Bad." } },
      "validation_error",
      400,
    ],
    [{ kind: "email_taken" }, "conflict", 409],
    [{ kind: "unexpected" }, "internal_error", 500],
  ] as const)("%j → %s", (outcome, code, status) => {
    const f = signUpFailure(outcome as never);
    expect([f.code, f.status]).toEqual([code, status]);
  });

  it("paused uses the web's paused message; invalid carries only real field errors", () => {
    expect(signUpFailure({ kind: "paused" }).message).toBe(SIGNUPS_PAUSED);
    expect(
      signUpFailure({
        kind: "invalid",
        fieldErrors: { email: "Bad.", username: undefined },
      }).details,
    ).toEqual({ email: "Bad." });
  });
});

describe("mobileRequestPasswordReset keeps the web's non-enumeration rule", () => {
  /** The real module, with the throttle and the challenge faked. */
  function resetDeps(opts: { allowed?: boolean; challenge?: boolean } = {}) {
    const auth = fakeAuth();
    const keys: string[] = [];
    const d = deps(
      {
        requestPasswordReset: (input, rd) =>
          requestPasswordReset(input, {
            ...rd,
            verifyChallenge: async () => opts.challenge ?? true,
            checkAndIncrement: async (_a, key) => {
              keys.push(key);
              return { allowed: opts.allowed ?? true, count: 1 };
            },
          }),
      },
      auth,
    );
    return { d, auth, keys };
  }

  it("the same body whether the address has an account, is throttled, or Auth fails", async () => {
    const known = resetDeps();
    const throttled = resetDeps({ allowed: false });
    const down = resetDeps();
    down.auth.resetPasswordForEmail.mockResolvedValue({
      error: { status: 503 },
    } as never);
    const answers = [
      await mobileRequestPasswordReset(
        { email: "a@example.com", challengeToken: "t" },
        headers(),
        known.d,
      ),
      await mobileRequestPasswordReset(
        { email: "nobody@example.com", challengeToken: "t" },
        headers(),
        throttled.d,
      ),
      await mobileRequestPasswordReset(
        { email: "b@example.com", challengeToken: "t" },
        headers(),
        down.d,
      ),
    ];
    for (const a of answers) expect(a).toEqual({ sent: true });
    // The link returns to the reset flow on the deployment the app called
    // (21d staging QA: it had opened the landing page).
    expect(known.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "a@example.com",
      { redirectTo: `https://${STAGING_HOST}/auth/confirm` },
    );
    expect(throttled.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(known.keys).toEqual(["ip:203.0.113.7"]);
  });

  it("only a malformed email or a failed challenge is reported, before any lookup", async () => {
    const bad = resetDeps();
    const f1 = await failure(
      mobileRequestPasswordReset({ email: "not-an-email" }, headers(), bad.d),
    );
    expect([f1.code, f1.status]).toEqual(["validation_error", 400]);
    const robot = resetDeps({ challenge: false });
    const f2 = await failure(
      mobileRequestPasswordReset(
        { email: "a@example.com", challengeToken: "x" },
        headers(),
        robot.d,
      ),
    );
    expect([f2.code, f2.message]).toEqual([
      "validation_error",
      "Couldn't verify you're human. Try again.",
    ]);
    expect(bad.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(robot.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
