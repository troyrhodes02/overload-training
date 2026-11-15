import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from "@overload/shared/contracts/errors";

/**
 * Every failure the API client can report (spec §6). The server's codes come
 * from the shared contract. The client adds four of its own, which never come
 * from the server:
 *   network            no answer (offline, DNS, timeout)
 *   unavailable        an answer that isn't the API (5xx without the envelope,
 *                      or non-JSON)
 *   staging_protected  Vercel Deployment Protection answered instead of the API
 *   signed_out         an authenticated call with no session to send
 * Only `signed_out` (and a definitive refresh refusal inside supabase-js) ever
 * ends a session; every other failure is temporary (RD-5).
 */
export type ClientErrorCode =
  ApiErrorCode | "network" | "unavailable" | "staging_protected" | "signed_out";

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly details: Record<string, string> = {},
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Temporary: retry later, and keep the session. */
  get temporary(): boolean {
    return (
      this.code === "network" ||
      this.code === "unavailable" ||
      this.code === "staging_protected" ||
      (this.status !== null && this.status >= 500)
    );
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}

export const MESSAGES = {
  network:
    "Overload needs a connection. Check your signal or Wi-Fi and try again.",
  unavailable: "Overload isn't responding right now. Try again in a moment.",
  staging_protected: "This build needs staging access.",
  signed_out: "You're signed out.",
} as const;
