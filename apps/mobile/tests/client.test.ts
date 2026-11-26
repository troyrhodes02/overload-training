/** Pitch 21d spec §6: headers, one refresh-and-retry, temporary vs definitive. */
import { STAGING_API_ORIGIN } from "@overload/shared/mobile/environment";
import { createApiClient, type ClientDeps } from "../src/api/client";
import { ApiError } from "../src/api/errors";

jest.mock("../src/config/env", () => ({
  ENV: {
    ok: true,
    config: {
      environment: "staging",
      apiOrigin:
        "https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app",
      localApi: false,
    },
  },
  APP_VERSION: "0.1.0",
}));

type Call = { url: string; init: RequestInit };
function json(
  status: number,
  body: unknown,
  url = `${STAGING_API_ORIGIN}/api/mobile/v1/me`,
) {
  return {
    status,
    url,
    headers: {
      get: (h: string) => (h === "content-type" ? "application/json" : null),
    },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function setup(responses: Response[], over: Partial<ClientDeps> = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const deps: ClientDeps = {
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (!next) throw new TypeError("Network request failed");
      return next;
    }) as unknown as typeof fetch,
    apiOrigin: STAGING_API_ORIGIN,
    appVersion: "0.1.0",
    tokens: {
      accessToken: jest.fn(async () => "tok-1"),
      refresh: jest.fn(async () => "tok-2"),
    },
    stagingKey: async () => "bypass-secret-value-123",
    onUpgradeRequired: jest.fn(),
    ...over,
  };
  return { client: createApiClient(deps), calls, deps };
}
const headers = (c: Call) => c.init.headers as Record<string, string>;

describe("API client", () => {
  it("sends the version, the bearer token, and the bypass key only to the staging origin", async () => {
    const { client, calls } = setup([json(200, { ok: 1 })]);
    await client.request("/me");
    expect(calls[0].url).toBe(`${STAGING_API_ORIGIN}/api/mobile/v1/me`);
    expect(headers(calls[0])).toMatchObject({
      "X-Overload-App-Version": "0.1.0",
      Authorization: "Bearer tok-1",
      "x-vercel-protection-bypass": "bypass-secret-value-123",
    });
  });

  it("app-config goes without a token but with the version", async () => {
    const { client, calls, deps } = setup([json(200, {})]);
    await client.request("/app-config", { auth: false });
    expect(headers(calls[0]).Authorization).toBeUndefined();
    expect(headers(calls[0])["X-Overload-App-Version"]).toBe("0.1.0");
    expect(deps.tokens.accessToken).not.toHaveBeenCalled();
  });

  it("a local API origin never gets the bypass key", async () => {
    const { client, calls } = setup(
      [json(200, {}, "http://localhost:3200/api/mobile/v1/me")],
      {
        apiOrigin: "http://localhost:3200",
      },
    );
    await client.request("/me");
    expect(headers(calls[0])["x-vercel-protection-bypass"]).toBeUndefined();
  });

  it("refreshes once after the API's 401, then retries with the new token", async () => {
    const { client, calls, deps } = setup([
      json(401, { error: { code: "unauthorized", message: "no" } }),
      json(200, { me: true }),
    ]);
    expect(await client.request("/me")).toEqual({ me: true });
    expect(deps.tokens.refresh).toHaveBeenCalledTimes(1);
    expect(headers(calls[1]).Authorization).toBe("Bearer tok-2");
  });

  it("never retries twice: a second 401 surfaces as unauthorized", async () => {
    const { client, deps } = setup([
      json(401, { error: { code: "unauthorized", message: "no" } }),
      json(401, { error: { code: "unauthorized", message: "no" } }),
    ]);
    await expect(client.request("/me")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(deps.tokens.refresh).toHaveBeenCalledTimes(1);
  });

  it("a definitive refresh refusal is signed_out; a temporary one keeps the session", async () => {
    const definitive = setup(
      [json(401, { error: { code: "unauthorized", message: "no" } })],
      {
        tokens: { accessToken: async () => "t", refresh: async () => null },
      },
    );
    await expect(definitive.client.request("/me")).rejects.toMatchObject({
      code: "signed_out",
    });

    const temporary = setup(
      [json(401, { error: { code: "unauthorized", message: "no" } })],
      {
        tokens: {
          accessToken: async () => "t",
          refresh: async () => {
            throw new ApiError("unavailable", "down");
          },
        },
      },
    );
    await expect(temporary.client.request("/me")).rejects.toMatchObject({
      code: "unavailable",
      temporary: true,
    });
  });

  it("no network is a temporary 'network' error", async () => {
    const { client } = setup([]);
    await expect(client.request("/me")).rejects.toMatchObject({
      code: "network",
      temporary: true,
    });
  });

  it("426 flags the update gate", async () => {
    const { client, deps } = setup([
      json(426, { error: { code: "upgrade_required", message: "Update." } }),
    ]);
    await expect(client.request("/me")).rejects.toMatchObject({
      code: "upgrade_required",
    });
    expect(deps.onUpgradeRequired).toHaveBeenCalledTimes(1);
  });

  it("no session means signed_out without a network call", async () => {
    const { client, calls } = setup([json(200, {})], {
      tokens: { accessToken: async () => null, refresh: async () => null },
    });
    await expect(client.request("/me")).rejects.toMatchObject({
      code: "signed_out",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("Production: a protection answer is unavailable, never staging access (21l RD-27)", () => {
  it("a non-JSON 401 is unavailable when the build has no staging access", async () => {
    const html = {
      status: 401,
      url: `${STAGING_API_ORIGIN}/api/mobile/v1/me`,
      headers: { get: () => "text/html" },
      text: async () => "<html></html>",
    } as unknown as Response;
    const { client } = setup([html], {
      stagingAccess: false,
      stagingKey: async () => null,
    });
    await expect(client.request("/me")).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("staging keeps reporting staging_protected", async () => {
    const html = {
      status: 401,
      url: `${STAGING_API_ORIGIN}/api/mobile/v1/me`,
      headers: { get: () => "text/html" },
      text: async () => "<html></html>",
    } as unknown as Response;
    const { client } = setup([html]);
    await expect(client.request("/me")).rejects.toMatchObject({
      code: "staging_protected",
    });
  });
});
