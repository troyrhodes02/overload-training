/**
 * Pitch 21c (spec §11; release review #2): the mobile rate limit tells a
 * tripped limit (429 with Retry-After) from a counter it couldn't write
 * (503: our outage, still refused). The throttle is mocked; the integration
 * suite covers it against a real database.
 */
const throttleRequest = jest.fn();
jest.mock("@/lib/accounts/throttle", () => ({
  throttleRequest: (...a: unknown[]) => throttleRequest(...a),
  MOBILE_API_RATE_LIMIT: 120,
  MOBILE_API_RATE_WINDOW_SECONDS: 60,
}));

import { checkMobileRateLimit } from "@/lib/api/mobile/rate-limit";
import type { Account } from "@/lib/data/account";

const account = { userId: "00000000-0000-4000-8000-000000000001" } as Account;

afterEach(() => jest.restoreAllMocks());

it("allows within the limit", async () => {
  throttleRequest.mockResolvedValueOnce({
    allowed: true,
    retryAfterSeconds: 30,
  });
  expect(await checkMobileRateLimit(account)).toBeNull();
  expect(throttleRequest).toHaveBeenCalledWith(
    "mobile_api_request",
    account.userId,
    expect.any(Function),
  );
});

it("a tripped limit is 429 rate_limited with Retry-After", async () => {
  throttleRequest.mockResolvedValueOnce({
    allowed: false,
    retryAfterSeconds: 12,
  });
  expect(await checkMobileRateLimit(account)).toMatchObject({
    code: "rate_limited",
    status: 429,
    headers: { "Retry-After": "12" },
  });
});

it("a counter it couldn't write is a 503, never a 429", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  throttleRequest.mockResolvedValueOnce({
    allowed: false,
    retryAfterSeconds: 12,
    failed: true,
  });
  const failure = await checkMobileRateLimit(account);
  expect(failure).toMatchObject({ code: "internal_error", status: 503 });
  expect(failure!.headers).toEqual({});
});
