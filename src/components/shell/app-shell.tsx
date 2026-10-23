import type { ReactNode } from "react";
import { AppNav } from "./app-nav";
import { AccountMenu } from "./account-menu";
import { AppearanceSync } from "./appearance-sync";
import { MobileNav } from "./mobile-nav";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { Toaster } from "@/components/ui/sonner";
import { TourProvider } from "@/components/tour/tour-provider";
import { WhatsNewDialog } from "@/components/release-notes/whats-new-dialog";
import type { Appearance } from "@/lib/appearance/appearance";
import type { WhatsNewDialogData } from "@/lib/release-notes/seen";

/**
 * The authenticated application shell: a top app bar, a content region, and the
 * primary navigation. Chrome only — it holds no data access. Later pitches
 * render their surfaces inside the content region and extend nav-items.ts.
 *
 * Phones (below md): a sticky header with the menu button that opens the
 * navigation sheet; nothing is pinned to the bottom except a screen's own
 * thumb-reach action bar. md+: the left rail and the static header, unchanged
 * (Personalization & Navigation Polish).
 *
 * `appearance` is the account's stored preference (read by the layout): the
 * shell keeps the document and the toasts on it. `tourAutoStart` says the
 * account is due its first onboarding tour (Onboarding Tour); the provider
 * opens it once and lets Settings replay it. `whatsNew` holds the significant
 * release notes the account hasn't seen (What's New), or null; the dialog
 * opens with all of them, once, and only from the visit's first render.
 */
export function AppShell({
  appearance,
  tourAutoStart,
  whatsNew,
  isAdmin = false,
  children,
}: {
  appearance: Appearance;
  tourAutoStart: boolean;
  whatsNew: WhatsNewDialogData | null;
  /** Server-resolved (admin allowlist): show the Admin menu item. */
  isAdmin?: boolean;
  children: ReactNode;
}) {
  return (
    <TourProvider autoStart={tourAutoStart}>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <AppearanceSync appearance={appearance} />
        {/* Left rail at md+; renders nothing below md. */}
        <AppNav />

        <div className="flex min-h-dvh flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur md:static md:z-auto md:h-auto md:justify-between md:gap-0 md:bg-transparent md:px-4 md:py-3 md:backdrop-blur-none">
            <MobileNav />
            <OverloadLockup size="sm" />
            <div className="ml-auto md:ml-0">
              <AccountMenu isAdmin={isAdmin} />
            </div>
          </header>

          <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6">
            {children}
          </main>
        </div>

        {/* One toaster for the whole authenticated app (archive/undo, saves). */}
        <Toaster theme={appearance} />
        <WhatsNewDialog data={whatsNew} />
      </div>
    </TourProvider>
  );
}
