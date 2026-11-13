"use client";

import { useEffect, useState, type ReactNode } from "react";
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

/** The public pages' destinations, in order (OVE-119). */
export const SITE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
] as const;

const DESKTOP_QUERY = "(min-width: 768px)";

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** md+: Home, Pricing, Changelog beside the wordmark. */
export function SiteLinks() {
  const pathname = usePathname();
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {SITE_LINKS.map((l) => {
        const current = isCurrent(pathname, l.href);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-md px-2 py-1 text-sm hover:text-foreground",
                current
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Below md: a menu button that opens a sheet with Home, Pricing, Changelog,
 * then the server-resolved actions (Sign in / Create an account, or the
 * invite or closed state), passed in as `actions` (OVE-119). It closes on a
 * navigation, on reaching md, and on ×, the scrim, or Escape (Radix).
 */
export function SiteMobileNav({ actions }: { actions: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 md:hidden [&_svg]:size-5"
          aria-label="Open menu"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        closeLabel="Close menu"
        className="flex w-72 max-w-[85vw] flex-col gap-0 p-0 sm:max-w-[85vw]"
      >
        <SheetHeader className="min-h-14 justify-center border-b border-border px-4 py-3">
          <SheetTitle className="text-base">Overload</SheetTitle>
          <SheetDescription className="sr-only">Site menu</SheetDescription>
        </SheetHeader>
        <nav aria-label="Site" className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {SITE_LINKS.map((l) => {
              const current = isCurrent(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      current
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-border p-4">{actions}</div>
      </SheetContent>
    </Sheet>
  );
}
