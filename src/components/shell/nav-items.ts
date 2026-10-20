import {
  Building2,
  CalendarRange,
  Dumbbell,
  History,
  House,
  Settings,
  Target,
} from "lucide-react";

/**
 * The app's primary destinations — one list, rendered two ways: the left rail
 * at md+ (AppNav) and the phone navigation sheet below md (MobileNav). Built
 * as an extensible list so later pitches add destinations without
 * restructuring the shell. Library & Gyms Setup added Exercises and Gyms;
 * Split & Mesocycle Builder added Plan; Goals added Goals.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Today", icon: House },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/history", label: "History", icon: History },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/exercises", label: "Exercises", icon: Dumbbell },
  { href: "/gyms", label: "Gyms", icon: Building2 },
];

/**
 * Secondary entries shown only in the phone sheet, below a divider
 * (Personalization & Navigation Polish R10). Settings is already reachable
 * from the account menu at every width; it is not a rail destination.
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Active state is derived from the current path so adding items stays correct
 * (one active item, correct aria-current): Today only on `/`, every other
 * destination on its path and sub-paths.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
