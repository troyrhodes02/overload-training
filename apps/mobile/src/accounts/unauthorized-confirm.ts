import type { ApiError } from "../api/errors";

/**
 * OVE-255 #2: a `/me` 401 after a successful token refresh means the sign-in
 * exists but no account answers. That is either a half-closed deletion (the
 * data is gone and the sign-in wasn't removed) or a web deletion that is
 * between its data transaction and its identity removal, which takes up to
 * about 750 ms with retries (`deleteAccount`). The app looks once more after
 * this delay, so the second case never shows "finish on the web".
 */
export const CONFIRM_UNAUTHORIZED_MS = 2000;

/**
 * How many looks a refusal gets before the phone signs out quietly. A look
 * that answers nothing new (a refetch that throws, or a cancelled refetch
 * that hands back the cached refusal) leaves the code at `unauthorized`, so
 * without another look the launch screen would wait forever (21l release
 * review).
 */
export const CONFIRM_UNAUTHORIZED_LOOKS = 3;

export type SecondLook = "unauthorized" | "signed_out" | "ok" | "other";

export type UnauthorizedDecision = {
  /** Forget this phone's session. */
  readonly forget: boolean;
  /** Show the signed-out "finish on the web" notice. */
  readonly notice: boolean;
  /** Look again after another CONFIRM_UNAUTHORIZED_MS. */
  readonly again: boolean;
};

/**
 * What the refetch of `/me` answered, read for the decision. `since` is when
 * the first refusal was recorded: an error no newer than that is the cached
 * answer (a cancelled refetch returns it), not a second look, so it decides
 * nothing (21l review #3).
 */
export function secondLookOf(
  result: { status: string; error: ApiError | null; errorUpdatedAt?: number },
  since?: number,
): SecondLook {
  if (result.status === "success") return "ok";
  if (
    since !== undefined &&
    (result.errorUpdatedAt === undefined || result.errorUpdatedAt <= since)
  ) {
    return "other";
  }
  const code = result.error?.code;
  if (code === "unauthorized") return "unauthorized";
  if (code === "signed_out") return "signed_out";
  return "other";
}

/**
 * `looks` counts the looks so far, this one included.
 * - still refused: the account really is half closed, so say where to finish;
 * - signed out: the web finished, the identity is gone, so sign out quietly
 *   like any ended session;
 * - answered: nothing happened to the account;
 * - anything else: look again, and after CONFIRM_UNAUTHORIZED_LOOKS sign out
 *   quietly. The last answer the server gave was a refusal, and the sign-in
 *   screen is a state the lifter can always leave.
 */
export function afterSecondLook(
  look: SecondLook,
  looks = 1,
): UnauthorizedDecision {
  switch (look) {
    case "unauthorized":
      return { forget: true, notice: true, again: false };
    case "signed_out":
      return { forget: true, notice: false, again: false };
    case "ok":
      return { forget: false, notice: false, again: false };
    default:
      return looks < CONFIRM_UNAUTHORIZED_LOOKS
        ? { forget: false, notice: false, again: true }
        : { forget: true, notice: false, again: false };
  }
}
