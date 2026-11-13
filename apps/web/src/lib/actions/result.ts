/**
 * The result shape every server action returns (api-conventions). Errors are
 * plain English; field-level problems go in `details`. Raw database or Prisma
 * errors never reach the client.
 */
import type {
  ActionResult,
  ErrorCode,
} from "@overload/shared/contracts/errors";

// The error codes and the result shape are the shared API contract (Pitch
// 21b); re-exported so every server action keeps importing them from here.
export type {
  ActionError,
  ActionResult,
  ErrorCode,
} from "@overload/shared/contracts/errors";
export { isUuid } from "@overload/shared/ids";

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

/**
 * A unique-constraint violation (Prisma P2002). Checked structurally so this
 * shared module never pulls the Prisma runtime into anything that imports it.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; code?: unknown };
  return e.name === "PrismaClientKnownRequestError" && e.code === "P2002";
}
