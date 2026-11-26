import { useEffect, useRef } from "react";
import type { ApiError, ClientErrorCode } from "../api/errors";
import { FINISH_ON_WEB_NOTICE, setSignedOutNotice } from "./signed-out-notice";
import {
  afterSecondLook,
  CONFIRM_UNAUTHORIZED_MS,
  type SecondLook,
  secondLookOf,
} from "./unauthorized-confirm";

/**
 * The root layout's reaction to `/me` refusing the account (OVE-255 #2).
 * `signed_out` forgets the session at once. `unauthorized` (a 401 after a
 * successful refresh) is confirmed by a refetch after
 * CONFIRM_UNAUTHORIZED_MS; only a refusal that persists shows the
 * "finish on the web" notice. A look that answers nothing new is repeated,
 * up to CONFIRM_UNAUTHORIZED_LOOKS, so the launch screen always ends.
 */
export function useConfirmUnauthorized(options: {
  code: ClientErrorCode | undefined;
  /** When the current error was recorded (TanStack's errorUpdatedAt). */
  errorUpdatedAt?: number;
  refetch: () => Promise<{
    status: string;
    error: ApiError | null;
    errorUpdatedAt?: number;
  }>;
  forget: () => Promise<void> | void;
  delayMs?: number;
}): void {
  const { code } = options;
  const delayMs = options.delayMs ?? CONFIRM_UNAUTHORIZED_MS;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    if (code === "signed_out") {
      void latest.current.forget();
      return;
    }
    if (code !== "unauthorized") return;
    let alive = true;
    let looks = 0;
    const since = latest.current.errorUpdatedAt;
    let t: ReturnType<typeof setTimeout> | undefined;
    const decide = (look: SecondLook) => {
      if (!alive) return;
      const decision = afterSecondLook(look, looks);
      if (decision.notice) setSignedOutNotice(FINISH_ON_WEB_NOTICE);
      if (decision.forget) void latest.current.forget();
      if (decision.again) t = setTimeout(lookAgain, delayMs);
    };
    const lookAgain = () => {
      looks += 1;
      latest.current.refetch().then(
        (result) => decide(secondLookOf(result, since)),
        // A refetch that throws answers nothing new.
        () => decide("other"),
      );
    };
    t = setTimeout(lookAgain, delayMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code, delayMs]);
}
