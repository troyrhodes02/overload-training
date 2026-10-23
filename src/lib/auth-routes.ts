/**
 * Which paths need no auth session, and where a signed-in visitor is sent
 * instead (Accounts spec §9). Pure, so the proxy's routing is unit-testable.
 *
 * Public: the two unauthenticated doors. A signed-in lifter has no reason to
 * see either, so both send them to Today.
 */
export const PUBLIC_PATHS = ["/login", "/signup"] as const;

function matches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => matches(pathname, p));
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
  return isPublicPath(pathname) ? "/" : null;
}
