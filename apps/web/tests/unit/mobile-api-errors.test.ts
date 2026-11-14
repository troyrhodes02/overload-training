/**
 * Pitch 21c (spec §6.1–§6.2): one status per shared error code, the error
 * envelope, and no internals in an unexpected failure.
 */
import { API_ERROR_CODES } from "@overload/shared/contracts/errors";
import {
  API_ERROR_STATUS,
  ApiFailure,
  apiErrorResponse,
  apiJson,
  INTERNAL_ERROR_MESSAGE,
  toApiFailure,
} from "@/lib/api/mobile/errors";
import { DomainError } from "@/lib/actions/result";

describe("API_ERROR_STATUS", () => {
  it("maps every shared API error code, and nothing else", () => {
    expect(Object.keys(API_ERROR_STATUS).sort()).toEqual(
      [...API_ERROR_CODES].sort(),
    );
  });

  it("uses the statuses the spec fixes", () => {
    expect(API_ERROR_STATUS).toMatchObject({
      validation_error: 400,
      invalid_state_transition: 400,
      unauthorized: 401,
      plan_required: 402,
      account_suspended: 403,
      not_found: 404,
      conflict: 409,
      upgrade_required: 426,
      rate_limited: 429,
      internal_error: 500,
    });
  });
});

describe("toApiFailure", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps a DomainError's code, message, and details", () => {
    const f = toApiFailure(
      new DomainError("validation_error", "Check the fields.", { name: "x" }),
    );
    expect(f).toMatchObject({
      code: "validation_error",
      message: "Check the fields.",
      details: { name: "x" },
      status: 400,
    });
  });

  it("turns anything else into a generic internal_error and logs only its name", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const f = toApiFailure(
      new Error('relation "profiles" violates lifter@example.com'),
    );
    expect(f).toMatchObject({
      code: "internal_error",
      message: INTERNAL_ERROR_MESSAGE,
      status: 500,
    });
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("lifter@example.com");
    expect(logged).not.toContain("profiles");
  });

  it("passes an ApiFailure through", () => {
    const f = new ApiFailure("rate_limited", "Slow down.");
    expect(toApiFailure(f)).toBe(f);
  });
});

describe("responses", () => {
  it("an error is the envelope with its status and no-store", async () => {
    const res = apiErrorResponse(
      new ApiFailure("conflict", "Already used.", { key: "k" }, 409, {
        "Retry-After": "3",
      }),
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("retry-after")).toBe("3");
    expect(await res.json()).toEqual({
      error: {
        code: "conflict",
        message: "Already used.",
        details: { key: "k" },
      },
    });
  });

  it("an error without details has no details key", async () => {
    const res = apiErrorResponse(new ApiFailure("not_found", "Missing."));
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "Missing." },
    });
  });

  it("a success is JSON with no-store", async () => {
    const res = apiJson({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ a: 1 });
  });
});
