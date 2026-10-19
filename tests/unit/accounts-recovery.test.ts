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
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { NextRequest } from "next/server";
import {
  isRecoverySession,
  RECOVERY_SESSION_MAX_AGE_SECONDS,
  RESET_REQUEST_MIN_MS,
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

describe("requestPasswordResetAction — same answer for every address (PRD)", () => {
  const idle: ForgotState = { status: "idle", email: "", error: null };
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  async function submit(email: string) {
    const pending = requestPasswordResetAction(idle, form({ email }));
    await jest.advanceTimersByTimeAsync(RESET_REQUEST_MIN_MS);
    return pending;
  }

  it("known, unknown, rate-limited, and failing requests are indistinguishable", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const outcomes = [];
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    outcomes.push(await submit("will@example.com")); // known
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    outcomes.push(await submit("will@example.com")); // unknown (same reply)
    resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    outcomes.push(await submit("will@example.com")); // only known emails get this
    resetPasswordForEmail.mockRejectedValueOnce(new Error("fetch failed"));
    outcomes.push(await submit("will@example.com"));
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

  it("never answers faster than the floor, so timing can't tell them apart", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    let settled = false;
    const pending = requestPasswordResetAction(
      idle,
      form({ email: "a@b.co" }),
    ).then(() => (settled = true));
    await jest.advanceTimersByTimeAsync(RESET_REQUEST_MIN_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it("asks the auth service with the normalized email", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await submit("  Will@Example.com ");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("will@example.com");
  });

  it("only shape problems are reported, before any request", async () => {
    expect(
      await requestPasswordResetAction(idle, form({ email: "" })),
    ).toMatchObject({ status: "invalid", error: "Enter your email." });
    expect(
      await requestPasswordResetAction(idle, form({ email: "will@example" })),
    ).toMatchObject({
      status: "invalid",
      error: "Enter a valid email address.",
    });
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
    updateUser.mockResolvedValueOnce({ error: { code: "weak_password" } });
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

  it("on success signs out every other session, then goes to Today", async () => {
    getClaims.mockResolvedValue(fresh());
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    await expect(
      setNewPasswordAction(idle, form({ password: "new-pass-1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/?notice=password-updated");
    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });
});
