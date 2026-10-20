"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { tourAnchor } from "@/lib/tour/steps";
import { NAV_ITEMS, isActive } from "./nav-items";

/**
 * The md+ left rail (Foundation; unchanged by Personalization & Navigation
 * Polish). Below md it renders nothing — the phone navigation sheet
 * (MobileNav) takes over. The destination list and active rule live in
 * nav-items.ts so both presentations stay identical in content and order.
 * The original classes are kept verbatim behind `hidden md:block` so the
 * desktop rail's computed styles are exactly what they were.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Below md: not rendered (MobileNav's sheet replaces the old bottom bar).
        "hidden md:block",
        "fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card",
        // md+: static left rail.
        "md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-t-0 md:bg-transparent",
      )}
    >
      <ul className="flex md:h-full md:flex-col md:gap-1 md:p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                {...(item.tourAnchor ? tourAnchor(item.tourAnchor) : {})}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-xs font-medium",
                  "md:flex-row md:gap-3 md:rounded-md md:px-3 md:py-2 md:text-sm",
                  // Active uses the electric-blue accent — a subtle tinted fill
                  // on the md+ rail — plus semibold weight so the selected state
                  // never relies on color alone (also carries aria-current).
                  active
                    ? "font-semibold text-primary md:bg-primary/10"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
