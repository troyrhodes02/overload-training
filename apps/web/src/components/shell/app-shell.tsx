import type { ReactNode } from "react";
import { AppNav } from "./app-nav";
import type { ShellAccount } from "./account-footer";
import { AppearanceSync } from "./appearance-sync";
import { MobileNav } from "./mobile-nav";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { Toaster } from "@/components/ui/sonner";
import { TourProvider } from "@/components/tour/tour-provider";
import { WhatsNewDialog } from "@/components/release-notes/whats-new-dialog";
import type { Appearance } from "@overload/shared/appearance/appearance";
import type { WhatsNewDialogData } from "@/lib/release-notes/seen";
import { TrialNoticeDialog } from "@/components/billing/trial-notice-dialog";
import type { TrialNoticeData } from "@/lib/billing/trial-notice";

/**
 * The authenticated application shell: a top app bar, a content region, and the
 * primary navigation. Chrome only — it holds no data access. Later pitches
 * render their surfaces inside the content region and extend nav-items.ts.
 *
 * Phones (below md): a sticky header with the menu button that opens the
 * navigation sheet; nothing is pinned to the bottom except a screen's own
 * thumb-reach action bar. md+: the left sidebar and a static header. Since
 * OVE-119 there is no ⋮ account menu: Settings, Plan & Billing, What's New,
 * feedback, Admin, and Sign out all live in the sidebar and the sheet.
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
  trialNotice = null,
  isAdmin = false,
  account,
  children,
}: {
  appearance: Appearance;
  tourAutoStart: boolean;
  whatsNew: WhatsNewDialogData | null;
  /** Trial notices (OVE-112): the one-time trial notice due, or null. */
  trialNotice?: TrialNoticeData | null;
  /** Server-resolved (admin allowlist): show the Admin navigation item. */
  isAdmin?: boolean;
  /** The signed-in account's own name, username, and email (OVE-119). */
  account: ShellAccount;
  children: ReactNode;
}) {
  return (
    <TourProvider autoStart={tourAutoStart}>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <AppearanceSync appearance={appearance} />
        {/* Left rail at md+; renders nothing below md. */}
        <AppNav account={account} isAdmin={isAdmin} />

        <div className="flex min-h-dvh flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur md:static md:z-auto md:h-auto md:gap-0 md:bg-transparent md:px-4 md:py-3 md:backdrop-blur-none">
            <MobileNav account={account} isAdmin={isAdmin} />
            <OverloadLockup size="sm" />
          </header>

          {/* A page that needs room (the plan-import review) renders an element with
              data-wide-page; :has() widens the region for that page only. Every
              other page keeps the phone-width column. */}
          <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6 has-[[data-wide-page]]:max-w-screen-2xl">
            {children}
          </main>
        </div>

        {/* One toaster for the whole authenticated app (archive/undo, saves). */}
        <Toaster theme={appearance} />
        <WhatsNewDialog data={whatsNew} />
        <TrialNoticeDialog data={trialNotice} />
      </div>
    </TourProvider>
  );
}
