/**
 * The lifter's time zone (shared by the server reader and the client island).
 *
 * Overload has one lifter and no settings table, so the zone comes from the
 * lifter's own browser: a client island stores the IANA zone the browser
 * reports in this cookie, and server code reads it to decide which calendar
 * day is "today" (src/lib/time/lifter-time-zone.ts). No migration, no stored
 * preference, no location data — just the zone name. UTC until the cookie is
 * set (first page view), and in contexts with no request (tests, scripts).
 *
 * Pure module: safe for client islands.
 */
export const TIME_ZONE_COOKIE = "overload-tz";
export const DEFAULT_TIME_ZONE = "UTC";
/** A year: travel updates it on the next page view anyway. */
export const TIME_ZONE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
