import type { ReactNode } from "react";
import { OverloadLockup } from "@/components/brand/overload-lockup";

/**
 * The frame every unauthenticated screen shares (Accounts design doc §4):
 * the wordmark, one bordered card, and an optional quiet line beneath it.
 * No shell, no navigation, nothing else.
 */
export function AuthCard({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <p className="flex justify-center">
          <OverloadLockup size="lg" />
        </p>
        <div className="space-y-4 rounded-lg border border-border bg-card p-6">
          {children}
        </div>
        {footer ? (
          <p className="-mt-4 text-center text-sm text-muted-foreground">
            {footer}
          </p>
        ) : null}
      </div>
    </main>
  );
}
