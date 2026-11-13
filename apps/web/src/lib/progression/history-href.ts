/**
 * Where an exercise's history lives (a web route, so it stayed in the web when
 * history-format.ts moved to the shared package in Pitch 21b). A machine or cable opens on the scope it
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
