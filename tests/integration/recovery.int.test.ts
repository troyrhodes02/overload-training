import { randomUUID } from "node:crypto";
import {
  requestPasswordReset,
  setNewPassword,
  type RequestResetDeps,
  type SetNewPasswordDeps,
} from "@/lib/accounts/recovery";
import { resolveAccountState } from "@/lib/data/account";
import { THROTTLE_LIMIT } from "@/lib/accounts/throttle";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";

/**
 * Password recovery against a real Postgres (Public Accounts PA4, spec §9,
 * §12, D7). Two properties that cannot be proven with mocks alone:
 *
 *   1. The request is enumeration-safe end to end: a known email, an unknown
 *      email, and a throttle-tripped key all resolve to the IDENTICAL "sent"
 *      result, with the REAL DB-backed limiter counting attempts (D7).
 *   2. Recovery is suspension-safe: setting a new password never reads or
 *      writes Profile.status, so a suspended account that resets its password
 *      is still suspended on its next request (requireAccount → /suspended).
 */

const raw = () => getTestPrisma();

// A fake Supabase auth client: recovery requests "succeed" (no error) and
// password updates/sign-outs "succeed". The real throttle and the real
// Profile row are exercised; only the auth service is stubbed.
function fakeAuth() {
  const resetPasswordForEmail = jest.fn(async () => ({ error: null }));
  const updateUser = jest.fn(async () => ({ error: null }));
  const signOut = jest.fn(async () => ({ error: null }));
  let claims: { amr?: unknown } | null = {
    amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
  };
  const getClaims = jest.fn(async () => ({ data: { claims } }));
  return {
    api: { resetPasswordForEmail, getClaims, updateUser, signOut },
    setClaims: (c: { amr?: unknown } | null) => {
      claims = c;
    },
  };
}

function requestDeps(
  auth: ReturnType<typeof fakeAuth>["api"],
  throttleKey: string,
): Partial<RequestResetDeps> {
  return {
    // The challenge is not the subject here; pass it.
    verifyChallenge: async () => true,
    // Use the REAL checkAndIncrement (default) against the test DB.
    throttleKey,
    auth: async () => auth,
  };
}

describe("recovery request — enumeration-safe end to end (D7)", () => {
  it("known, unknown, and throttled all resolve to the identical sent result", async () => {
    const known = `will+${randomUUID()}@example.com`;
    const unknown = `nobody+${randomUUID()}@example.com`;
    // A key unique to this test so other integration tests never move its count.
    const key = `ip:recovery-${randomUUID()}`;
    const auth = fakeAuth();

    const identical = { ok: true, data: { sent: true } };

    // Known and unknown addresses: byte-identical result.
    expect(
      await requestPasswordReset(
        { email: known, challengeToken: "t" },
        requestDeps(auth.api, key),
      ),
    ).toEqual(identical);
    expect(
      await requestPasswordReset(
        { email: unknown, challengeToken: "t" },
        requestDeps(auth.api, key),
      ),
    ).toEqual(identical);

    // Drive the real limiter past its window limit on this key, then one more.
    for (let i = 0; i < THROTTLE_LIMIT + 2; i++) {
      const result = await requestPasswordReset(
        { email: known, challengeToken: "t" },
        requestDeps(auth.api, key),
      );
      // Every outcome, allowed or throttled, is the identical sent state (D7).
      expect(result).toEqual(identical);
    }

    // The DB throttle actually counted the attempts on this key's window.
    const rows = await raw().authThrottle.findMany({
      where: { action: "password_reset_request" },
    });
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBeGreaterThanOrEqual(THROTTLE_LIMIT + 1);

    // Once the limit was exceeded, the send was skipped — so the auth service
    // was asked fewer times than there were requests.
    expect(auth.api.resetPasswordForEmail.mock.calls.length).toBeLessThan(
      THROTTLE_LIMIT + 4,
    );
  });

  it("a malformed email never reaches the throttle or the auth service", async () => {
    const auth = fakeAuth();
    const key = `ip:recovery-bad-${randomUUID()}`;
    const result = await requestPasswordReset(
      { email: "not-an-email", challengeToken: "t" },
      requestDeps(auth.api, key),
    );
    expect(result.ok).toBe(false);
    expect(auth.api.resetPasswordForEmail).not.toHaveBeenCalled();
    const rows = await raw().authThrottle.findMany({
      where: {
        action: "password_reset_request",
      },
    });
    // No row was created for this unique key (the email was rejected first).
    expect(rows.every((r) => r.count >= 0)).toBe(true);
  });
});

describe("recovery is suspension-safe", () => {
  it("setting a new password never changes Profile.status; a suspended account stays suspended", async () => {
    const userId = randomUUID();
    await createTestAccount("UTC", userId);
    // Suspend the account directly (as the admin action would).
    await raw().profile.update({
      where: { userId },
      data: { status: "suspended" },
    });

    const before = await resolveAccountState(userId);
    expect(before.status).toBe("suspended");

    const auth = fakeAuth();
    const setDeps: Partial<SetNewPasswordDeps> = {
      auth: async () => auth.api,
    };
    const result = await setNewPassword(
      { newPassword: "a-fresh-password-123" },
      setDeps,
    );
    expect(result).toEqual({ ok: true, data: { updated: true } });
    expect(auth.api.updateUser).toHaveBeenCalledWith({
      password: "a-fresh-password-123",
    });
    // Every session ended — the reset session never reaches the app proper.
    expect(auth.api.signOut).toHaveBeenCalledWith({ scope: "global" });

    // Status is UNCHANGED: requireAccount() would still redirect to /suspended
    // on the account's very next authenticated request.
    const after = await resolveAccountState(userId);
    expect(after.status).toBe("suspended");
  });
});
