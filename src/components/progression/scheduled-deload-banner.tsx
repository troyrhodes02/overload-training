/**
 * The scheduled-deload week banner (design §2 "Two deloads, two voices"; spec §7).
 * A quiet, mesocycle-wide note that this week is planned recovery at 90% load —
 * deliberately distinct from a reactive per-exercise Deload tag, and it never
 * appears alongside reactive tags (they are suppressed this week, R37).
 */
export function ScheduledDeloadBanner() {
  return (
    <div className="rounded-md bg-muted px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground">
      Deload week · 90% load across the split
    </div>
  );
}
