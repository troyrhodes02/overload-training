import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminPath, routeRedirect, routeRewrite } from "@/lib/auth-routes";
import { isAdminUserId } from "@/lib/admin/allowlist";
import { campaignCookieFor } from "@/lib/marketing/campaign";

/** A path no route answers: rewriting to it renders the ordinary 404. */
const NOT_FOUND_PATH = "/_not-found-overload";

/**
 * Next.js 16 Proxy (formerly Middleware). Three jobs:
 *  1. Refresh the Supabase auth session cookie on every request.
 *  2. OPTIMISTICALLY redirect unauthenticated requests away from protected
 *     routes to /login (and signed-in visitors away from login and signup).
 *     This is defense-in-depth only — the protected layout's requireAccount()
 *     and every server action re-check the session authoritatively.
 *  3. Serve the public landing page at `/` to signed-out visitors (a rewrite,
 *     so the URL stays `/`); a signed-in lifter's `/` is Today, untouched
 *     (Public Landing Page & Changelog, spec §7).
 *  4. Remember a campaign landing (GET /blizzy) in a short-lived, first-party,
 *     HttpOnly cookie holding only the allowlisted campaign name and its issue
 *     time (spec §4, RD-8). Never set by a link prefetch or by a navigation
 *     from Overload's own pages, so only an arrival from outside counts.
 */

/**
 * True when the visitor navigated to the page from Overload itself — a
 * same-origin link, or an in-app (RSC) navigation — rather than arriving
 * from outside (review finding 5 on PR #121). Reading about the offer from
 * /pricing is not "arriving from the campaign", so it is never attributed.
 */
function isInternalNavigation(request: NextRequest): boolean {
  const h = request.headers;
  if (h.has("rsc") || h.has("next-router-state-tree")) return true;
  if ((h.get("sec-fetch-site") ?? "") === "same-origin") return true;
  const referer = h.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

/** True for Next router / browser speculative prefetches (not a real visit). */
function isPrefetch(request: NextRequest): boolean {
  const h = request.headers;
  return (
    h.has("next-router-prefetch") ||
    /prefetch/i.test(h.get("purpose") ?? "") ||
    /prefetch/i.test(h.get("sec-purpose") ?? "")
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect while preserving any session cookies the Supabase client refreshed
  // during getUser(): a plain NextResponse.redirect would drop them, leaving the
  // client with a stale refresh token and bouncing it back to /login next time.
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  const target = routeRedirect(request.nextUrl.pathname, Boolean(user));
  if (target) return redirectTo(target);

  const landing = routeRewrite(request.nextUrl.pathname, Boolean(user));
  if (landing) {
    const url = request.nextUrl.clone();
    url.pathname = landing;
    // `{ request }` forwards the request cookies Supabase refreshed above to
    // the render, so the landing page never re-checks a spent token (review
    // finding 6 on PR #121); the response cookies go to the browser.
    const rewrite = NextResponse.rewrite(url, { request });
    for (const cookie of response.cookies.getAll()) {
      rewrite.cookies.set(cookie);
    }
    return rewrite;
  }

  if (
    request.method === "GET" &&
    !isPrefetch(request) &&
    !isInternalNavigation(request)
  ) {
    const campaign = campaignCookieFor(
      request.nextUrl.pathname,
      new Date(),
      request.nextUrl.protocol === "https:",
    );
    if (campaign) {
      response.cookies.set(campaign.name, campaign.value, campaign.options);
    }
  }

  // Admin Center & Feedback (spec R23): a signed-in non-admin gets the very
  // same 404 as a URL that does not exist — status included, which a page
  // that has started streaming can no longer change — and not one byte of
  // the admin area. Optimistic like the redirect above: requireAdmin() on
  // every admin page and action is the authoritative check.
  if (
    user &&
    isAdminPath(request.nextUrl.pathname) &&
    !isAdminUserId(user.id)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = NOT_FOUND_PATH;
    url.search = "";
    const rewrite = NextResponse.rewrite(url);
    for (const cookie of response.cookies.getAll()) {
      rewrite.cookies.set(cookie);
    }
    return rewrite;
  }
  return response;
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
