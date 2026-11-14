import "server-only";
import { verifyAccessToken, type TokenVerdict } from "./access-token";
import { ApiFailure } from "@/lib/api/mobile/errors";
import {
  resolveExistingAccountState,
  touchLastActive,
  type Account,
} from "./account";

/**
 * The mobile API's acting account (Pitch 21c spec §7). The bearer-token twin of
 * requireAccount(): it lives in src/lib/data because only this folder may turn
 * an authenticated user id into an Account (static guard), and a second guard
 * pins its one caller to the request pipeline (src/lib/api/mobile/pipeline.ts).
 *
 * Order:
 *   1. Parse `Authorization: Bearer <token>`; anything malformed is 401 with no
 *      network call.
 *   2. Ask Supabase Auth (`getUser(token)`, cookie-less anon client). Refused →
 *      401; unreachable → 503 (the lifter is not signed out for our outage).
 *   3. Resolve the account WITHOUT creating a profile; none → 401 (RD-1).
 *   4. Suspended → 403 account_suspended, nothing recorded (like requireAccount).
 *   5. Record last-active (at most once a day, best effort).
 *
 * The user id comes ONLY from the Auth server's answer — never from the path,
 * query, body, or any other header.
 */

export type MobileAuthResult =
  | { ok: true; account: Account; email: string }
  | { ok: false; failure: ApiFailure };

export type MobileAuthDeps = {
  verify?: (token: string) => Promise<TokenVerdict>;
};

/** JWT-shaped: three base64url segments. Longer than this is not a token. */
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
export const MAX_TOKEN_LENGTH = 8192;

const UNAUTHORIZED = "Sign in to continue.";

function unauthorized(): MobileAuthResult {
  return { ok: false, failure: new ApiFailure("unauthorized", UNAUTHORIZED) };
}

/** The token from an Authorization header, or null when it isn't one. */
export function parseBearerToken(header: string | null): string | null {
  if (!header || header.length > MAX_TOKEN_LENGTH + 7) return null;
  const m = BEARER.exec(header);
  return m ? m[1] : null;
}

export async function authenticateMobileRequest(
  request: Request,
  deps: MobileAuthDeps = {},
): Promise<MobileAuthResult> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();

  const verdict = await (deps.verify ?? verifyAccessToken)(token);
  if (verdict.kind === "unavailable") {
    return {
      ok: false,
      failure: new ApiFailure(
        "internal_error",
        "Couldn't verify your sign-in right now. Try again in a moment.",
        undefined,
        503,
      ),
    };
  }
  if (verdict.kind === "rejected") return unauthorized();

  const state = await resolveExistingAccountState(verdict.userId);
  if (!state) return unauthorized();
  if (state.status === "suspended") {
    return {
      ok: false,
      failure: new ApiFailure(
        "account_suspended",
        "This account is suspended.",
      ),
    };
  }
  await touchLastActive(state.account, state.lastActiveOn);
  return { ok: true, account: state.account, email: verdict.email };
}
