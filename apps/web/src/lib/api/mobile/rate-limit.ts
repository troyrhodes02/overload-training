import "server-only";
import type { Account } from "@/lib/data/account";
import {
  throttleRequest,
  MOBILE_API_RATE_LIMIT,
  MOBILE_API_RATE_WINDOW_SECONDS,
} from "@/lib/accounts/throttle";
import { ApiFailure } from "./errors";

/**
 * The mobile API's basic rate limit (Pitch 21c spec §11; RD-8): per ACCOUNT,
 * never per IP — carrier networks put many lifters behind one address. A
 * fixed 60-second window of 120 requests is far above a real workout (a few
 * requests a minute) and stops a runaway retry loop. Counted in the existing
 * un-owned throttle table under its own action; the key is the account id,
 * hashed there before it reaches the database. Fails closed like the
 * existing limiter (a counter that can't be written refuses the request).
 */
export async function checkMobileRateLimit(
  account: Account,
  now: () => number = Date.now,
): Promise<ApiFailure | null> {
  const { allowed, retryAfterSeconds } = await throttleRequest(
    "mobile_api_request",
    account.userId,
    now,
  );
  if (allowed) return null;
  return new ApiFailure(
    "rate_limited",
    "Too many requests. Try again in a moment.",
    undefined,
    undefined,
    { "Retry-After": String(retryAfterSeconds) },
  );
}

export { MOBILE_API_RATE_LIMIT, MOBILE_API_RATE_WINDOW_SECONDS };
