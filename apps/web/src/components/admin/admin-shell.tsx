import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { OverloadLockup } from "@/components/brand/overload-lockup";
import { AccountMenu } from "@/components/shell/account-menu";
import { AppearanceSync } from "@/components/shell/appearance-sync";
import { Toaster } from "@/components/ui/sonner";
import type { Appearance } from "@/lib/appearance/appearance";
import { AdminNav } from "./admin-nav";

/**
 * The admin area's own frame (Admin Center & Feedback design doc Screen 2;
 * spec R25): the wordmark plus "Admin", the sub-navigation, a way back to the
 * lifter app, and the same ⋮ menu — a wider column than the lifter shell, and
 * no lifter rail, tour, or What's New. Chrome only; it holds no data access.
 */
export function AdminShell({
  appearance,
  children,
}: {
  appearance: Appearance;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppearanceSync appearance={appearance} />
      <header className="border-b border-border px-4 py-2">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2">
            <OverloadLockup size="sm" />
            <span className="text-sm font-medium text-muted-foreground">
              Admin
            </span>
          </Link>
          <AdminNav className="ml-4 hidden md:block" />
          <div className="ml-auto">
            <AccountMenu isAdmin />
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-4xl px-4 pt-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Back to Overload
        </Link>
        <AdminNav className="mt-2 border-b border-border pb-2 md:hidden" />
      </div>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {children}
      </main>
      <Toaster theme={appearance} />
    </div>
  );
}
