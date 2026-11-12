/**
 * OVE-121 (mobile audit F-A1): an account becomes email-verified ONLY in the
 * /auth/confirm request that verified an email-verification token, and only
 * when the verified email matches the account's current email. /verify-email
 * is display-only: a direct visit, signed in or not, never writes.
 */
const updateMany = jest.fn(async () => ({ count: 1 }));
let storedVerifiedAt: Date | null = null;
const findUnique = jest.fn(async () => ({ emailVerifiedAt: storedVerifiedAt }));
const createAccountClient = jest.fn((id: string) => {
  void id;
  return { profile: { updateMany, findUnique } };
});
jest.mock("@/lib/data/account-db", () => ({
  createAccountClient: (id: string) => createAccountClient(id),
}));
const getAuthUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getAuthUser: (...args: unknown[]) => getAuthUser(...args),
}));
jest.mock("next/server", () => ({ connection: jest.fn(async () => {}) }));

import type { ReactElement } from "react";
import {
  confirmEmailVerificationLink,
  getOwnEmailVerificationState,
  type VerificationLinkAuth,
} from "@/lib/data/email-verification";
import VerifyEmailPage from "@/app/verify-email/page";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "Lifter@X.test",
};
const NOW = new Date("2026-11-11T12:00:00.000Z");

function auth(
  over: {
    verifyOtp?: VerificationLinkAuth["verifyOtp"];
    getUser?: VerificationLinkAuth["getUser"];
  } = {},
) {
  const verifyOtp = jest.fn(
    over.verifyOtp ??
      (async () => ({
        data: { user: USER, session: { access_token: "jwt" } },
        error: null,
      })),
  );
  const getUser = jest.fn(
    over.getUser ??
      (async () => ({
        data: { user: { id: USER.id, email: "lifter@x.test" } },
        error: null,
      })),
  );
  return { verifyOtp, getUser } satisfies VerificationLinkAuth;
}

beforeEach(() => {
  updateMany.mockClear();
  findUnique.mockClear();
  createAccountClient.mockClear();
  getAuthUser.mockReset();
  storedVerifiedAt = null;
});

describe("confirmEmailVerificationLink — the only writer of emailVerifiedAt", () => {
  it("a valid confirm verifies the token's own account, only where still null", async () => {
    storedVerifiedAt = NOW;
    const a = auth();
    const outcome = await confirmEmailVerificationLink(
      a,
      { type: "magiclink", tokenHash: "tok" },
      { now: () => NOW },
    );
    expect(outcome).toBe("verified");
    expect(a.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "tok",
    });
    // The account is looked up by the NEW session's token, never the cookie.
    expect(a.getUser).toHaveBeenCalledWith("jwt");
    expect(createAccountClient).toHaveBeenCalledWith(USER.id);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: NOW },
    });
  });

  it("an invalid or expired token records nothing", async () => {
    const a = auth({
      verifyOtp: async () => ({
        data: { user: null, session: null },
        error: { message: "expired" },
      }),
    });
    expect(
      await confirmEmailVerificationLink(a, { type: "email", tokenHash: "x" }),
    ).toBe("invalid");
    expect(a.getUser).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("a thrown verifyOtp records nothing", async () => {
    const a = auth({
      verifyOtp: async () => {
        throw new Error("network");
      },
    });
    expect(
      await confirmEmailVerificationLink(a, { type: "email", tokenHash: "x" }),
    ).toBe("invalid");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("a wrong-email token (verified email differs from the account's) records nothing", async () => {
    const a = auth({
      getUser: async () => ({
        data: { user: { id: USER.id, email: "someone-else@x.test" } },
        error: null,
      }),
    });
    expect(
      await confirmEmailVerificationLink(a, {
        type: "magiclink",
        tokenHash: "t",
      }),
    ).toBe("not_verified");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("a token whose session belongs to a different account records nothing", async () => {
    const a = auth({
      getUser: async () => ({
        data: {
          user: {
            id: "22222222-2222-4222-8222-222222222222",
            email: USER.email,
          },
        },
        error: null,
      }),
    });
    expect(
      await confirmEmailVerificationLink(a, {
        type: "magiclink",
        tokenHash: "t",
      }),
    ).toBe("not_verified");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("a verified token without an email, or without a session, records nothing", async () => {
    const noEmail = auth({
      verifyOtp: async () => ({
        data: {
          user: { id: USER.id, email: null },
          session: { access_token: "j" },
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: { id: USER.id, email: null } },
        error: null,
      }),
    });
    expect(
      await confirmEmailVerificationLink(noEmail, {
        type: "email",
        tokenHash: "t",
      }),
    ).toBe("not_verified");
    const noSession = auth({
      verifyOtp: async () => ({
        data: { user: USER, session: null },
        error: null,
      }),
    });
    expect(
      await confirmEmailVerificationLink(noSession, {
        type: "email",
        tokenHash: "t",
      }),
    ).toBe("invalid");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(["recovery", "invite", "bogus", ""])(
    "a %s token is never a verification: verifyOtp isn't even called",
    async (type) => {
      const a = auth();
      expect(
        await confirmEmailVerificationLink(a, { type, tokenHash: "t" }),
      ).toBe("invalid");
      expect(a.verifyOtp).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it("a database failure after the token verified is reported, not thrown, and nothing is claimed", async () => {
    updateMany.mockRejectedValueOnce(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await confirmEmailVerificationLink(auth(), {
        type: "magiclink",
        tokenHash: "t",
      }),
    ).toBe("not_verified");
    spy.mockRestore();
  });
});

describe("/verify-email is display-only (a direct visit never verifies)", () => {
  async function render(searchParams: { error?: string } = {}) {
    const element = (await VerifyEmailPage({
      searchParams: Promise.resolve(searchParams),
    })) as ReactElement<{ children: ReactElement<{ state: string }> }>;
    return element.props.children.props;
  }

  it("signed in and unverified: shows 'not verified' and writes nothing", async () => {
    getAuthUser.mockResolvedValue({ id: USER.id, email: USER.email });
    storedVerifiedAt = null;
    expect((await render()).state).toBe("unverified");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("signed in and already verified: shows the stored verified state, writes nothing", async () => {
    getAuthUser.mockResolvedValue({ id: USER.id, email: USER.email });
    storedVerifiedAt = NOW;
    expect((await render()).state).toBe("verified");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("signed out: shows the sign-in prompt and touches no account", async () => {
    getAuthUser.mockResolvedValue(null);
    expect((await render()).state).toBe("signed_out");
    expect(createAccountClient).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("the expired door still shows the expired card", async () => {
    getAuthUser.mockResolvedValue({ id: USER.id, email: USER.email });
    expect((await render({ error: "expired" })).state).toBe("expired");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("getOwnEmailVerificationState reads only (no write, no profile creation)", async () => {
    getAuthUser.mockResolvedValue({ id: USER.id, email: USER.email });
    await getOwnEmailVerificationState();
    expect(findUnique).toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
