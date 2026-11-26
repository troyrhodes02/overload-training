import { useEffect, useRef } from "react";
import type { ApiError, ClientErrorCode } from "../api/errors";
import { FINISH_ON_WEB_NOTICE, setSignedOutNotice } from "./signed-out-notice";
import {
  afterSecondLook,
  CONFIRM_UNAUTHORIZED_MS,
  secondLookOf,
} from "./unauthorized-confirm";

/**
 * The root layout's reaction to `/me` refusing the account (OVE-255 #2).
 * `signed_out` forgets the session at once. `unauthorized` (a 401 after a
 * successful refresh) is confirmed by one refetch after
 * CONFIRM_UNAUTHORIZED_MS; only a refusal that persists shows the
 * "finish on the web" notice.
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
    const since = latest.current.errorUpdatedAt;
    const t = setTimeout(() => {
      latest.current
        .refetch()
        .then((result) => {
          if (!alive) return;
          const decision = afterSecondLook(secondLookOf(result, since));
          if (decision.notice) setSignedOutNotice(FINISH_ON_WEB_NOTICE);
          if (decision.forget) void latest.current.forget();
        })
        // A refetch that throws decides nothing; the next answer will.
        .catch(() => {});
    }, delayMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code, delayMs]);
}
