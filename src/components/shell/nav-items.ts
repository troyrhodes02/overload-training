import {
  Building2,
  CalendarRange,
  CreditCard,
  Dumbbell,
  History,
  House,
  MessageSquare,
  ScrollText,
  Settings,
  Shield,
  Target,
} from "lucide-react";
import type { TourAnchor } from "@/lib/tour/steps";

/**
 * The app's navigation — one set of lists, rendered two ways: the left
 * sidebar at md+ (AppNav) and the phone navigation sheet below md
 * (MobileNav), so both always hold the same destinations in the same order.
 *
 * - NAV_ITEMS: the training destinations (unchanged order).
 * - moreNavItems(): below a divider, a collapsible group with the account and
 *   app pages (OVE-119): Settings, Plan & Billing, What's New, Send feedback,
 *   and — only when the server resolved the account as an admin — Admin.
 *   Hiding Admin is courtesy; requireAdmin() is the check.
 * - The account (initials, username, sign out) sits at the bottom of both.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
  /** The sidebar item's onboarding-tour anchor (desktop sidebar only). */
  tourAnchor?: TourAnchor;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Today", icon: House },
  { href: "/plan", label: "Plan", icon: CalendarRange, tourAnchor: "nav-plan" },
  {
    href: "/history",
    label: "History",
    icon: History,
    tourAnchor: "nav-history",
  },
  { href: "/goals", label: "Goals", icon: Target, tourAnchor: "nav-goals" },
  {
    href: "/exercises",
    label: "Exercises",
    icon: Dumbbell,
    tourAnchor: "nav-exercises",
  },
  { href: "/gyms", label: "Gyms", icon: Building2, tourAnchor: "nav-gyms" },
];

const MORE_NAV_ITEMS: readonly NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  {
    href: "/settings/billing",
    label: "Plan & Billing",
    icon: CreditCard,
    tourAnchor: "nav-billing",
  },
  { href: "/settings/whats-new", label: "What's New", icon: ScrollText },
  { href: "/feedback", label: "Send feedback", icon: MessageSquare },
];

const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: Shield,
};

/** The collapsible group's items; Admin only for an allowlisted account. */
export function moreNavItems(isAdmin: boolean): readonly NavItem[] {
  return isAdmin ? [...MORE_NAV_ITEMS, ADMIN_NAV_ITEM] : MORE_NAV_ITEMS;
}

/** The collapsible group's heading. */
export const MORE_NAV_LABEL = "Account & app";

/**
 * Whether `href` is the current destination. Today matches only `/`; every
 * other destination matches its path and sub-paths — except when a more
 * specific destination also matches (Settings vs. Plan & Billing at
 * /settings/billing), so exactly one item is ever active.
 */
export function isActive(
  pathname: string,
  href: string,
  all: readonly NavItem[] = [...NAV_ITEMS, ...moreNavItems(true)],
): boolean {
  const matches = (h: string) =>
    h === "/"
      ? pathname === "/"
      : pathname === h || pathname.startsWith(`${h}/`);
  if (!matches(href)) return false;
  return !all.some((i) => i.href.length > href.length && matches(i.href));
}

/** True when the current page is one of the group's destinations. */
export function isInMoreGroup(pathname: string, isAdmin: boolean): boolean {
  return moreNavItems(isAdmin).some((i) => isActive(pathname, i.href));
}
