/**
 * Pitch 21c (spec §5, §6.3): the request pipeline's order and answers, the
 * public app-config route, and the JSON 404 for unknown API paths. The account
 * layer and the token check are mocked; no database, no network.
 */
// `connection()` needs a Next request scope; route handlers are called directly
// here, as in auth.test.ts.
jest.mock("next/server", () => ({ connection: jest.fn(async () => {}) }));
const resolveExistingAccountState = jest.fn();
const touchLastActive = jest.fn();
jest.mock("@/lib/data/account", () => ({
  resolveExistingAccountState: (...a: unknown[]) =>
    resolveExistingAccountState(...a),
  touchLastActive: (...a: unknown[]) => touchLastActive(...a),
}));
const verifyAccessToken = jest.fn();
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a),
}));

import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { apiJson } from "@/lib/api/mobile/errors";
import { DomainError } from "@/lib/actions/result";
import { GET as appConfig } from "@/app/api/mobile/v1/app-config/route";
import * as catchAll from "@/app/api/mobile/[...path]/route";

const TOKEN = "aaaa.bbbb.cccc";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const account = { userId: USER_ID, timeZone: "UTC", db: {} };
const ctx = { params: Promise.resolve({}) };

function req(
  opts: { version?: string | null; token?: string | null; path?: string } = {},
) {
  const headers = new Headers();
  const version = opts.version === undefined ? "1.0.0" : opts.version;
  if (version !== null) headers.set("x-overload-app-version", version);
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  return new Request(`http://localhost${opts.path ?? "/api/mobile/v1/x"}`, {
    headers,
  });
}

const ORIGINAL_MIN = process.env.MOBILE_MIN_APP_VERSION;

beforeEach(() => {
  process.env.MOBILE_MIN_APP_VERSION = "1.0.0";
  resolveExistingAccountState.mockReset().mockResolvedValue({
    account,
    status: "active",
    lastActiveOn: null,
  });
  touchLastActive.mockReset();
  verifyAccessToken
    .mockReset()
    .mockResolvedValue({ kind: "user", userId: USER_ID, email: "a@x.test" });
});

afterAll(() => {
  if (ORIGINAL_MIN === undefined) delete process.env.MOBILE_MIN_APP_VERSION;
  else process.env.MOBILE_MIN_APP_VERSION = ORIGINAL_MIN;
});

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("content-type")).toContain("application/json");
  const body = await res.json();
  expect(body).toEqual({ error: expect.objectContaining({ code }) });
  expect(typeof body.error.message).toBe("string");
}

describe("mobileRoute", () => {
  const handler = jest.fn(async (c: { email: string }) =>
    apiJson({ email: c.email }),
  );
  const GET = mobileRoute(handler);
  beforeEach(() => handler.mockClear());

  it("runs the handler with the verified account and email", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ email: "a@x.test" });
    expect(handler.mock.calls[0][0]).toMatchObject({
      account,
      email: "a@x.test",
      appVersion: [1, 0, 0],
    });
  });

  it("checks the version BEFORE the token: an old app gets 426 even with a bad token", async () => {
    await expectError(
      await GET(req({ version: "0.9.0", token: null }), ctx),
      426,
      "upgrade_required",
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("a missing version header is 400", async () => {
    await expectError(
      await GET(req({ version: null }), ctx),
      400,
      "validation_error",
    );
  });

  it("no token is a JSON 401, never a redirect", async () => {
    const res = await GET(req({ token: null }), ctx);
    expect(res.headers.get("location")).toBeNull();
    await expectError(res, 401, "unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });

  it("a rejected token is 401; an unreachable Auth server is 503", async () => {
    verifyAccessToken.mockResolvedValueOnce({ kind: "rejected" });
    await expectError(await GET(req(), ctx), 401, "unauthorized");
    verifyAccessToken.mockResolvedValueOnce({ kind: "unavailable" });
    await expectError(await GET(req(), ctx), 503, "internal_error");
  });

  it("a suspended account is 403", async () => {
    resolveExistingAccountState.mockResolvedValueOnce({
      account,
      status: "suspended",
      lastActiveOn: null,
    });
    await expectError(await GET(req(), ctx), 403, "account_suspended");
    expect(handler).not.toHaveBeenCalled();
  });

  it("a DomainError from the handler keeps its code; anything else is a safe 500", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const notFound = mobileRoute(async () => {
      throw new DomainError("not_found", "That gym doesn't exist.");
    });
    await expectError(await notFound(req(), ctx), 404, "not_found");
    const boom = mobileRoute(async () => {
      throw new Error("db password=hunter2");
    });
    const res = await boom(req(), ctx);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
    spy.mockRestore();
  });
});

describe("GET /api/mobile/v1/app-config", () => {
  it("is public and never version-gated", async () => {
    const res = await appConfig(req({ version: "0.0.1", token: null }), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      minimumAppVersion: "1.0.0",
      killSwitches: { maintenance: expect.any(Boolean) },
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });
});

describe("unknown /api/mobile paths", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"] as const)(
    "%s answers a JSON 404",
    async (method) => {
      const res = await catchAll[method](
        req({ path: "/api/mobile/v1/nope", version: null, token: null }),
        { params: Promise.resolve({ path: ["v1", "nope"] }) },
      );
      await expectError(res, 404, "not_found");
    },
  );
});
