import type { SuggestedLoadDto } from "@overload/shared/progression/types";
import { suggestedLoadLabel } from "@overload/shared/progression/suggested-load";

/**
 * The display-only suggested working load (spec §7; design §SuggestedLoad). A
 * `+5` hint on a Progress call, or the 90% scheduled-deload load. It is advice,
 * never applied; it never pre-fills set entry. Renders nothing when there is no
 * working-weight context (R31, R36, R28).
 */
export function SuggestedLoad({
  suggestion,
}: {
  suggestion: SuggestedLoadDto;
}) {
  const label = suggestedLoadLabel(suggestion);
  if (!label) return null;
  return (
    <span className="text-sm tabular-nums text-muted-foreground">{label}</span>
  );
}
