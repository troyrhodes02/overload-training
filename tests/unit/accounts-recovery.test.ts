const resetPasswordForEmail = jest.fn();
const verifyOtp = jest.fn();
const getClaims = jest.fn();
const updateUser = jest.fn();
const signOut = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(async () => ({
    auth: { resetPasswordForEmail, verifyOtp, getClaims, updateUser, signOut },
  })),
}));
// Work scheduled with after() is captured here and run by the test, so it is
// observable that the reply never waits for the auth service.
const deferred: (() => Promise<void> | void)[] = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: jest.fn((task: () => Promise<void> | void) => {
    deferred.push(task);
  }),
}));
async function runDeferred() {
  while (deferred.length) await deferred.shift()!();
}
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { NextRequest } from "next/server";
import {
  isRecoveryOnlySession,
  isRecoverySession,
  jwtPayload,
  newPasswordErrorFor,
  RECOVERY_SESSION_MAX_AGE_SECONDS,
} from "@/lib/accounts/recovery";
import {
  requestPasswordResetAction,
  type ForgotState,
} from "@/app/forgot-password/actions";
import { GET as confirm } from "@/app/auth/confirm/route";
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

describe("isRecoverySession (spec R8)", () => {
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
});

describe("isRecoveryOnlySession / jwtPayload (spec R26)", () => {
  it("only an otp/recovery sign-in without a password sign-in is recovery-only", () => {
    expect(isRecoveryOnlySession({ amr: [{ method: "otp" }] })).toBe(true);
    expect(isRecoveryOnlySession({ amr: [{ method: "recovery" }] })).toBe(true);
    expect(isRecoveryOnlySession({ amr: [{ method: "password" }] })).toBe(
      false,
    );
    expect(
      isRecoveryOnlySession({
        amr: [{ method: "password" }, { method: "otp" }],
      }),
    ).toBe(false);
    expect(isRecoveryOnlySession(null)).toBe(false);
  });

  it("reads a token's payload (base64url, no padding) and tolerates junk", () => {
    const payload = Buffer.from(
      JSON.stringify({ amr: [{ method: "otp" }], sub: "ü-x" }),
    ).toString("base64url");
    expect(jwtPayload(`h.${payload}.s`)).toEqual({
      amr: [{ method: "otp" }],
      sub: "ü-x".normalize(),
    });
    expect(jwtPayload("not-a-jwt")).toBeNull();
    expect(jwtPayload(undefined)).toBeNull();
    expect(jwtPayload("h.%%%.s")).toBeNull();
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
    expect(
      newPasswordErrorFor({ code: "weak_password", reasons: ["pwned"] }),
    ).toBe("Choose a stronger password.");
    expect(newPasswordErrorFor({ code: "same_password" })).toBe(
      "Choose a password you haven't used here.",
    );
    expect(newPasswordErrorFor({ code: "other" })).toBeNull();
  });
});

describe("requestPasswordResetAction — same answer for every address (PRD)", () => {
  const idle: ForgotState = { status: "idle", email: "", error: null };
  beforeEach(() => {
    jest.clearAllMocks();
    deferred.length = 0;
  });

  it("answers BEFORE asking the auth service, identically for every outcome (R23)", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const outcomes = [];
    for (const service of [
      async () => ({ data: {}, error: null }), // known
      async () => ({ data: {}, error: null }), // unknown (same reply)
      async () => ({
        data: null,
        error: { code: "over_email_send_rate_limit", status: 429 },
      }), // only known emails get this
      async () => {
        throw new Error("fetch failed");
      },
    ]) {
      resetPasswordForEmail.mockImplementationOnce(service);
      const state = await requestPasswordResetAction(
        idle,
        form({ email: "will@example.com" }),
      );
      // The reply exists before the request was even made.
      expect(resetPasswordForEmail).not.toHaveBeenCalled();
      outcomes.push(state);
      await runDeferred();
      expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
      resetPasswordForEmail.mockClear();
    }
    for (const o of outcomes) {
      expect(o).toEqual({
        status: "sent",
        email: "will@example.com",
        error: null,
      });
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain("will@example.com");
    log.mockRestore();
  });

  it("asks the auth service with the normalized email", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await requestPasswordResetAction(
      idle,
      form({ email: "  Will@Example.com " }),
    );
    await runDeferred();
    expect(resetPasswordForEmail).toHaveBeenCalledWith("will@example.com");
  });

  it("only shape problems are reported, and nothing is scheduled", async () => {
    expect(
      await requestPasswordResetAction(idle, form({ email: "" })),
    ).toMatchObject({ status: "invalid", error: "Enter your email." });
    expect(
      await requestPasswordResetAction(idle, form({ email: "will@example" })),
    ).toMatchObject({
      status: "invalid",
      error: "Enter a valid email address.",
    });
    expect(deferred).toHaveLength(0);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("GET /auth/confirm (spec R7)", () => {
  beforeEach(() => jest.clearAllMocks());
  const hit = (qs: string) =>
    confirm(new NextRequest(`http://localhost:3000/auth/confirm${qs}`));
  const target = (res: Response) =>
    new URL(res.headers.get("location") ?? "").pathname +
    new URL(res.headers.get("location") ?? "").search;

  it("a verified recovery token continues to /reset-password", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: null });
    const res = await hit("?token_hash=abc&type=recovery");
    expect(res.status).toBe(303);
    expect(target(res)).toBe("/reset-password");
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
  });

  it("expired, used, other types, or no token → the request form, expired notice", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: { code: "otp_expired" } });
    expect(target(await hit("?token_hash=abc&type=recovery"))).toBe(
      "/forgot-password?link=expired",
    );
    expect(target(await hit("?token_hash=abc&type=signup"))).toBe(
      "/forgot-password?link=expired",
    );
    expect(target(await hit("?type=recovery"))).toBe(
      "/forgot-password?link=expired",
    );
    verifyOtp.mockRejectedValue(new Error("down"));
    expect(target(await hit("?token_hash=abc&type=recovery"))).toBe(
      "/forgot-password?link=expired",
    );
  });
});

describe("setNewPasswordAction (spec R8)", () => {
  const idle: ResetState = {
    status: "idle",
    fieldError: null,
    formError: null,
  };
  const fresh = () => ({
    data: {
      claims: {
        amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
      },
    },
  });
  beforeEach(() => jest.clearAllMocks());

  it("an ordinary password session can't set a password", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [
            { method: "password", timestamp: Math.floor(Date.now() / 1000) },
          ],
        },
      },
    });
    expect(
      await setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).toEqual({ status: "expired", fieldError: null, formError: null });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("maps weak, same, and unexpected refusals", async () => {
    getClaims.mockResolvedValue(fresh());
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    updateUser.mockResolvedValueOnce({
      error: { code: "weak_password", reasons: ["length"] },
    });
    expect(
      (await setNewPasswordAction(idle, form({ password: "x" }))).fieldError,
    ).toBe("Use at least 6 characters.");
    updateUser.mockResolvedValueOnce({ error: { code: "same_password" } });
    expect(
      (await setNewPasswordAction(idle, form({ password: "old-pass" })))
        .fieldError,
    ).toBe("Choose a password you haven't used here.");
    updateUser.mockResolvedValueOnce({ error: { code: "unexpected_failure" } });
    expect(
      await setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).toMatchObject({ status: "error", fieldError: null });
    expect(
      (await setNewPasswordAction(idle, form({ password: "" }))).fieldError,
    ).toBe("Enter a new password.");
    log.mockRestore();
  });

  it("on success signs out EVERY session, this one included, and asks for a fresh sign-in (R26)", async () => {
    getClaims.mockResolvedValue(fresh());
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    await expect(
      setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/login?notice=password-updated");
    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
