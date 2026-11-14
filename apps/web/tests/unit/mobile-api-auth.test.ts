/**
 * Pitch 21c (spec §7; RD-1, RD-6): bearer parsing, the Auth-server verdicts,
 * and the account lifecycle on the API — no profile is ever created, a
 * suspended account is refused with nothing recorded. The account layer is
 * mocked; the integration suite covers it against a real database.
 */
const resolveExistingAccountState = jest.fn();
const touchLastActive = jest.fn();
jest.mock("@/lib/data/account", () => ({
  resolveExistingAccountState: (...a: unknown[]) =>
    resolveExistingAccountState(...a),
  touchLastActive: (...a: unknown[]) => touchLastActive(...a),
}));

import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import {
  authenticateMobileRequest,
  parseBearerToken,
} from "@/lib/data/mobile-auth";
import { classifyAuthError } from "@/lib/data/access-token";

const TOKEN = "aaaa.bbbb.cccc";
const USER_ID = "00000000-0000-4000-8000-000000000001";

function req(authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost/api/mobile/v1/me", { headers });
}

beforeEach(() => {
  resolveExistingAccountState.mockReset();
  touchLastActive.mockReset();
});

describe("parseBearerToken", () => {
  it("accepts a JWT-shaped bearer token, any scheme case", () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parseBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    [null],
    [""],
    ["Bearer"],
    ["Bearer "],
    [`Basic ${TOKEN}`],
    [`Bearer  ${TOKEN}`],
    ["Bearer not-a-jwt"],
    ["Bearer a.b"],
    ["Bearer a.b.c.d"],
    ["Bearer a.b.c!"],
    [`Bearer ${"a".repeat(8190)}.b.c`],
  ])("rejects %p", (header) => {
    expect(parseBearerToken(header)).toBeNull();
  });
});

describe("classifyAuthError", () => {
  it("a 4xx from the Auth server rejects the token", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(
        classifyAuthError(new AuthApiError("bad jwt", status, "bad_jwt")),
      ).toEqual({ kind: "rejected" });
    }
  });

  it("a 5xx, a network failure, or anything unknown is 'unavailable', never a sign-out", () => {
    expect(
      classifyAuthError(new AuthApiError("boom", 500, "unexpected_failure")),
    ).toEqual({ kind: "unavailable" });
    expect(
      classifyAuthError(new AuthRetryableFetchError("network", 0)),
    ).toEqual({ kind: "unavailable" });
    expect(classifyAuthError(new Error("?"))).toEqual({ kind: "unavailable" });
  });
});

describe("authenticateMobileRequest", () => {
  const account = { userId: USER_ID, timeZone: "UTC", db: {} };

  it("no or malformed Authorization is 401 with no Auth call", async () => {
    const verify = jest.fn();
    for (const header of [undefined, "Bearer nope", `Token ${TOKEN}`]) {
      const result = await authenticateMobileRequest(req(header), { verify });
      expect(result).toMatchObject({
        ok: false,
        failure: { code: "unauthorized", status: 401 },
      });
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it("a token the Auth server rejects (expired, revoked, deleted user) is 401", async () => {
    const verify = jest.fn().mockResolvedValue({ kind: "rejected" });
    const result = await authenticateMobileRequest(req(`Bearer ${TOKEN}`), {
      verify,
    });
    expect(verify).toHaveBeenCalledWith(TOKEN);
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "unauthorized" },
    });
    expect(resolveExistingAccountState).not.toHaveBeenCalled();
  });

  it("an unreachable Auth server is 503, not a sign-out", async () => {
    const verify = jest.fn().mockResolvedValue({ kind: "unavailable" });
    const result = await authenticateMobileRequest(req(`Bearer ${TOKEN}`), {
      verify,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "internal_error", status: 503 },
    });
  });

  it("a verified user with no profile is 401 and nothing is created", async () => {
    const verify = jest
      .fn()
      .mockResolvedValue({ kind: "user", userId: USER_ID, email: "a@x.test" });
    resolveExistingAccountState.mockResolvedValue(null);
    const result = await authenticateMobileRequest(req(`Bearer ${TOKEN}`), {
      verify,
    });
    expect(resolveExistingAccountState).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "unauthorized" },
    });
    expect(touchLastActive).not.toHaveBeenCalled();
  });

  it("a suspended account is 403 account_suspended and nothing is recorded", async () => {
    const verify = jest
      .fn()
      .mockResolvedValue({ kind: "user", userId: USER_ID, email: "a@x.test" });
    resolveExistingAccountState.mockResolvedValue({
      account,
      status: "suspended",
      lastActiveOn: null,
    });
    const result = await authenticateMobileRequest(req(`Bearer ${TOKEN}`), {
      verify,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "account_suspended", status: 403 },
    });
    expect(touchLastActive).not.toHaveBeenCalled();
  });

  it("an active account is returned with the verified email, and last-active is recorded", async () => {
    const verify = jest
      .fn()
      .mockResolvedValue({ kind: "user", userId: USER_ID, email: "a@x.test" });
    resolveExistingAccountState.mockResolvedValue({
      account,
      status: "active",
      lastActiveOn: "2026-11-01",
    });
    const result = await authenticateMobileRequest(req(`Bearer ${TOKEN}`), {
      verify,
    });
    expect(result).toEqual({ ok: true, account, email: "a@x.test" });
    expect(touchLastActive).toHaveBeenCalledWith(account, "2026-11-01");
  });
});
