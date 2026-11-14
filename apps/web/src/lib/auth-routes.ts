/**
 * Which paths need no auth session, and where a signed-in visitor is sent
 * instead (Accounts spec §9; Public Accounts spec R9). Pure, so the proxy's
 * routing is unit-testable.
 *
 * Two kinds of public path:
 *
 *  - The sign-in doors (`/login`, `/signup`). A signed-in lifter has no reason
 *    to see either, so both send them to Today.
 *  - Recovery, support, and the auth callback (`/forgot-password`,
 *    `/reset-password`, `/support`, `/auth/confirm`, `/verify-email`). These
 *    are reachable without a session, but a signed-in visitor is NOT bounced
 *    off them: a recovery or verification link can legitimately be followed
 *    while a session exists (e.g. verifying your own email from Settings), and
 *    `/support` and `/verify-email` must render for signed-in and signed-out
 *    alike.
 *  - The public marketing pages and Next's metadata routes (Public Landing
 *    Page & Changelog), which are the same for everyone.
 */
export const SIGNED_OUT_DOORS = ["/login", "/signup"] as const;

/**
 * The public marketing pages (Public Landing Page & Changelog, spec §7). They
 * read no account data, so they render for signed-in and signed-out visitors
 * alike; a signed-in visitor sees "Open Overload" instead of a signup action.
 * `/welcome` is the landing page that signed-out `/` is rewritten to.
 */
export const MARKETING_PATHS = ["/welcome", "/pricing", "/changelog"] as const;

/** Next's metadata file routes: crawlers and browsers fetch them signed out. */
const METADATA_ROUTES = [
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
] as const;

const SIGNED_IN_SAFE_PUBLIC = [
  "/forgot-password",
  "/reset-password",
  "/support",
  "/auth/confirm",
  "/verify-email",
  ...MARKETING_PATHS,
  ...METADATA_ROUTES,
] as const;

/**
 * Server-to-server endpoints that carry NO session and must not be bounced to
 * /login. The Stripe webhook (Plans, Billing & Promo Codes) is authenticated by
 * its Stripe SIGNATURE inside the route handler, not by a Supabase session; the
 * proxy must let the unauthenticated POST through so that verification can run.
 * This does not weaken auth: the handler rejects any unsigned/invalid payload
 * with 400 and resolves the account from the verified event's customer id.
 */
const UNAUTHENTICATED_WEBHOOKS = ["/api/stripe/webhook"] as const;

/**
 * The mobile API (Pitch 21c spec §15). Its requests carry a bearer token, never
 * a session cookie, so the proxy must not redirect them to /login: they reach
 * the route handlers, whose request pipeline verifies the token with Supabase
 * Auth on EVERY request and answers a JSON 401 without one. This exempts the
 * path from the cookie redirect only, never from authentication.
 */
export const MOBILE_API_PREFIX = "/api/mobile";

export const PUBLIC_PATHS = [
  ...SIGNED_OUT_DOORS,
  ...SIGNED_IN_SAFE_PUBLIC,
  ...UNAUTHENTICATED_WEBHOOKS,
  MOBILE_API_PREFIX,
] as const;

function matches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** `/api/mobile` and everything under it — not `/api/mobilex`. */
export function isMobileApiPath(pathname: string): boolean {
  return matches(pathname, MOBILE_API_PREFIX);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => matches(pathname, p));
}

/**
 * The sign-in doors a signed-in visitor is redirected away from. Every other
 * public path stays reachable with a session.
 */
function isSignedOutDoor(pathname: string): boolean {
  return SIGNED_OUT_DOORS.some((p) => matches(pathname, p));
}

/**
 * The owner-only admin area (Admin Center & Feedback, spec R23). For a
 * signed-in account that is not on the allowlist the proxy answers these
 * paths exactly like a URL that does not exist, before anything renders.
 */
export function isAdminPath(pathname: string): boolean {
  return matches(pathname, "/admin");
}

/**
 * The landing page's route. Signed-out `/` renders it at the same URL (a
 * rewrite, not a redirect), so the public root is the landing page while a
 * signed-in lifter's `/` stays Today (spec §7, RD-4).
 */
export const LANDING_PATH = "/welcome";

/** Where the proxy should rewrite this request, or null for none. */
export function routeRewrite(
  pathname: string,
  signedIn: boolean,
): string | null {
  return !signedIn && pathname === "/" ? LANDING_PATH : null;
}

/** Where the proxy should redirect this request, or null to let it through. */
export function routeRedirect(
  pathname: string,
  signedIn: boolean,
): string | null {
  if (!signedIn) {
    // Signed-out "/" is rewritten to the landing page, never bounced.
    if (routeRewrite(pathname, signedIn)) return null;
    return isPublicPath(pathname) ? null : "/login";
  }
  // Signed in: only the sign-in doors send the visitor to Today; every other
  // public path (recovery, support, the auth callback, verify) stays open.
  return isSignedOutDoor(pathname) ? "/" : null;
}
