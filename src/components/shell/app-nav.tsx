"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { tourAnchor } from "@/lib/tour/steps";
import { AccountFooter, type ShellAccount } from "./account-footer";
import { NavMoreGroup } from "./nav-more-group";
import {
  NAV_ITEMS,
  isActive,
  isInMoreGroup,
  moreNavItems,
  type NavItem,
} from "./nav-items";

/**
 * The md+ sidebar (OVE-119). Everything the signed-in lifter navigates to
 * lives here — there is no ⋮ menu on desktop: the training destinations in
 * their usual order, a divider, the collapsible "Account & app" group
 * (Settings, Plan & Billing, What's New, Send feedback, Admin for admins),
 * and the account at the bottom with Sign out. Below md it renders nothing;
 * the phone navigation sheet (MobileNav) holds the same lists.
 */
export function AppNav({
  account,
  isAdmin,
}: {
  account: ShellAccount;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const more = moreNavItems(isAdmin);
  const all = [...NAV_ITEMS, ...more];

  const row = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href, all);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          {...(item.tourAnchor ? tourAnchor(item.tourAnchor) : {})}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            // Active: the accent tint plus semibold, never color alone (also
            // carries aria-current).
            active
              ? "bg-primary/10 font-semibold text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon aria-hidden className="size-5" />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Below md: not rendered (MobileNav's sheet holds the same lists).
        "hidden md:flex md:flex-col",
        "md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-t-0 md:bg-transparent",
      )}
    >
      <div className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">{NAV_ITEMS.map(row)}</ul>
        <div className="my-3 border-t border-border" />
        <NavMoreGroup containsCurrent={isInMoreGroup(pathname, isAdmin)}>
          <ul className="mt-1 flex flex-col gap-1">{more.map(row)}</ul>
        </NavMoreGroup>
      </div>
      <AccountFooter account={account} />
    </nav>
  );
}
