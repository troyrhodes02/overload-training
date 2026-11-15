import "server-only";
import { headers } from "next/headers";

/**
 * Where Supabase Auth email links return: this deployment's `/auth/confirm`.
 *
 * Both email flows pass this URL to Supabase (`emailRedirectTo` for
 * verification, `redirectTo` for recovery), and the templates link to
 * `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`. Without it Supabase
 * substitutes the bare Site URL, so a link lands on the home page instead of
 * `/auth/confirm` (the 21d staging QA defect: a native reset request opened the
 * landing page).
 *
 * Supabase's own Redirect-URL allow-list is the hard gate: a URL it doesn't
 * allow is replaced with the Site URL. This module validates the host first.
 */

/** The request headers this needs (a `Headers`, or Next's `headers()`). */
export type HeaderSource = { get(name: string): string | null };

/**
 * Is `host` a deployment we're willing to send an auth link back to?
 * The link must open the SAME deployment the lifter is on (a Vercel preview
 * must verify on that preview, since production does not yet carry this flow),
 * so the redirect host follows the request — but only within an allow-list, so
 * a spoofed Host header can never point the link at an attacker's domain.
 * (Supabase's Redirect-URL allow-list is a second gate; on Vercel the platform
 * sets the forwarded host, so a request can't name another deployment.)
 *
 * Allowed: localhost; any `*.vercel.app` (preview + the Vercel prod alias); the
 * configured production host (NEXT_PUBLIC_APP_URL) and its www/apex sibling;
 * and any host in OVERLOAD_REDIRECT_HOSTS (comma-separated). Anything else is
 * refused.
 */
export function isAllowedRedirectHost(
  host: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const bare = host.split(":")[0].trim().toLowerCase();
  if (!bare) return false;
  if (bare === "localhost" || bare === "127.0.0.1" || bare === "[::1]")
    return true;
  if (bare === "vercel.app" || bare.endsWith(".vercel.app")) return true;
  const configured = env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const confHost = new URL(configured).hostname.toLowerCase();
      if (confHost === bare) return true;
      // Also accept the www/apex SIBLING of the same configured domain. A
      // canonical-www production whose NEXT_PUBLIC_APP_URL is set to the apex
      // (or vice versa) must still honor the host the lifter is actually on.
      // Bounded to one `www.` toggle of the configured host — never a
      // different registrable domain.
      const sibling = confHost.startsWith("www.")
        ? confHost.slice(4)
        : `www.${confHost}`;
      if (sibling === bare) return true;
    } catch {
      // ignore a malformed configured URL
    }
  }
  return (env.OVERLOAD_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(bare);
}

/**
 * The absolute `/auth/confirm` URL for the deployment that received `request`.
 * The host is validated by isAllowedRedirectHost; anything missing or
 * unexpected falls back to NEXT_PUBLIC_APP_URL (else localhost). Pure: the
 * mobile API passes its request's headers; web code uses requestAuthConfirmUrl.
 */
export function authConfirmUrl(
  request: HeaderSource | null,
  env: Record<string, string | undefined> = process.env,
): string {
  const fallback = `${(env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/auth/confirm`;
  const raw = request?.get("x-forwarded-host") ?? request?.get("host");
  const bare = raw?.split(",")[0].trim();
  if (!bare || !isAllowedRedirectHost(bare, env)) return fallback;
  const forwarded = request?.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : bare.startsWith("localhost") || bare.startsWith("127.")
        ? "http"
        : "https";
  return `${proto}://${bare}/auth/confirm`;
}

/** authConfirmUrl for the current server request (pages and server actions). */
export async function requestAuthConfirmUrl(): Promise<string> {
  try {
    return authConfirmUrl(await headers());
  } catch {
    return authConfirmUrl(null);
  }
}
