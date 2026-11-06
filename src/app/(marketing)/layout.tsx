import type { ReactNode } from "react";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/marketing-frame";

/**
 * The public pages (Public Landing Page & Changelog, spec §6): landing,
 * pricing, /blizzy, changelog, privacy, terms. Reachable signed in or out (the
 * proxy lists them as public); they read no account data. Static except the
 * Suspense-wrapped call-to-action parts, which resolve per request.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
