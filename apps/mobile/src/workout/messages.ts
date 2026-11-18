import { ApiError } from "../api/errors";

/**
 * What to say when a logging change didn't reach a server answer, or the
 * server refused it (Pitch 21f design §8). `what` completes "Couldn't …": a
 * refusal shows the server's own words, so the web and the phone say the same
 * thing; a request that got no answer says what the phone knows.
 */
export function changeFailureMessage(error: unknown, what: string): string {
  if (error instanceof ApiError) {
    if (error.code === "network") {
      return `Couldn't ${what} — Overload needs a connection.`;
    }
    if (error.temporary) {
      return `Couldn't ${what} — Overload isn't responding.`;
    }
    return error.message;
  }
  return `Couldn't ${what}.`;
}

/** True when the workout itself changed under the screen and must be re-read. */
export function needsRefresh(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "invalid_state_transition" ||
      error.code === "not_found" ||
      error.code === "conflict")
  );
}
