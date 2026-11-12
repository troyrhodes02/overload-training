/**
 * Disposable (throwaway) email domains refused at signup (signup hardening,
 * item 2b). Easy to edit: one lowercase domain per line, no wildcards. A
 * subdomain of a listed domain is refused too ("x.mailinator.com").
 *
 * Kept deliberately small and well known. It is a speed bump against
 * throwaway trial accounts, not a guarantee; a determined person can use a
 * domain that isn't listed.
 */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "10minutemail.com",
  "20minutemail.com",
  "burnermail.io",
  "discard.email",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamailblock.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "spamgourmet.com",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
];
