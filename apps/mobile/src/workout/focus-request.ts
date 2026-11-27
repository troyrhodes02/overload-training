/**
 * Which card a workout should show next (Pitch 25 review #1). The Add
 * exercise picker is a modal over the workout; when the server answers with
 * the card (added, restored, or already there), the picker asks the workout
 * to show that card, then closes. One request per workout, consumed once.
 * In memory only: nothing about a workout is stored on the device.
 */
const requests = new Map<string, string>();
const listeners = new Set<() => void>();

export function requestCardFocus(
  loggedSessionId: string,
  loggedExerciseId: string,
): void {
  requests.set(loggedSessionId, loggedExerciseId);
  for (const l of listeners) l();
}

export function peekCardFocus(loggedSessionId: string): string | null {
  return requests.get(loggedSessionId) ?? null;
}

export function clearCardFocus(loggedSessionId: string): void {
  if (requests.delete(loggedSessionId)) for (const l of listeners) l();
}

export function subscribeCardFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
