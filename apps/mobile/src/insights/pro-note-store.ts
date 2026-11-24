import { useSyncExternalStore } from "react";

/**
 * Which Pro notes the lifter dismissed in THIS run of the app (Pitch 21g
 * RD-12). Kept in memory only: the phone has no preference store, and the
 * note is presentation, never the enforcement (the server already withheld
 * the call). It returns on the next launch, which keeps it rare and quiet.
 */
export type ProNoteSurface =
  "exercise-card" | "summary" | "today-plan" | "exercise-history";

let dismissed = new Set<ProNoteSurface>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dismissProNote(surface: ProNoteSurface): void {
  if (dismissed.has(surface)) return;
  dismissed = new Set(dismissed).add(surface);
  listeners.forEach((l) => l());
}

export function useProNoteDismissed(surface: ProNoteSurface): boolean {
  return useSyncExternalStore(subscribe, () => dismissed.has(surface));
}

/** Forget every dismissal: on sign-out (clearAccountQueries) and in tests. */
export function resetProNotes(): void {
  dismissed = new Set();
  listeners.forEach((l) => l());
}
