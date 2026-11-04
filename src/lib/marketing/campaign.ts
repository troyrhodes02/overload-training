/**
 * First-party campaign attribution (Public Landing Page & Changelog, spec §4,
 * §10; RD-8/RD-9). Pure and isomorphic: the proxy sets the cookie, server
 * code reads it, and nothing here touches a database, the network, or any
 * third party.
 *
 * A campaign is INTENT, never authorization. It changes copy (the BLIZZY code
 * reminder) and one provenance value written at signup — never a price, a
 * discount, or eligibility, which Stripe Checkout and the existing billing
 * checks alone decide.
 *
 * The cookie holds only the allowlisted campaign name and when it was set
 * ("blizzy.1730750000"): no email, IP, referrer, query string, or visitor id.
 * Forging it is equivalent to visiting /blizzy, so it is validated (allowlist
 * + age) rather than signed. It lives two hours and is deleted after signup.
 */

/** The closed allowlist. Adding one is a reviewed change (enum + migration). */
export const CAMPAIGNS = ["blizzy"] as const;
export type Campaign = (typeof CAMPAIGNS)[number];

export const CAMPAIGN_COOKIE = "ovl_campaign";

/** Two hours (Bucket C guess, flagged for owner review — spec OQ-4). */
export const CAMPAIGN_TTL_SECONDS = 2 * 60 * 60;

/** Clock skew tolerated for an issue time slightly in the future. */
const FUTURE_SKEW_SECONDS = 60;

/** The landing path each campaign is set from. */
const CAMPAIGN_PATHS: Record<string, Campaign> = { "/blizzy": "blizzy" };

export function isCampaign(value: unknown): value is Campaign {
  return (
    typeof value === "string" &&
    (CAMPAIGNS as readonly string[]).includes(value)
  );
}

/** The campaign a request path sets, or null ("/blizzy" → "blizzy"). */
export function campaignForPath(pathname: string): Campaign | null {
  return CAMPAIGN_PATHS[pathname] ?? null;
}

const toSeconds = (now: Date) => Math.floor(now.getTime() / 1000);

export function encodeCampaign(campaign: Campaign, now: Date): string {
  return `${campaign}.${toSeconds(now)}`;
}

/**
 * The campaign a cookie value proves, or null. Anything that isn't exactly an
 * allowlisted name and an in-window issue time is treated as absent: wrong
 * case, unknown names, extra segments, non-numeric or stale times, and times
 * more than a minute in the future.
 */
export function parseCampaign(
  raw: string | undefined | null,
  now: Date,
): Campaign | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const match = /^([a-z]+)\.(\d{1,12})$/.exec(raw);
  if (!match || !isCampaign(match[1])) return null;
  const age = toSeconds(now) - Number(match[2]);
  if (age > CAMPAIGN_TTL_SECONDS || age < -FUTURE_SKEW_SECONDS) return null;
  return match[1];
}

export type CampaignCookie = {
  name: typeof CAMPAIGN_COOKIE;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    secure: boolean;
    maxAge: number;
  };
};

/** The cookie a GET of this path should set, or null when it sets none. */
export function campaignCookieFor(
  pathname: string,
  now: Date,
  secure: boolean,
): CampaignCookie | null {
  const campaign = campaignForPath(pathname);
  if (!campaign) return null;
  return {
    name: CAMPAIGN_COOKIE,
    value: encodeCampaign(campaign, now),
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: CAMPAIGN_TTL_SECONDS,
    },
  };
}
