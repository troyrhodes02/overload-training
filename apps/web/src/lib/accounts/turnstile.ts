import "server-only";

/**
 * Server-side Cloudflare Turnstile verification (Public Accounts, spec §9, R6).
 * The browser renders the widget and submits a short-lived token; the server
 * is the gate — it calls Turnstile's `siteverify` endpoint before any account
 * is created or any recovery lookup happens. A missing, faked, or expired token
 * is rejected identically to a human failure, so it reveals nothing about any
 * address.
 *
 * `TURNSTILE_SECRET_KEY` is server-only (bundle-scan forbidden);
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is the public widget key.
 *
 * Test seam: `deps.verify` is injectable so unit tests stub the network call.
 * In a NON-production env with the secret unset, verification falls back to a
 * documented bypass that treats a present token as verified — this keeps the
 * local stack and integration tests deterministic WITHOUT a network dependency.
 * The bypass is NEVER client-controllable: it is gated on `NODE_ENV !==
 * "production"` AND an unset server secret, both server-only. Production always
 * requires a real key and a real siteverify round-trip.
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The slice of Turnstile's siteverify response the server relies on. */
type SiteVerifyResult = { success: boolean };

export type VerifyTurnstileDeps = {
  /** Calls Turnstile siteverify with the token and secret; returns success. */
  verify: (token: string, secret: string) => Promise<boolean>;
  /** The server env; injectable so tests pin NODE_ENV and the secret. */
  env: Record<string, string | undefined>;
};

async function siteverify(token: string, secret: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
  if (!response.ok) return false;
  const data = (await response.json()) as SiteVerifyResult;
  return data.success === true;
}

const defaultDeps: VerifyTurnstileDeps = {
  verify: siteverify,
  env: process.env,
};

/**
 * Verify a Turnstile challenge token server-side. Returns `true` only when the
 * challenge genuinely passed (or the documented non-production bypass applies);
 * an empty token, a rejected token, or a transport failure returns `false`.
 */
export async function verifyChallenge(
  token: unknown,
  deps: Partial<VerifyTurnstileDeps> = {},
): Promise<boolean> {
  const { verify, env } = { ...defaultDeps, ...deps };

  const value = typeof token === "string" ? token.trim() : "";
  const secret = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const isProduction = env.NODE_ENV === "production";

  if (!secret) {
    // Production MUST have a real key and never offers a skip: with no secret
    // configured there is nothing to verify against, so every attempt fails.
    if (isProduction) return false;
    // Non-production bypass: a present token is treated as verified so the
    // local stack and tests work without reaching Cloudflare. A missing token
    // still fails, mirroring the server-is-the-gate rule.
    return value.length > 0;
  }

  if (!value) return false;

  try {
    return await verify(value, secret);
  } catch {
    // A transport error is a verification failure, never a pass: the gate
    // fails closed.
    return false;
  }
}
