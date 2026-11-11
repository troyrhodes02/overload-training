import Link from "next/link";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { ModeCta } from "./mode-cta";
import { SiteLinks, SiteMobileNav } from "./marketing-nav";

/**
 * The public pages' frame (design doc §6 "Shared"; regrouped by OVE-119): a
 * quiet header and a footer of plain links. Not the app shell — no app
 * navigation, account menu, tour, or What's New dialog.
 *
 * md+: the wordmark, then Home, Pricing, Changelog, and the server-resolved
 * actions on the right. Below md: the wordmark and a menu button whose sheet
 * holds the same links and the actions, so nothing needs a scroll to reach.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <nav
        aria-label="Site"
        className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 md:px-6"
      >
        <Link
          href="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <OverloadLockup />
        </Link>
        <SiteLinks />
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <ModeCta placement="header" />
        </div>
        <div className="ml-auto md:hidden">
          <SiteMobileNav actions={<ModeCta placement="sheet" />} />
        </div>
      </nav>
    </header>
  );
}

const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
  { href: "/support", label: "Support" },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <p>© Overload</p>
      </div>
    </footer>
  );
}
