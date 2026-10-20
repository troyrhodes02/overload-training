import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeRedirect } from "@/lib/auth-routes";

/**
 * Next.js 16 Proxy (formerly Middleware). Two jobs:
 *  1. Refresh the Supabase auth session cookie on every request.
 *  2. OPTIMISTICALLY redirect unauthenticated requests away from protected
 *     routes to /login (and signed-in visitors away from login and signup).
 *     This is defense-in-depth only — the protected layout's requireAccount()
 *     and every server action re-check the session authoritatively.
 */

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
  return target ? redirectTo(target) : response;
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
