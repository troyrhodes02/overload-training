"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  isActive,
  type NavItem,
} from "./nav-items";

/** Tailwind's `md` breakpoint: at and above it the left rail takes over. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Phone navigation (Personalization & Navigation Polish, design doc Screens
 * 3–4): a menu button in the header opens a left sheet with the same
 * destinations as the rail, then Settings. It never stays open after a
 * navigation — a tap on a destination, a route change, or the viewport
 * reaching md closes it — and ×, the scrim, and Escape close it too (Radix).
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Any route change (link, back/forward) closes the sheet. Adjusting state
  // while rendering when the route changes avoids an effect-driven extra pass.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Growing to desktop width closes it: the rail is visible there.
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const item = (navItem: NavItem) => {
    const Icon = navItem.icon;
    const active = isActive(pathname, navItem.href);
    return (
      <li key={navItem.href}>
        <Link
          ref={active ? activeRef : undefined}
          href={navItem.href}
          onClick={() => setOpen(false)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            // Active matches the rail: accent text + tint + semibold, never
            // color alone (also aria-current).
            active
              ? "bg-primary/10 font-semibold text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon aria-hidden className="size-5" />
          {navItem.label}
        </Link>
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 md:hidden [&_svg]:size-5"
          aria-label="Open navigation"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        closeLabel="Close navigation"
        className="w-72 max-w-[85vw] gap-0 p-0 sm:max-w-[85vw]"
        onOpenAutoFocus={(event) => {
          // Start on the current screen's item rather than the close button.
          if (activeRef.current) {
            event.preventDefault();
            activeRef.current.focus();
          }
        }}
      >
        <SheetHeader className="min-h-14 justify-center border-b border-border px-4 py-3">
          <SheetTitle className="text-base">Overload</SheetTitle>
          <SheetDescription className="sr-only">
            Go to a screen
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Primary" className="overflow-y-auto p-2">
          <ul className="space-y-1">{NAV_ITEMS.map(item)}</ul>
          <div className="mx-3 my-2 border-t border-border" />
          <ul className="space-y-1">{SECONDARY_NAV_ITEMS.map(item)}</ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
