import { Chip } from "../ui/Surface";
import type { InsightChip } from "../workout/insight-model";

/**
 * The call's word chip (Pitch 21g, the web's ProgressTag): Progress, Deload,
 * or "Hold — trend flat". A hold renders nothing (RD-4). Words always carry
 * the meaning; the color only reinforces it.
 */
export function ProgressChip({ chip }: { chip: InsightChip | null }) {
  if (!chip) return null;
  return <Chip label={chip.label} tone={chip.tone} />;
}
