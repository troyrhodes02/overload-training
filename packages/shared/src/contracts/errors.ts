/**
 * The error shape every server action returns today and the mobile API will
 * return (api-conventions; moved from apps/web/src/lib/actions/result.ts in
 * Pitch 21b). Errors are plain English; field-level problems go in `details`.
 * Raw database or Prisma errors never reach a client.
 *
 * Types and the code list only. Raising and converting errors (`DomainError`,
 * `toActionResult`) stays on the server, in apps/web.
 */

/** Every code a server action can return, in the order they were added. */
export const ERROR_CODES = [
  "validation_error",
  "not_found",
  "invalid_state_transition",
  "conflict",
  // Plans, Billing & Promo Codes: the capability that gates this operation is
  // not part of the account's plan (api-conventions: 402). A Free account that
  // reaches a Pro-only server action gets this; Pro read surfaces withhold in
  // the query layer instead.
  "plan_required",
  // Workout Plan Import & Review (Pitch 22, spec §11): the feature kill switch is
  // off, the monthly budget is exhausted, or the provider is unconfigured — the
  // import can't run right now. Distinct from plan_required (a capability gate).
  "import_unavailable",
  // Workout Plan Import & Review: the per-account daily import quota is spent.
  "rate_limited",
  "unauthorized",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
};

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError };

/**
 * The mobile API's error codes (CLAUDE.md, mobile app rules): every action
 * code, plus the two the API itself adds. `account_suspended` answers a
 * suspended account (403); `upgrade_required` answers an app version below
 * the minimum (426). Server actions never return these two.
 */
export const API_ERROR_CODES = [
  ...ERROR_CODES,
  "account_suspended",
  "upgrade_required",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, string>;
};

/** The body of every failed mobile API response: `{ error: { code, message, details? } }`. */
export type ApiErrorBody = { error: ApiError };
