/**
 * The public support address shown on `/support` (Public Accounts spec §11, R3;
 * design doc Screen 9). This is the SUPPORT sender identity, distinct from the
 * authentication identity (`no-reply@<auth domain>`) that recovery and
 * verification mail come from. It is not a sending integration here — it is a
 * `mailto:` target rendered in the UI by PA6.
 *
 * Public by design: the support address is meant to be seen, so it is read
 * from `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` and is allowed in the client
 * bundle. There is no secret here. (This is NOT the auth sender identity, which
 * lives only in Supabase SMTP config and never in the app.)
 *
 * The reference below is intentionally the static `process.env.NEXT_PUBLIC_…`
 * form so the Next.js bundler inlines it; a dynamic lookup would not be
 * replaced at build time. When unset, a clearly-marked placeholder is returned
 * so no screen crashes and a reviewer can see the real value is a runbook step.
 */

/** A visibly-placeholder address used until the real support domain is set. */
export const SUPPORT_EMAIL_PLACEHOLDER = "support@example.com";

export function supportEmail(): string {
  const configured = process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL?.trim();
  return configured && configured.length > 0
    ? configured
    : SUPPORT_EMAIL_PLACEHOLDER;
}
