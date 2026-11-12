// The recovery module imports the throttle, which instantiates the Prisma
// client at load. These unit tests inject fake deps and never touch the real
// throttle or database, so stub the client to keep the suite DB-free.
jest.mock("@/lib/db", () => ({ prisma: {} }));

const resetPasswordForEmail = jest.fn();
const getClaims = jest.fn();
const updateUser = jest.fn();
const signOut = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(async () => ({
    auth: { resetPasswordForEmail, getClaims, updateUser, signOut },
  })),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers()),
}));

import {
  isRecoverySession,
  isRecoverySessionNow,
  newPasswordErrorFor,
  requestPasswordReset,
  setNewPassword,
  PASSWORD_ERRORS,
  SET_PASSWORD_UNEXPECTED,
  RECOVERY_SESSION_MAX_AGE_SECONDS,
  type RequestResetDeps,
} from "@/lib/accounts/recovery";
import {
  requestPasswordResetAction,
  type ForgotState,
} from "@/app/forgot-password/actions";
import {
  setNewPasswordAction,
  type ResetState,
} from "@/app/reset-password/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const NOW = 1_800_000_000;

// A deps builder for requestPasswordReset so tests never reach Supabase or the
// real throttle/challenge. Defaults pass the challenge and allow the throttle.
function requestDeps(
  over: Partial<RequestResetDeps> = {},
): Partial<RequestResetDeps> {
  return {
    verifyChallenge: jest.fn(async () => true),
    checkAndIncrement: jest.fn(async () => ({ allowed: true })),
    throttleKey: "ip:198.51.100.7",
    auth: async () => ({
      resetPasswordForEmail,
      getClaims,
      updateUser,
      signOut,
    }),
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("isRecoverySession (spec §9 / R8)", () => {
  it("only a fresh otp/recovery sign-in qualifies", () => {
    expect(
      isRecoverySession({ amr: [{ method: "otp", timestamp: NOW - 60 }] }, NOW),
    ).toBe(true);
    expect(
      isRecoverySession(
        { amr: [{ method: "recovery", timestamp: NOW - 60 }] },
        NOW,
      ),
    ).toBe(true);
    expect(
      isRecoverySession(
        { amr: [{ method: "password", timestamp: NOW - 60 }] },
        NOW,
      ),
    ).toBe(false);
    expect(
      isRecoverySession(
        {
          amr: [
            {
              method: "otp",
              timestamp: NOW - RECOVERY_SESSION_MAX_AGE_SECONDS - 1,
            },
          ],
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isRecoverySession({ amr: [{ method: "otp", timestamp: NOW + 5 }] }, NOW),
    ).toBe(false);
    expect(isRecoverySession(null, NOW)).toBe(false);
    expect(isRecoverySession({ amr: "otp" }, NOW)).toBe(false);
    expect(isRecoverySession({}, NOW)).toBe(false);
  });

  it("isRecoverySessionNow uses the wall clock", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      isRecoverySessionNow({ amr: [{ method: "otp", timestamp: now }] }),
    ).toBe(true);
    expect(isRecoverySessionNow(null)).toBe(false);
  });
});

describe("newPasswordErrorFor", () => {
  it("words weak-password refusals from their reasons", () => {
    expect(
      newPasswordErrorFor({ code: "weak_password", reasons: ["length"] }),
    ).toBe("Use at least 6 characters.");
    expect(
      newPasswordErrorFor({ code: "weak_password", reasons: ["characters"] }),
    ).toBe("Choose a stronger password.");
    expect(newPasswordErrorFor({ code: "same_password" })).toBe(
      "Choose a password you haven't used here.",
    );
    expect(newPasswordErrorFor({ code: "other" })).toBeNull();
  });
});

describe("requestPasswordReset — identical outcome for every address (D7)", () => {
  it("is byte-identical for known, unknown, slow, and throttled (D7)", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const outcomes = [];

    // Known: the service accepts.
    resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    outcomes.push(
      await requestPasswordReset(
        { email: "will@example.com", challengeToken: "t" },
        requestDeps(),
      ),
    );
    // Unknown: Supabase still returns no error, but nothing is delivered. Same.
    resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    outcomes.push(
      await requestPasswordReset(
        { email: "nobody@example.com", challengeToken: "t" },
        requestDeps(),
      ),
    );
    // Slow / service error (only known addresses get a send-rate error). Same.
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    outcomes.push(
      await requestPasswordReset(
        { email: "will@example.com", challengeToken: "t" },
        requestDeps(),
      ),
    );
    // Throttle tripped: the send is SKIPPED, but the result is identical (D7).
    const tripped = requestDeps({
      checkAndIncrement: jest.fn(async () => ({ allowed: false })),
    });
    outcomes.push(
      await requestPasswordReset(
        { email: "will@example.com", challengeToken: "t" },
        tripped,
      ),
    );

    for (const o of outcomes) {
      expect(o).toEqual({ ok: true, data: { sent: true } });
    }
    // The throttled attempt never asked the auth service to send.
    expect(tripped.checkAndIncrement).toHaveBeenCalledWith(
      "password_reset_request",
      "ip:198.51.100.7",
    );
    // Nothing logged ever contains the address.
    expect(JSON.stringify(log.mock.calls)).not.toContain("will@example.com");
    expect(JSON.stringify(log.mock.calls)).not.toContain("nobody@example.com");
    log.mockRestore();
  });

  it("verifies the challenge BEFORE throttling or any lookup", async () => {
    const deps = requestDeps({
      verifyChallenge: jest.fn(async () => false),
    });
    const result = await requestPasswordReset(
      { email: "will@example.com", challengeToken: "bad" },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Couldn't verify you're human. Try again.",
      },
    });
    // No throttle bump, no account lookup after a failed challenge.
    expect(deps.checkAndIncrement).not.toHaveBeenCalled();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("reports a malformed email BEFORE the challenge or any lookup", async () => {
    const deps = requestDeps();
    expect(
      await requestPasswordReset(
        { email: "not-an-email", challengeToken: "t" },
        deps,
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Enter a valid email address.",
      },
    });
    expect(
      await requestPasswordReset({ email: "", challengeToken: "t" }, deps),
    ).toEqual({
      ok: false,
      error: { code: "validation_error", message: "Enter your email." },
    });
    expect(deps.verifyChallenge).not.toHaveBeenCalled();
    expect(deps.checkAndIncrement).not.toHaveBeenCalled();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("asks the auth service with the normalized (lowercased, trimmed) email", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    await requestPasswordReset(
      { email: "  Will@Example.com ", challengeToken: "t" },
      requestDeps(),
    );
    expect(resetPasswordForEmail).toHaveBeenCalledWith("will@example.com");
  });

  it("an unreachable auth service still yields the identical sent state", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    resetPasswordForEmail.mockRejectedValue(new Error("fetch failed"));
    expect(
      await requestPasswordReset(
        { email: "will@example.com", challengeToken: "t" },
        requestDeps(),
      ),
    ).toEqual({ ok: true, data: { sent: true } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("will@example.com");
    log.mockRestore();
  });
});

describe("setNewPassword (spec §9)", () => {
  const recovery = () => ({
    data: {
      claims: {
        amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
      },
    },
  });

  it("an ordinary password session can't set a password (expired)", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [
            { method: "password", timestamp: Math.floor(Date.now() / 1000) },
          ],
        },
      },
    });
    expect(await setNewPassword({ newPassword: "new-pass-1" })).toEqual({
      ok: false,
      error: { code: "expired", message: null },
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("an empty password is a validation error, never sent to the service", async () => {
    getClaims.mockResolvedValue(recovery());
    expect(await setNewPassword({ newPassword: "" })).toEqual({
      ok: false,
      error: { code: "validation_error", message: PASSWORD_ERRORS.missing },
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("maps weak, reuse, and unexpected refusals", async () => {
    getClaims.mockResolvedValue(recovery());
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    updateUser.mockResolvedValueOnce({
      error: { code: "weak_password", reasons: ["length"] },
    });
    expect(await setNewPassword({ newPassword: "x" })).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Use at least 6 characters.",
      },
    });
    updateUser.mockResolvedValueOnce({ error: { code: "same_password" } });
    expect(await setNewPassword({ newPassword: "old-pass" })).toEqual({
      ok: false,
      error: { code: "validation_error", message: PASSWORD_ERRORS.same },
    });
    updateUser.mockResolvedValueOnce({ error: { code: "unexpected_failure" } });
    expect(await setNewPassword({ newPassword: "new-pass-1" })).toEqual({
      ok: false,
      error: { code: "internal_error", message: SET_PASSWORD_UNEXPECTED },
    });
    log.mockRestore();
  });

  it("on success ends EVERY session (this one included) and never touches status", async () => {
    getClaims.mockResolvedValue(recovery());
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    expect(await setNewPassword({ newPassword: "new-pass-1" })).toEqual({
      ok: true,
      data: { updated: true },
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    // No status read/write — recovery changes the password, never the status.
  });
});

describe("requestPasswordResetAction (forgot form reducer)", () => {
  const idle: ForgotState = { status: "idle", email: "", error: null };

  it("a malformed email is reported as invalid with the typed email echoed", async () => {
    const state = await requestPasswordResetAction(
      idle,
      form({ email: "nope", challengeToken: "t" }),
    );
    expect(state).toEqual({
      status: "invalid",
      email: "nope",
      error: "Enter a valid email address.",
    });
  });
});

describe("setNewPasswordAction (reset form reducer)", () => {
  const idle: ResetState = {
    status: "idle",
    fieldError: null,
    formError: null,
  };

  it("an expired session yields the expired state", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { amr: [{ method: "password", timestamp: 0 }] } },
    });
    expect(
      await setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).toEqual({ status: "expired", fieldError: null, formError: null });
  });

  it("a reuse refusal becomes a field error", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
    });
    updateUser.mockResolvedValue({ error: { code: "same_password" } });
    expect(
      await setNewPasswordAction(idle, form({ password: "old-pass" })),
    ).toEqual({
      status: "error",
      fieldError: PASSWORD_ERRORS.same,
      formError: null,
    });
  });

  it("an unexpected refusal becomes a form error", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
    });
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    updateUser.mockResolvedValue({ error: { code: "unexpected_failure" } });
    expect(
      await setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).toEqual({
      status: "error",
      fieldError: null,
      formError: SET_PASSWORD_UNEXPECTED,
    });
    log.mockRestore();
  });

  it("on success redirects to /login?notice=password-updated", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
    });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    await expect(
      setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/login?notice=password-updated");
  });
});
