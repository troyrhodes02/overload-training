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
 */
export const SIGNED_OUT_DOORS = ["/login", "/signup"] as const;

const SIGNED_IN_SAFE_PUBLIC = [
  "/forgot-password",
  "/reset-password",
  "/support",
  "/auth/confirm",
  "/verify-email",
] as const;

export const PUBLIC_PATHS = [
  ...SIGNED_OUT_DOORS,
  ...SIGNED_IN_SAFE_PUBLIC,
] as const;

function matches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
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

/** Where the proxy should redirect this request, or null to let it through. */
export function routeRedirect(
  pathname: string,
  signedIn: boolean,
): string | null {
  if (!signedIn) return isPublicPath(pathname) ? null : "/login";
  // Signed in: only the sign-in doors send the visitor to Today; every other
  // public path (recovery, support, the auth callback, verify) stays open.
  return isSignedOutDoor(pathname) ? "/" : null;
}
