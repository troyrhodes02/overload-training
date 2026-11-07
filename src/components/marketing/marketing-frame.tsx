import Link from "next/link";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { ModeCta } from "./mode-cta";

/**
 * The public pages' frame (design doc §6 "Shared"): a quiet header with the
 * wordmark, Pricing and Changelog links (from sm), and the server-resolved
 * action; and a footer of plain links. Not the app shell — no app navigation,
 * account menu, tour, or What's New dialog.
 */

export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-background md:sticky md:top-0 md:z-20 md:bg-background/90 md:backdrop-blur">
      <nav
        aria-label="Site"
        className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 md:px-6"
      >
        <Link
          href="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <OverloadLockup />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="hidden px-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Pricing
          </Link>
          <Link
            href="/changelog"
            className="hidden px-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Changelog
          </Link>
          <ModeCta placement="header" />
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
