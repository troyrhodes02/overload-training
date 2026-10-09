/**
 * The result shape every server action returns (api-conventions). Errors are
 * plain English; field-level problems go in `details`. Raw database or Prisma
 * errors never reach the client.
 */
export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "invalid_state_transition"
  | "conflict"
  | "unauthorized"
  | "internal_error";

export type ActionError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
};

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError };

/** A failure the write modules raise deliberately, with a user-safe message. */
export class DomainError extends Error {
  constructor(
    readonly code: Exclude<ErrorCode, "internal_error" | "unauthorized">,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Runs a write and converts the outcome to an ActionResult. A DomainError keeps
 * its code and message; anything else becomes a generic internal_error so no
 * internals leak (the original is logged server-side).
 */
export async function toActionResult<T>(
  run: () => Promise<T>,
  internalMessage = "Something went wrong. Nothing was changed.",
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }
    console.error(error);
    return {
      ok: false,
      error: { code: "internal_error", message: internalMessage },
    };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
