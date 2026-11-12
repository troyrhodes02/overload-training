import { TriangleAlert } from "lucide-react";
import type { ProgressionTag } from "@/lib/progression/types";

/**
 * The computed progression tag (design §ProgressTag; spec §7). The single shared
 * tag used on the dashboard, logging card, session summary, and progression
 * detail — History and Goals reuse it later.
 *
 * It renders NOTHING for Hold, insufficient history, or scheduled-deload
 * suppression: the caller passes `null` and the row stays quiet (R7, R53). The
 * stalled state borrows the deload amber but never the word "Deload" — it reads
 * "Hold — trend flat" with an attention icon (R25), always distinguishable from
 * a reactive Deload by text and icon, not colour alone.
 */
export function ProgressTag({ state }: { state: ProgressionTag | null }) {
  if (state === "progress") {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-progress/10 px-2 py-0.5 text-xs font-medium text-progress">
        Progress
      </span>
    );
  }
  if (state === "deload") {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-deload/10 px-2 py-0.5 text-xs font-medium text-deload">
        Deload
      </span>
    );
  }
  if (state === "stalled") {
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-deload/10 px-2 py-0.5 text-xs font-medium text-deload">
        <TriangleAlert aria-hidden className="size-3" />
        Hold — trend flat
      </span>
    );
  }
  return null; // Hold / insufficient / scheduled-deload suppression
}
