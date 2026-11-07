import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bespoke marketing compositions in Overload's real UI language: the quiet,
 * precise instrument, recomposed for the landing page. Every number is demo
 * data in lbs, and every claim matches real product behavior — a progress call
 * names the weight to try and its reason, and Overload never changes the plan.
 * Pure server components; no data access.
 */

/** A small numbered editorial label with a short accent rule. */
export function Eyebrow({
  index,
  children,
}: {
  index: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
      <span className="tabular-nums text-primary">{index}</span>
      <span aria-hidden className="h-px w-6 bg-border" />
      <span>{children}</span>
    </div>
  );
}

/** The progress / deload tag, the only colored product element besides accent. */
export function Tag({ kind }: { kind: "progress" | "deload" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        kind === "progress"
          ? "border-progress/30 bg-progress/10 text-progress"
          : "border-deload/30 bg-deload/10 text-deload",
      )}
    >
      {kind === "progress" ? "Progress" : "Deload"}
    </span>
  );
}

/**
 * The progression call, distilled to a single compact hero accent: the lift,
 * the verdict, the weight to try, and the one-line reason — the Pro feature's
 * whole argument, legible at a glance. It is a deliberate editorial overlay for
 * the hero photograph, not a reproduction of the product screen (the real Today
 * capture carries that below the fold). Translucent and blurred so it reads as
 * glass laid over the photo without blacking it out. Marketing copy only; the
 * engine owns its own sentences (invariant R4), so this paraphrases them.
 */
export function CallCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border bg-card/90 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur-md supports-[backdrop-filter]:bg-card/75",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Barbell Bench Press
        </p>
        <Tag kind="progress" />
      </div>
      <div className="mt-3 flex items-baseline gap-2.5 tabular-nums">
        <span className="text-2xl font-semibold text-muted-foreground">
          180
        </span>
        <ArrowRight
          aria-hidden
          className="size-5 shrink-0 translate-y-0.5 text-primary"
        />
        <span className="text-3xl font-semibold tracking-tight">185 lb</span>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Top of the 6–8 range, two sessions in a row.
      </p>
    </div>
  );
}

/** The previous-session context that sits on the logging card. */
export function LastTimeChip() {
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span className="text-muted-foreground">Last time · Oct 28</span>
      <span aria-hidden className="text-border">
        |
      </span>
      <span className="font-medium tabular-nums">180 × 8, 8, 8</span>
    </div>
  );
}

/**
 * One gym's working weight for the same machine, sized to be read across the
 * room. Both gyms render with identical styling and the same accent dot, so
 * the pair reads as two independent baselines — never as a before/after or a
 * ranking. The subtle hover lift matches the rest of the page's raised
 * surfaces; it carries no state and needs no keyboard target.
 */
export function GymWorkingWeight({
  gym,
  weight,
  className,
}: {
  gym: string;
  weight: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background/70 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:ring-1 hover:ring-primary/15 md:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-primary/70" />
        <p className="text-sm font-medium">{gym}</p>
      </div>
      <p className="mt-4 flex items-baseline gap-1.5 tabular-nums">
        <span className="text-5xl font-semibold tracking-tight md:text-6xl">
          {weight}
        </span>
        <span className="text-base font-medium text-muted-foreground">lb</span>
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Working weight
      </p>
    </div>
  );
}

/** A large, faint background wordmark for editorial depth. Decorative only. */
export function GhostWord({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none select-none font-semibold uppercase leading-none tracking-tight text-foreground/[0.04]",
        className,
      )}
    >
      {children}
    </span>
  );
}
