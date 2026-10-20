import { DomainError, isUniqueViolation } from "@/lib/actions/result";
import { USERNAME_TAKEN } from "./validation";

/**
 * A username another account already holds (OVE-50). Its own class, so signup
 * can tell a lost username race from any other conflict, and both signup and
 * Settings report it identically: on the username field, saying only that the
 * name is in use.
 */
export class UsernameTakenError extends DomainError {
  constructor() {
    super("conflict", USERNAME_TAKEN, { username: USERNAME_TAKEN });
    this.name = "UsernameTakenError";
  }
}

/**
 * For a profile write that may set a username: a unique violation can only be
 * the username (callers never change user_id), so it becomes
 * UsernameTakenError. Anything else passes through unchanged.
 */
export function asUsernameConflict(error: unknown): unknown {
  return isUniqueViolation(error) ? new UsernameTakenError() : error;
}
