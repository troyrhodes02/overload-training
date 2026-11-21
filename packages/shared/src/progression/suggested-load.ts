/**
 * The suggested load as Today's planned list prints it ("Try 185 lb (+5)",
 * "Try 160 lb (90%)"), shared by the web and the iPhone (Pitch 21g OVE-230).
 * Display only: the number is the server's gated suggestion; null → nothing.
 */
import { formatWeightLbs } from "../logging/weight";
import type { SuggestedLoadDto } from "./types";

export function suggestedLoadLabel(
  suggestion: SuggestedLoadDto,
): string | null {
  if (!suggestion) return null;
  const note = suggestion.kind === "progress_increment" ? "+5" : "90%";
  return `Try ${formatWeightLbs(suggestion.lbs)} lb (${note})`;
}
