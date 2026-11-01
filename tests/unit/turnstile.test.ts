import { verifyChallenge } from "@/lib/accounts/turnstile";

/**
 * Server-side Turnstile verification (Public Accounts, R6). The server is the
 * gate; a missing/faked token never passes, the non-production bypass is gated
 * on NODE_ENV and an unset secret (never client-controllable), and production
 * always requires a real key and a real verify.
 */
describe("verifyChallenge (Public Accounts, R6)", () => {
  const PROD = { NODE_ENV: "production" };
  const TEST = { NODE_ENV: "test" };
  const WITH_SECRET = {
    NODE_ENV: "production",
    TURNSTILE_SECRET_KEY: "s3cret",
  };

  it("calls siteverify with the token and secret and returns its result", async () => {
    const verify = jest.fn(async () => true);
    await expect(
      verifyChallenge("tok", { env: WITH_SECRET, verify }),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith("tok", "s3cret");

    const deny = jest.fn(async () => false);
    await expect(
      verifyChallenge("tok", { env: WITH_SECRET, verify: deny }),
    ).resolves.toBe(false);
  });

  it("rejects a missing/empty/non-string token even with a secret configured", async () => {
    const verify = jest.fn(async () => true);
    for (const bad of ["", "   ", undefined, null, 42, {}]) {
      await expect(
        verifyChallenge(bad, { env: WITH_SECRET, verify }),
      ).resolves.toBe(false);
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails closed when siteverify throws (transport error is never a pass)", async () => {
    const verify = jest.fn(async () => {
      throw new Error("network");
    });
    await expect(
      verifyChallenge("tok", { env: WITH_SECRET, verify }),
    ).resolves.toBe(false);
  });

  it("in production with NO secret, always fails (no skip, ever)", async () => {
    const verify = jest.fn(async () => true);
    await expect(verifyChallenge("tok", { env: PROD, verify })).resolves.toBe(
      false,
    );
    await expect(verifyChallenge("", { env: PROD, verify })).resolves.toBe(
      false,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("in a non-production env with NO secret, a present token is the documented bypass", async () => {
    const verify = jest.fn(async () => true);
    // A present token passes without reaching Cloudflare …
    await expect(
      verifyChallenge("anything", { env: TEST, verify }),
    ).resolves.toBe(true);
    // … but a missing token still fails (the server-is-the-gate rule holds).
    await expect(verifyChallenge("", { env: TEST, verify })).resolves.toBe(
      false,
    );
    await expect(
      verifyChallenge(undefined, { env: TEST, verify }),
    ).resolves.toBe(false);
    // The bypass never calls the real verifier.
    expect(verify).not.toHaveBeenCalled();
  });

  it("the bypass is gated on NODE_ENV, not on anything a client sends", async () => {
    const verify = jest.fn(async () => true);
    // Even an empty-string NODE_ENV is not "production", so the bypass applies;
    // but ONLY the server sets NODE_ENV — the token value never changes the gate.
    await expect(
      verifyChallenge("x", { env: { NODE_ENV: "development" }, verify }),
    ).resolves.toBe(true);
  });
});
