import { Check, ChevronDown, Minus } from "lucide-react";
import { MAX_DAYS, MAX_EXERCISES_PER_DAY } from "@/lib/import/constants";
import { cn } from "@/lib/utils";

/**
 * Workout Plan Import & Review (Pitch 22) — the quiet guidance around the source
 * intake: how many imports are left today (a usage meter, like a billing usage
 * bar), and a collapsed "how to format your plan" guide with an example.
 * Presentational only: the server enforces every limit shown here.
 */

export type ImportUsageView = { used: number; limit: number };

/** "3 of 5 left today" with a thin bar. Compact enough for the action bar. */
export function UsageMeter({
  usage,
  className,
}: {
  usage: ImportUsageView;
  className?: string;
}) {
  const left = Math.max(0, usage.limit - usage.used);
  const pct = Math.min(100, (usage.used / usage.limit) * 100);
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium">
          {left === 0 ? (
            "No imports left today"
          ) : (
            <>
              <span className="tabular-nums">{left}</span> of{" "}
              <span className="tabular-nums">{usage.limit}</span> imports left
              today
            </>
          )}
        </span>
        <span className="shrink-0 text-muted-foreground">
          Resets at midnight
        </span>
      </div>
      <div
        aria-hidden
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
            left === 0 ? "bg-muted-foreground" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** The sentence under "Try again": what a retry costs. */
export function retryCostLine(usage: ImportUsageView | null): string | null {
  if (!usage) return null;
  const left = Math.max(0, usage.limit - usage.used);
  if (left === 0) return "You've used today's imports. They reset at midnight.";
  return `Trying again uses one of today's imports (${left} left).`;
}

const INCLUDE = [
  "Each day's name, like Push Day or Monday",
  "One exercise per line",
  "Sets and reps, or a rep range",
  "Rest, RIR, or a short note, if you use them",
];

const LEAVE_OUT = [
  "Cardio, warm-ups, and mobility. Add cardio to your plan after.",
  "Alternates like “A or B”. Only the first one is kept.",
  "Long coaching notes and explanations",
];

const EXAMPLE = `Push Day
Barbell Bench Press: 3 x 5-8, 3 min rest
Incline Dumbbell Press: 3 x 8-10
Cable Lateral Raise: 3 x 12-15
Triceps Pushdown: 2 x 10-12, 0-1 RIR

Pull Day
Lat Pulldown: 3 x 8-12
Seated Cable Row: 3 x 8-12
Hammer Curl: 2 x 10-12`;

/** A collapsed guide; opening it never moves the input below out of reach. */
export function ImportGuide() {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        How to format your plan
        <span className="ml-auto hidden text-xs font-normal text-muted-foreground sm:inline">
          Up to {MAX_DAYS} days, {MAX_EXERCISES_PER_DAY} exercises a day
        </span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform sm:ml-0 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <GuideList title="Include" items={INCLUDE} icon="check" />
          <GuideList title="Leave out" items={LEAVE_OUT} icon="minus" />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Example</p>
          <pre className="rounded-md bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {EXAMPLE}
          </pre>
        </div>
        <p className="text-xs text-muted-foreground">
          Long plans are fine in one import: up to {MAX_DAYS} days and{" "}
          {MAX_EXERCISES_PER_DAY} exercises a day. The format doesn&apos;t need
          to match exactly, and you review everything before anything is saved.
        </p>
      </div>
    </details>
  );
}

function GuideList({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: "check" | "minus";
}) {
  const Icon = icon === "check" ? Check : Minus;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 size-4 shrink-0",
                icon === "check" ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
