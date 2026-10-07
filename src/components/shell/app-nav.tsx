import Link from "next/link";
import { House } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's primary navigation. Built as an extensible list so later pitches add
 * destinations (Plan, History, Goals) without restructuring the shell. Today is
 * the only destination that exists in Foundation.
 *
 * Bottom bar on mobile (thumb reach); left rail at md+.
 */
type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
};

const NAV_ITEMS: NavItem[] = [{ href: "/", label: "Today", icon: House }];

export function AppNav() {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Mobile: fixed bottom bar.
        "fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card",
        // md+: static left rail.
        "md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-t-0 md:bg-transparent",
      )}
    >
      <ul className="flex md:h-full md:flex-col md:gap-1 md:p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={item.href === "/" ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-xs font-medium text-primary",
                  "md:flex-row md:gap-3 md:rounded-md md:px-3 md:py-2 md:text-sm",
                  "md:bg-accent md:text-accent-foreground",
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
