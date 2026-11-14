import "server-only";
import type {
  ApiErrorBody,
  ApiErrorCode,
} from "@overload/shared/contracts/errors";
import { DomainError } from "@/lib/actions/result";

/**
 * The mobile API's error-to-status map and response helpers (Pitch 21c spec
 * §6). One exhaustive table: the compiler refuses a code without a status, so
 * a code added to the shared taxonomy cannot ship unmapped. There is no second
 * taxonomy — every code is the shared `ApiErrorCode`.
 */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
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
  import_unavailable: 503,
};

/** The one message every unexpected failure carries. Never internals. */
export const INTERNAL_ERROR_MESSAGE =
  "Something went wrong. Nothing was changed.";

/**
 * A failure the API answers deliberately. `status` overrides the table only
 * where the spec says so (503 for an unreachable Auth server, RD-6).
 */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string>,
    readonly status: number = API_ERROR_STATUS[code],
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Every answer is about one account (or the live config): no layer may keep it.
  "Cache-Control": "no-store",
} as const;

/** A JSON response with the API's standard headers. */
export function apiJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...BASE_HEADERS, ...init.headers },
  });
}

/** `{ error: { code, message, details? } }` with the failure's status. */
export function apiErrorResponse(failure: ApiFailure): Response {
  const body: ApiErrorBody = {
    error: {
      code: failure.code,
      message: failure.message,
      ...(failure.details ? { details: failure.details } : {}),
    },
  };
  return apiJson(body, { status: failure.status, headers: failure.headers });
}

/**
 * Anything thrown inside a handler, as an ApiFailure. A DomainError keeps its
 * code, message, and details (they are written to be shown). Anything else is
 * a generic internal_error; the original is logged by error NAME only, so no
 * personal data or database detail reaches a log line or the client.
 */
export function toApiFailure(error: unknown): ApiFailure {
  if (error instanceof ApiFailure) return error;
  if (error instanceof DomainError) {
    return new ApiFailure(error.code, error.message, error.details);
  }
  console.error(
    "mobile api: unexpected failure",
    error instanceof Error ? error.name : "unknown",
  );
  return new ApiFailure("internal_error", INTERNAL_ERROR_MESSAGE);
}
