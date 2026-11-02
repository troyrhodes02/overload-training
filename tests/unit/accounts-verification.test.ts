// Email verification (Public Accounts spec §9 verification, §5, R2; OVE-85).
// The verification module imports the account layer, which instantiates the
// Prisma client at load. These unit tests inject fake deps / a fake account
// and never touch the real database, so stub the client to keep the suite
// DB-free.
jest.mock("@/lib/db", () => ({ prisma: {} }));

const getUser = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(async () => ({
    auth: { getUser },
  })),
}));
// getAuthUser (the default ownEmail source) calls next/server connection(),
// which needs a request scope; mock the chokepoint so the default-dep path is
// exercisable in a unit test.
const getAuthUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getAuthUser: (...args: unknown[]) => getAuthUser(...args),
}));

import {
  sendVerificationEmail,
  confirmEmailVerification,
  getEmailVerification,
  type SendVerificationDeps,
} from "@/lib/accounts/verification";
import type { Account } from "@/lib/data/account";

type UpdateArgs = {
  where: { userId: string; emailVerifiedAt: null };
  data: { emailVerifiedAt: Date };
};
type OtpArgs = {
  email: string;
  options?: { shouldCreateUser?: boolean; emailRedirectTo?: string };
};

/** A fake account whose scoped db records the update it receives. */
function fakeAccount(
  userId = "11111111-1111-1111-1111-111111111111",
  profile: { emailVerifiedAt: Date | null } | null = { emailVerifiedAt: null },
) {
  const updateMany = jest.fn<Promise<{ count: number }>, [UpdateArgs]>(
    async () => ({ count: 1 }),
  );
  const findUnique = jest.fn(async () => profile);
  const account = {
    userId,
    timeZone: "UTC",
    db: { profile: { updateMany, findUnique } },
  } as unknown as Account;
  return { account, updateMany, findUnique };
}

describe("sendVerificationEmail — the account's OWN email only", () => {
  const OWN = "will@example.com";

  function sendDeps(over: Partial<SendVerificationDeps> = {}) {
    const signInWithOtp = jest.fn<Promise<{ error: null }>, [OtpArgs]>(
      async () => ({ error: null }),
    );
    const deps: Partial<SendVerificationDeps> = {
      ownEmail: jest.fn(async () => OWN),
      auth: jest.fn(async () => ({ signInWithOtp })),
      ...over,
    };
    return { deps, signInWithOtp };
  }

  it("sends a one-time email link (signInWithOtp) to the session email, never creating an account", async () => {
    // Regression (OVE-95 / billing verify bug): accounts are created already
    // confirmed in Supabase, so the old resend({type:"signup"}) no-op'd and no
    // email arrived. signInWithOtp actually sends to a confirmed user.
    const { account } = fakeAccount();
    const { deps, signInWithOtp } = sendDeps();
    const result = await sendVerificationEmail(account, deps);
    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    const [arg] = signInWithOtp.mock.calls[0];
    expect(arg.email).toBe(OWN);
    expect(arg.options?.shouldCreateUser).toBe(false);
  });

  it("never sends to an address other than the session's own email", async () => {
    const { account } = fakeAccount();
    const { deps, signInWithOtp } = sendDeps({
      ownEmail: jest.fn(async () => OWN),
    });
    await sendVerificationEmail(account, deps);
    const addresses = signInWithOtp.mock.calls.map(([arg]) => arg.email);
    expect(addresses).toEqual([OWN]);
    expect(addresses).not.toContain("victim@example.com");
  });

  it("refuses (and sends nothing) when there is no authenticated email", async () => {
    const { account } = fakeAccount();
    const { deps, signInWithOtp } = sendDeps({
      ownEmail: jest.fn(async () => null),
    });
    const result = await sendVerificationEmail(account, deps);
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Sign in and try again." },
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("surfaces a FAILURE when the auth service refuses the send (no false 'sent')", async () => {
    // The core of the reported bug: the lifter must not be told the email was
    // sent when it was not. This is the signed-in account's own, already-known
    // email, so there is no enumeration concern to hide behind.
    const { account } = fakeAccount();
    const signInWithOtp = jest.fn<
      Promise<{ error: { code: string } }>,
      [OtpArgs]
    >(async () => ({ error: { code: "over_email_send_rate_limit" } }));
    const result = await sendVerificationEmail(account, {
      ownEmail: jest.fn(async () => OWN),
      auth: jest.fn(async () => ({ signInWithOtp })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("internal_error");
  });

  it("surfaces a failure when the auth client throws", async () => {
    const { account } = fakeAccount();
    const result = await sendVerificationEmail(account, {
      ownEmail: jest.fn(async () => OWN),
      auth: jest.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(result.ok).toBe(false);
  });

  it("resolves its own email from the session, not from the caller", async () => {
    getAuthUser.mockResolvedValueOnce({ email: OWN });
    const { account } = fakeAccount();
    const signInWithOtp = jest.fn<Promise<{ error: null }>, [OtpArgs]>(
      async () => ({ error: null }),
    );
    await sendVerificationEmail(account, {
      auth: jest.fn(async () => ({ signInWithOtp })),
    });
    expect(getAuthUser).toHaveBeenCalled();
    expect(signInWithOtp.mock.calls[0][0].email).toBe(OWN);
  });
});

describe("confirmEmailVerification — scoped and idempotent", () => {
  it("sets emailVerifiedAt only where it is still null, scoped to the account", async () => {
    const { account, updateMany } = fakeAccount();
    const now = new Date("2026-10-29T12:00:00.000Z");
    const result = await confirmEmailVerification({
      now: () => now,
      actingAccount: async () => account,
    });
    expect(result).toEqual({ ok: true, data: { verified: true } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: account.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
  });

  it("re-confirming is a no-op that still reports verified (idempotent)", async () => {
    // The null filter means an already-set row matches nothing; count 0.
    const { account, updateMany } = fakeAccount();
    updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await confirmEmailVerification({
      actingAccount: async () => account,
    });
    expect(result).toEqual({ ok: true, data: { verified: true } });
  });

  it("writes through the acting account's scoped client (its own userId)", async () => {
    const { account, updateMany } = fakeAccount(
      "22222222-2222-2222-2222-222222222222",
    );
    await confirmEmailVerification({ actingAccount: async () => account });
    const [firstCall] = updateMany.mock.calls;
    expect(firstCall?.[0].where.userId).toBe(account.userId);
  });

  it("resolves the acting account from requireAccount by default (never from input)", async () => {
    // The default dep is the session chokepoint; it takes no account argument.
    const { account } = fakeAccount();
    const actingAccount = jest.fn(async () => account);
    await confirmEmailVerification({ actingAccount });
    expect(actingAccount).toHaveBeenCalledWith();
  });
});

describe("getEmailVerification — DTO for the Settings nudge", () => {
  it("reports verified when emailVerifiedAt is set", async () => {
    const { account } = fakeAccount(undefined, {
      emailVerifiedAt: new Date(),
    });
    expect(await getEmailVerification(account, "will@example.com")).toEqual({
      email: "will@example.com",
      verified: true,
    });
  });

  it("reports unverified when emailVerifiedAt is null", async () => {
    const { account } = fakeAccount(undefined, { emailVerifiedAt: null });
    expect(await getEmailVerification(account, "will@example.com")).toEqual({
      email: "will@example.com",
      verified: false,
    });
  });
});
