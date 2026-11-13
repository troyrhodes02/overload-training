import type { PlannedCardioDto } from "@/lib/plan/queries";

/**
 * "CARDIO  Incline Walk · 20 min" — the planned-cardio line's content, shared
 * by the editable line (cardio-controls) and the read-only archived line
 * (week-list), so the two can't drift apart.
 */
export function CardioLineContent({ cardio }: { cardio: PlannedCardioDto }) {
  return (
    <>
      <span className="text-xs tracking-wide text-muted-foreground uppercase">
        Cardio
      </span>
      <span className="min-w-0 flex-1 truncate tabular-nums">
        {cardio.type} · {cardio.durationMin} min
      </span>
    </>
  );
}
