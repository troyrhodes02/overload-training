// signup.ts and recovery.ts import the throttle, which builds the raw Prisma
// client at load; every dep is injected here, so a stub client suffices.
jest.mock("@/lib/db", () => ({ prisma: {} }));
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
jest.mock("@/app/signup/actions", () => ({ signUpAction: jest.fn() }));
jest.mock("@/app/forgot-password/actions", () => ({
  requestPasswordResetAction: jest.fn(),
}));

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { isTurnstileBypassEnabled } from "@/lib/accounts/turnstile-bypass";
import { verifyChallenge } from "@/lib/accounts/turnstile";
import { signUp, type SignUpDeps } from "@/lib/accounts/signup";
import { requestPasswordReset } from "@/lib/accounts/recovery";
import { DEFAULT_SIGNUP_HOURLY_CAP } from "@/lib/accounts/signup-guards";
import { SignupForm } from "@/app/signup/signup-form";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-form";

/**
 * The development / Preview Turnstile bypass (TURNSTILE_DISABLED). One helper
 * decides it; the widget, server verification, and the signup hourly cap all
 * follow it; Vercel Production and production-mode processes outside Preview
 * never qualify.
 */

type Env = Record<string, string | undefined>;

const LOCAL_DEV: Env = { NODE_ENV: "development" };
const PREVIEW: Env = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "preview",
};
const VERCEL_PROD: Env = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
};
const ON = { TURNSTILE_DISABLED: "true" };
const OFF = { TURNSTILE_DISABLED: "false" };
// Production's project ref (src/lib/env/supabase-identity.ts).
const PROD_DB =
  "postgresql://postgres.ycxvdiklpefyhdclxyau:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

describe("isTurnstileBypassEnabled: the environment matrix", () => {
  it("1. local development + flag true → bypass enabled", () => {
    expect(isTurnstileBypassEnabled({ ...LOCAL_DEV, ...ON })).toBe(true);
    // `vercel env pull` / `vercel dev` locally sets VERCEL_ENV=development.
    expect(
      isTurnstileBypassEnabled({
        ...LOCAL_DEV,
        VERCEL_ENV: "development",
        ...ON,
      }),
    ).toBe(true);
  });

  it("2. local development + flag absent or false → bypass disabled", () => {
    expect(isTurnstileBypassEnabled(LOCAL_DEV)).toBe(false);
    expect(isTurnstileBypassEnabled({ ...LOCAL_DEV, ...OFF })).toBe(false);
  });

  it("3. Vercel Preview + flag true → bypass enabled", () => {
    expect(isTurnstileBypassEnabled({ ...PREVIEW, ...ON })).toBe(true);
  });

  it("4. Vercel Preview + flag absent or false → bypass disabled", () => {
    expect(isTurnstileBypassEnabled(PREVIEW)).toBe(false);
    expect(isTurnstileBypassEnabled({ ...PREVIEW, ...OFF })).toBe(false);
  });

  it("5. Vercel Production + flag true → bypass disabled, whatever NODE_ENV says", () => {
    expect(isTurnstileBypassEnabled({ ...VERCEL_PROD, ...ON })).toBe(false);
    for (const NODE_ENV of ["development", "test", "production", undefined]) {
      expect(
        isTurnstileBypassEnabled({ ...VERCEL_PROD, NODE_ENV, ...ON }),
      ).toBe(false);
    }
    // Letter case and whitespace do not sneak past the production refusal.
    expect(
      isTurnstileBypassEnabled({
        NODE_ENV: "development",
        VERCEL_ENV: " Production ",
        ...ON,
      }),
    ).toBe(false);
  });

  it("6. production-mode execution outside approved Preview → bypass disabled", () => {
    // `next start` locally, or any self-hosted production build.
    expect(isTurnstileBypassEnabled({ NODE_ENV: "production", ...ON })).toBe(
      false,
    );
    // The unit-test environment is not an approved environment either.
    expect(isTurnstileBypassEnabled({ NODE_ENV: "test", ...ON })).toBe(false);
    // NODE_ENV unset is not development.
    expect(isTurnstileBypassEnabled({ ...ON })).toBe(false);
    // A Vercel build with no VERCEL_ENV, or an unrecognised one, fails closed
    // even if NODE_ENV claims development.
    expect(
      isTurnstileBypassEnabled({ NODE_ENV: "development", VERCEL: "1", ...ON }),
    ).toBe(false);
    expect(
      isTurnstileBypassEnabled({
        NODE_ENV: "development",
        VERCEL_ENV: "staging",
        ...ON,
      }),
    ).toBe(false);
  });

  it("only the exact value `true` turns it on", () => {
    for (const v of ["1", "yes", "TRUE", "True", "on", "", "  "]) {
      expect(
        isTurnstileBypassEnabled({ ...LOCAL_DEV, TURNSTILE_DISABLED: v }),
      ).toBe(false);
    }
    expect(
      isTurnstileBypassEnabled({ ...LOCAL_DEV, TURNSTILE_DISABLED: " true " }),
    ).toBe(true);
  });

  it("never applies against Production data, even locally or on Preview", () => {
    for (const base of [LOCAL_DEV, PREVIEW]) {
      for (const name of [
        "DATABASE_URL",
        "DIRECT_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
      ]) {
        expect(
          isTurnstileBypassEnabled({ ...base, ...ON, [name]: PROD_DB }),
        ).toBe(false);
      }
    }
  });
});

describe("verifyChallenge follows the helper", () => {
  const ENVS: Array<[string, Env]> = [
    ["local dev + on", { ...LOCAL_DEV, ...ON }],
    ["local dev + off", { ...LOCAL_DEV, ...OFF }],
    ["preview + on", { ...PREVIEW, ...ON }],
    ["preview + off", { ...PREVIEW, ...OFF }],
    ["vercel production + on", { ...VERCEL_PROD, ...ON }],
    ["production mode + on", { NODE_ENV: "production", ...ON }],
  ];

  it.each(ENVS)(
    "%s: a missing token passes only when the bypass is on",
    async (_label, base) => {
      // A real secret is configured, so the older no-secret bypass is out of play.
      const env = { ...base, TURNSTILE_SECRET_KEY: "s3cret" };
      const verify = jest.fn(async () => false);
      const bypass = isTurnstileBypassEnabled(env);
      for (const token of ["", undefined, null]) {
        await expect(verifyChallenge(token, { env, verify })).resolves.toBe(
          bypass,
        );
      }
      if (bypass) {
        // The bypass never reaches Cloudflare.
        await expect(verifyChallenge("tok", { env, verify })).resolves.toBe(
          true,
        );
        expect(verify).not.toHaveBeenCalled();
      } else {
        // Without it, a present token still goes through siteverify.
        await expect(verifyChallenge("tok", { env, verify })).resolves.toBe(
          false,
        );
        expect(verify).toHaveBeenCalledWith("tok", "s3cret");
      }
    },
  );

  it("Vercel Production with the flag on still rejects a missing or invalid token", async () => {
    const env = { ...VERCEL_PROD, ...ON, TURNSTILE_SECRET_KEY: "s3cret" };
    const verify = jest.fn(async () => false);
    await expect(verifyChallenge("", { env, verify })).resolves.toBe(false);
    await expect(verifyChallenge("forged", { env, verify })).resolves.toBe(
      false,
    );
    // And with no secret configured, production still fails every attempt.
    const noSecret = { ...VERCEL_PROD, ...ON };
    await expect(
      verifyChallenge("tok", { env: noSecret, verify }),
    ).resolves.toBe(false);
  });
});

describe("7. signup and password recovery apply the same rules", () => {
  const NEW_ID = "c0000000-0000-4000-8000-000000000003";
  const valid = {
    firstName: "Sam",
    lastName: "Ortiz",
    username: "sam_lifts",
    email: "sam@example.com",
    password: "barbell-315",
    confirmPassword: "barbell-315",
    timeZone: "America/Chicago",
    inviteCode: "",
    challengeToken: "", // no widget, no token
  };

  function signupDeps(env: Env, overrides: Partial<SignUpDeps> = {}) {
    const verify = jest.fn(async () => false);
    return {
      checkAndIncrement: jest.fn(async () => ({ allowed: true })),
      verifyChallenge: (t: unknown) => verifyChallenge(t, { env, verify }),
      isUsernameAvailable: jest.fn(async () => true),
      createConfirmedUser: jest.fn(async () => ({
        ok: true as const,
        user: { id: NEW_ID },
      })),
      deleteAuthUser: jest.fn(async () => "deleted" as const),
      signIn: jest.fn(async () => ({ user: { id: NEW_ID } })),
      signOut: jest.fn(async () => {}),
      establishProfile: jest.fn(async () => {}),
      countRecentSignups: jest.fn(async () => 0),
      claimTrial: jest.fn(async () => true),
      releaseTrialClaim: jest.fn(async () => {}),
      ...overrides,
    } satisfies SignUpDeps;
  }

  function recoveryDeps(env: Env) {
    const verify = jest.fn(async () => false);
    return {
      verifyChallenge: (t: unknown) => verifyChallenge(t, { env, verify }),
      checkAndIncrement: jest.fn(async () => ({ allowed: false })),
      throttleKey: "k",
      auth: jest.fn(),
    };
  }

  const CASES: Array<[string, Env, boolean]> = [
    ["local dev + on", { ...LOCAL_DEV, ...ON }, true],
    ["local dev + off", LOCAL_DEV, false],
    ["preview + on", { ...PREVIEW, ...ON }, true],
    ["preview + off", PREVIEW, false],
    ["vercel production + on", { ...VERCEL_PROD, ...ON }, false],
    ["production mode + on", { NODE_ENV: "production", ...ON }, false],
  ];

  it.each(CASES)(
    "%s: a tokenless signup and a tokenless reset request agree (bypass=%s)",
    async (_label, base, bypass) => {
      const env = { ...base, OVERLOAD_SIGNUP_MODE: "public" };
      const d = signupDeps(env);
      const signup = await signUp(valid, d, env);
      expect(signup.kind).toBe(bypass ? "created" : "challenge_failed");
      if (!bypass) expect(d.createConfirmedUser).not.toHaveBeenCalled();

      const reset = await requestPasswordReset(
        { email: "sam@example.com", challengeToken: "" },
        recoveryDeps(env),
      );
      expect(reset.ok).toBe(bypass);
    },
  );

  it("the bypass skips the global hourly cap so repeated test accounts are not paused", async () => {
    const env = { ...PREVIEW, ...ON, OVERLOAD_SIGNUP_MODE: "public" };
    const d = signupDeps(env, {
      countRecentSignups: jest.fn(async () => DEFAULT_SIGNUP_HOURLY_CAP + 50),
    });
    expect(await signUp(valid, d, env)).toEqual({ kind: "created" });
    expect(d.countRecentSignups).not.toHaveBeenCalled();
  });

  it("without the bypass (and on Vercel Production) the hourly cap still pauses signup", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    for (const base of [PREVIEW, { ...VERCEL_PROD, ...ON }]) {
      const env = { ...base, OVERLOAD_SIGNUP_MODE: "public" };
      const d = signupDeps(env, {
        verifyChallenge: jest.fn(async () => true),
        countRecentSignups: jest.fn(async () => DEFAULT_SIGNUP_HOURLY_CAP),
      });
      expect(await signUp(valid, d, env)).toEqual({ kind: "paused" });
      expect(d.createConfirmedUser).not.toHaveBeenCalled();
    }
    warn.mockRestore();
  });

  it("the bypass keeps every other signup protection", async () => {
    const on = { ...LOCAL_DEV, ...ON };
    // Closed mode still closes.
    let d = signupDeps(on);
    expect(
      await signUp(valid, d, { ...on, OVERLOAD_SIGNUP_MODE: "closed" }),
    ).toEqual({ kind: "closed" });
    // The per-IP throttle still applies.
    d = signupDeps(on, {
      checkAndIncrement: jest.fn(async () => ({ allowed: false })),
    });
    const pub = { ...on, OVERLOAD_SIGNUP_MODE: "public" };
    expect(await signUp(valid, d, pub)).toEqual({ kind: "rate_limited" });
    // Reserved usernames, disposable emails, and field validation still apply.
    d = signupDeps(on);
    expect((await signUp({ ...valid, username: "admin_x" }, d, pub)).kind).toBe(
      "invalid",
    );
    expect(
      (await signUp({ ...valid, email: "x@mailinator.com" }, d, pub)).kind,
    ).toBe("invalid");
    expect(
      (await signUp({ ...valid, confirmPassword: "different-1" }, d, pub)).kind,
    ).toBe("invalid");
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });
});

describe("the forms render no widget only when the server says so", () => {
  const submitEnabled = (html: string, label: string) =>
    // The attribute, not the `disabled:` Tailwind variant in the class list.
    !new RegExp(`<button[^>]*\\sdisabled=""[^>]*>[^<]*${label}`).test(html);

  it("signup: bypass → no widget and an enabled button; otherwise the widget gates it", () => {
    const off = renderToStaticMarkup(
      <SignupForm
        view={{
          mode: "public",
          turnstileSiteKey: null,
          challengeDisabled: false,
        }}
      />,
    );
    expect(off).toContain("Couldn&#x27;t load the human check");
    expect(submitEnabled(off, "Create account")).toBe(false);

    const on = renderToStaticMarkup(
      <SignupForm
        view={{
          mode: "public",
          turnstileSiteKey: null,
          challengeDisabled: true,
        }}
      />,
    );
    expect(on).not.toContain("human check");
    expect(on).not.toContain('name="challengeToken"');
    expect(submitEnabled(on, "Create account")).toBe(true);
  });

  it("forgot-password: bypass → no widget and an enabled button; default keeps the gate", () => {
    const off = renderToStaticMarkup(
      <ForgotPasswordForm
        initialEmail=""
        linkExpired={false}
        turnstileSiteKey={null}
      />,
    );
    expect(off).toContain("Couldn&#x27;t load the human check");
    expect(submitEnabled(off, "Send reset link")).toBe(false);

    const on = renderToStaticMarkup(
      <ForgotPasswordForm
        initialEmail=""
        linkExpired={false}
        turnstileSiteKey={null}
        challengeDisabled
      />,
    );
    expect(on).not.toContain("human check");
    expect(submitEnabled(on, "Send reset link")).toBe(true);
  });
});

describe("one decision point, server-side only", () => {
  const SRC = path.join(__dirname, "../../src");
  const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory()
        ? walk(full)
        : /\.(ts|tsx)$/.test(name)
          ? [full]
          : [];
    });
  }

  it("both pages and server verification decide through isTurnstileBypassEnabled", () => {
    for (const file of [
      "app/signup/page.tsx",
      "app/forgot-password/page.tsx",
      "lib/accounts/turnstile.ts",
      "lib/accounts/signup.ts",
    ]) {
      expect(read(file)).toContain("isTurnstileBypassEnabled(");
    }
  });

  it("TURNSTILE_DISABLED is read only by the server-only helper", () => {
    // An env read (`env.X`, `process.env.X`, `env["X"]`), not a comment.
    const read_ =
      /\.TURNSTILE_DISABLED\b|\[\s*["'`]TURNSTILE_DISABLED["'`]\s*\]/;
    const readers = walk(SRC).filter((f) =>
      read_.test(readFileSync(f, "utf8")),
    );
    expect(readers.map((f) => path.relative(SRC, f))).toEqual([
      path.join("lib", "accounts", "turnstile-bypass.ts"),
    ]);
    expect(read("lib/accounts/turnstile-bypass.ts")).toMatch(
      /^import "server-only";/,
    );
  });

  it("login has no bot challenge, so it needs no bypass", () => {
    const login = walk(path.join(SRC, "app/login"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(login).not.toMatch(/verifyChallenge|BotChallenge|turnstile/i);
  });
});
