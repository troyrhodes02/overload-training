/**
 * The neutral signup refusal messages (signup hardening, items 2b–2d). A tiny
 * module of its own so the client form can import them without shipping the
 * blocklists or the reserved-name list to the browser.
 */

/** Neutral field message for a refused email domain (2b). */
export const EMAIL_NOT_ACCEPTED = "Please use a different email address.";

/** Neutral field message for a reserved username (2c). */
export const USERNAME_NOT_AVAILABLE = "That username isn't available.";

/** Neutral message when the hourly signup cap is reached (2d). */
export const SIGNUPS_PAUSED =
  "Signups are temporarily paused. Please try again soon.";
