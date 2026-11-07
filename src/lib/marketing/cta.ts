import type { SignupMode } from "@/lib/accounts/signup-gate";

/**
 * The public call-to-action rule (Public Landing Page & Changelog, design doc
 * §6.9; spec §4, RD-5/RD-6). Pure: one function of what the SERVER knows —
 * whether the visitor has an auth session, the signup mode, and the billing
 * kill switch — and the only producer of public CTA labels and targets. No
 * page, header, or card invents its own button.
 *
 * Truth rules it encodes:
 *  - Closed never offers signup, and no mode offers a waitlist or email field.
 *  - Invite says an invite code is needed.
 *  - Billing off never yields a subscribe action or a route toward checkout;
 *    billing on routes a signed-in lifter to the existing Plan & Billing screen
 *    (which owns email verification and hosted Checkout), never to Checkout.
 *  - A signed-in visitor is always offered the app.
 */

/** Imported type-only so this module stays pure and isomorphic. */
export type MarketingContext = {
  signedIn: boolean;
  signupMode: SignupMode;
  billingEnabled: boolean;
};

export type CtaHref = "/" | "/signup" | "/login" | "/settings/billing";

export type CtaAction = { label: string; href: CtaHref };

export type ResolvedCta = {
  /** The one action that works today (landing hero, header, Free card). */
  primary: CtaAction;
  /** "Sign in" beside the primary action, when it is not already primary. */
  secondary: CtaAction | null;
  /** One plain line under the primary action, or null. */
  note: string | null;
  /** Closed mode: the note is followed by a support link. */
  closed: boolean;
  /** The Pro card's action, or null when Pro can't be bought (billing off). */
  pro: CtaAction | null;
};

/**
 * What the pages fall back to when the context can't be resolved: the most
 * conservative state, which never offers an action that might not work.
 */
export const FAIL_CLOSED_CONTEXT: MarketingContext = {
  signedIn: false,
  signupMode: "closed",
  billingEnabled: false,
};

const SIGN_IN: CtaAction = { label: "Sign in", href: "/login" };

export const TRIAL_NOTE =
  "Free to use. New accounts get 14 days of Pro, no card.";
export const INVITE_NOTE =
  "Overload is invite-only right now. You'll need an invite code to create an account.";
export const CLOSED_NOTE = "Overload isn't taking new accounts right now.";

export function resolveCta(ctx: MarketingContext): ResolvedCta {
  if (ctx.signedIn) {
    return {
      primary: { label: "Open Overload", href: "/" },
      secondary: null,
      note: null,
      closed: false,
      pro: ctx.billingEnabled
        ? { label: "Go to Plan & Billing", href: "/settings/billing" }
        : null,
    };
  }
  switch (ctx.signupMode) {
    case "public":
      return {
        primary: { label: "Create an account", href: "/signup" },
        secondary: SIGN_IN,
        note: TRIAL_NOTE,
        closed: false,
        pro: ctx.billingEnabled
          ? { label: "Create an account to subscribe", href: "/signup" }
          : null,
      };
    case "invite":
      return {
        primary: { label: "Join with an invite code", href: "/signup" },
        secondary: SIGN_IN,
        note: INVITE_NOTE,
        closed: false,
        pro: ctx.billingEnabled
          ? { label: "Join with an invite code", href: "/signup" }
          : null,
      };
    default:
      return {
        primary: SIGN_IN,
        secondary: null,
        note: CLOSED_NOTE,
        closed: true,
        pro: ctx.billingEnabled
          ? { label: "Sign in to subscribe", href: "/login" }
          : null,
      };
  }
}
