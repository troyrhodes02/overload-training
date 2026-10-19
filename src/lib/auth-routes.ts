/**
 * Which paths need no auth session, and where a signed-in visitor is sent
 * instead (Accounts spec §9). Pure, so the proxy's routing is unit-testable.
 *
 * Public: the unauthenticated doors. `/reset-password` and `/auth/confirm`
 * stay reachable while signed in, because following a reset link signs the
 * lifter in with a recovery auth session first.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/confirm",
] as const;

/** Public pages a signed-in lifter has no reason to see: they go to Today. */
const SIGNED_IN_REDIRECTS = ["/login", "/signup", "/forgot-password"];

function matches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => matches(pathname, p));
}

/** Where the proxy should redirect this request, or null to let it through. */
export function routeRedirect(
  pathname: string,
  signedIn: boolean,
): string | null {
  if (!signedIn) return isPublicPath(pathname) ? null : "/login";
  return SIGNED_IN_REDIRECTS.some((p) => matches(pathname, p)) ? "/" : null;
}
