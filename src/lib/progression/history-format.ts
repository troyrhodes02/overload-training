/**
 * How the exercise history prints a session's sets (Exercise History & PR
 * Intelligence spec §13). Pure and client-safe. Every figure is the logged
 * value as it stands: nothing is rounded except float noise, nothing is
 * inferred (an unrecorded RIR is "–", never 0), and a reps-only set never
 * shows a load.
 */
import { formatRir } from "@/lib/logging/rir";

type PrintedSet = { weightLbs: number | null; reps: number };

/** A load without float noise: 185 → "185", 102.5 → "102.5". */
export function formatLoad(lbs: number): string {
  return String(Math.round(lbs * 100) / 100);
}

function groupByLoad(sets: PrintedSet[]): string {
  if (sets.length === 0) return "";
  const first = sets[0].weightLbs;
  if (first !== null && sets.every((s) => s.weightLbs === first)) {
    return `${formatLoad(first)} × ${sets.map((s) => s.reps).join(" · ")}`;
  }
  return sets
    .map((s) =>
      s.weightLbs === null
        ? String(s.reps)
        : `${formatLoad(s.weightLbs)} × ${s.reps}`,
    )
    .join(" · ");
}

/**
 * One session's sets: `185 × 10 · 10 · 9` when every working set used the
 * same load, `185 × 8 · 190 × 7` when it changed, extra sets after ` + `.
 * Reps-only lifts: `20 · 20 reps` (`20 · 20 + 15 reps` with an extra set).
 */
export function formatSetLine(
  row: { workingSets: PrintedSet[]; extraSets: PrintedSet[] },
  externalLoad: boolean,
): string {
  if (!externalLoad) {
    const reps = (sets: PrintedSet[]) => sets.map((s) => s.reps).join(" · ");
    const main = reps(row.workingSets);
    const extra = row.extraSets.length ? reps(row.extraSets) : "";
    return `${[main, extra].filter(Boolean).join(" + ")} reps`;
  }
  const main = groupByLoad(row.workingSets);
  const extra = groupByLoad(row.extraSets);
  return [main, extra].filter(Boolean).join(" + ");
}

/** `RIR 2 · 1 · –` for the working sets, or null when none was recorded. */
export function formatRirLine(
  workingSets: { rir: number | null }[],
): string | null {
  if (!workingSets.some((s) => s.rir !== null)) return null;
  return `RIR ${workingSets.map((s) => (s.rir === null ? "–" : formatRir(s.rir))).join(" · ")}`;
}

/**
 * Where an exercise's history lives. A machine or cable opens on the scope it
 * was trained in — its gym, or the legacy "no gym recorded" rows (`none`) —
 * because its history is kept per gym (Exercise History & PR Intelligence
 * R5); anything else has one history and needs no scope.
 */
export function exerciseHistoryHref(
  exerciseId: string,
  machine: { gymId: string | null } | null = null,
): string {
  if (!machine) return `/exercises/${exerciseId}`;
  return `/exercises/${exerciseId}?gym=${machine.gymId ?? "none"}`;
}
