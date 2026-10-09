import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  readinessIssueHref,
  readinessIssueMessage,
  type ReadinessIssue,
} from "@/lib/plan/readiness";
import type { MesocycleStatusValue } from "@/lib/plan/queries";
import { cn } from "@/lib/utils";

/** Draft / Active / Archived — text badges, never color alone. */
export function MesocycleStatusBadge({
  status,
}: {
  status: MesocycleStatusValue;
}) {
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "draft") return <Badge variant="secondary">Draft</Badge>;
  return <Badge variant="outline">Archived</Badge>;
}

/**
 * The thumb-reach action bar: fixed above the bottom nav on phones, inline at
 * md+. Pages that use it add bottom padding so content clears it.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <div className="mx-auto w-full max-w-screen-sm md:max-w-none">
        {children}
      </div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      ‹ {label}
    </Link>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-medium text-muted-foreground">
      {children}
    </h2>
  );
}

/**
 * What stands between this plan and activation (draft), or what needs fixing
 * in the live plan (active, informational). Each row links to its fix.
 */
export function ReadinessPanel({
  mesocycleId,
  status,
  issues,
}: {
  mesocycleId: string;
  status: MesocycleStatusValue;
  issues: ReadinessIssue[];
}) {
  if (status === "archived") return null;
  if (issues.length === 0) {
    if (status === "active") return null;
    return (
      <p className="flex items-center gap-2 text-sm">
        <CircleCheck aria-hidden className="size-4 text-primary" />
        Ready to activate.
      </p>
    );
  }
  return (
    <Alert>
      <div className="space-y-1">
        <p className="mb-1 leading-none font-medium tracking-tight">
          {status === "draft" ? "Before you can activate" : "Needs attention"}
        </p>
        {status === "active" && (
          <p className="text-sm">This plan stays active.</p>
        )}
        <ul className="-mx-1 divide-y divide-border">
          {issues.map((issue, i) => (
            <li key={`${issue.code}-${i}`}>
              <Link
                href={readinessIssueHref(mesocycleId, issue)}
                className="flex min-h-11 items-center gap-2 rounded-sm px-1 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex-1">{readinessIssueMessage(issue)}</span>
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Alert>
  );
}

export function MetaLine({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground tabular-nums", className)}>
      {children}
    </p>
  );
}
