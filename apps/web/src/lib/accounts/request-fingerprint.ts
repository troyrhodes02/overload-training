import "server-only";

/**
 * A coarse request fingerprint for the signup and recovery rate limiter (PA2,
 * PA4; Public Accounts §9/R4). Extracted in Pitch 21d (RD-20) so the web's
 * server actions and the mobile API's account routes key the throttle the same
 * way. Behavior is unchanged from the two copies it replaces.
 *
 * The first client IP from the standard proxy headers, else a stable fallback
 * from the user-agent and language, so a header-stripped request still gets
 * limited (and never evades the throttle by omitting the IP). It is NEVER the
 * email, so a rate-limit decision reveals no membership; the throttle
 * SHA-256-hashes it before it touches the database.
 */
export function requestFingerprint(headers: {
  get(name: string): string | null;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
  if (ip) return `ip:${ip}`;
  const ua = headers.get("user-agent")?.trim() ?? "";
  const lang = headers.get("accept-language")?.trim() ?? "";
  return `ua:${ua}|${lang}`;
}
