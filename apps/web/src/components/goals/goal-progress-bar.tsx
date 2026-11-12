/**
 * Decorative goal progress bar (design doc §4). Accent fill on a muted track —
 * never the progress-tag green. `aria-hidden`: the percentage text beside it is
 * the accessible value. Only rendered for a measured goal; an unmeasured goal
 * shows "No performance recorded yet" instead of an empty bar (R23).
 */
export function GoalProgressBar({ percent }: { percent: number }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div
      aria-hidden
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
