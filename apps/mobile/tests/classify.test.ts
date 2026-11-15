/** Pitch 21d spec §6 step 4: one HTTP answer → data or an ApiError. */
import { classifyResponse, type RawResponse } from "../src/api/classify";

const ORIGIN = "https://staging.example";
const raw = (over: Partial<RawResponse>): RawResponse => ({
  status: 200,
  url: `${ORIGIN}/api/mobile/v1/me`,
  contentType: "application/json; charset=utf-8",
  retryAfter: null,
  bodyText: "{}",
  ...over,
});

describe("classifyResponse", () => {
  it("returns JSON data on 2xx", () => {
    expect(classifyResponse(raw({ bodyText: '{"a":1}' }), ORIGIN)).toEqual({
      ok: true,
      data: { a: 1 },
    });
  });

  it("a redirect to Vercel's login is staging protection, not an auth failure", () => {
    const r = classifyResponse(
      raw({
        url: "https://vercel.com/sso-api?url=x",
        status: 200,
        contentType: "text/html",
      }),
      ORIGIN,
    );
    expect(r.ok === false && r.error.code).toBe("staging_protected");
  });

  it("a non-JSON 401/403 from the API host is staging protection", () => {
    for (const status of [401, 403]) {
      const r = classifyResponse(
        raw({ status, contentType: "text/html", bodyText: "<html>" }),
        ORIGIN,
      );
      expect(r.ok === false && r.error.code).toBe("staging_protected");
    }
  });

  it("Vercel's JSON 401 for a protected deployment is staging protection (live shape)", () => {
    const body = {
      access: "vercel curl <deployment-url>",
      protection: {
        auto_vercel_auth_redirect: true,
        vercel_auth_enabled: true,
      },
      error: { code: "401", message: "Protected deployment" },
    };
    const r = classifyResponse(
      raw({ status: 401, bodyText: JSON.stringify(body) }),
      ORIGIN,
    );
    expect(r.ok === false && [r.error.code, r.error.temporary]).toEqual([
      "staging_protected",
      true,
    ]);
  });

  it("other non-JSON answers and 5xx without the envelope are temporary", () => {
    for (const r of [
      classifyResponse(
        raw({ status: 502, contentType: "text/html", bodyText: "bad gateway" }),
        ORIGIN,
      ),
      classifyResponse(raw({ status: 500, bodyText: "{}" }), ORIGIN),
      classifyResponse(raw({ status: 200, bodyText: "not json" }), ORIGIN),
    ]) {
      expect(r.ok === false && r.error.code).toBe("unavailable");
      expect(r.ok === false && r.error.temporary).toBe(true);
    }
  });

  it("maps the error envelope, keeps string details, and reads Retry-After", () => {
    const r = classifyResponse(
      raw({
        status: 429,
        retryAfter: "30",
        bodyText: JSON.stringify({
          error: {
            code: "rate_limited",
            message: "Slow down.",
            details: { a: "b", n: 1 },
          },
        }),
      }),
      ORIGIN,
    );
    expect(
      r.ok === false && [
        r.error.code,
        r.error.message,
        r.error.details,
        r.error.retryAfterSeconds,
      ],
    ).toEqual(["rate_limited", "Slow down.", { a: "b" }, 30]);
  });

  it("an unknown server code becomes internal_error; the API's own 401 stays unauthorized", () => {
    const unknown = classifyResponse(
      raw({
        status: 400,
        bodyText: '{"error":{"code":"weird","message":"m"}}',
      }),
      ORIGIN,
    );
    expect(unknown.ok === false && unknown.error.code).toBe("internal_error");
    const unauthorized = classifyResponse(
      raw({
        status: 401,
        bodyText: '{"error":{"code":"unauthorized","message":"m"}}',
      }),
      ORIGIN,
    );
    expect(
      unauthorized.ok === false && [
        unauthorized.error.code,
        unauthorized.error.temporary,
      ],
    ).toEqual(["unauthorized", false]);
  });
});
