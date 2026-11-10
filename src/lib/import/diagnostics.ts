/**
 * Workout Plan Import & Review — the ONE place the import pipeline writes a
 * server log line. The import modules themselves never call console.* (the
 * privacy guard in tests/unit/import-privacy.test.ts); they call this, whose
 * signature can only carry closed, non-content values: an event name, a failure
 * code from the port's taxonomy, a provider stop reason from a fixed list, and
 * numbers. There is no string field a prompt, source text, response body,
 * filename, or id could travel in.
 */
import type { ExtractionErrorCode } from "./extraction/port";

const STOP_REASONS = new Set([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "refusal",
]);

export type ExtractionDiagnostic = {
  event: "extraction_failed" | "draft_build_failed";
  code?: ExtractionErrorCode;
  stopReason?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  elapsedMs?: number;
};

export function formatDiagnostic(d: ExtractionDiagnostic): string {
  const stop =
    d.stopReason && STOP_REASONS.has(d.stopReason) ? d.stopReason : "none";
  const num = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) ? String(Math.trunc(n)) : "?";
  return (
    `plan-import: ${d.event} code=${d.code ?? "none"} stop=${stop} ` +
    `in=${num(d.inputTokens)} out=${num(d.outputTokens)} ms=${num(d.elapsedMs)}`
  );
}

export function logDiagnostic(d: ExtractionDiagnostic): void {
  console.error(formatDiagnostic(d));
}
