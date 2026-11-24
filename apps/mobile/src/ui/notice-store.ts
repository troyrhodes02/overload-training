import { useSyncExternalStore } from "react";

/**
 * The "Added X." line a create modal leaves for the list it returns to
 * (Pitch 21h design L1, G1): an inline banner, never a toast. In memory only,
 * one per list, and cleared on sign-out with the rest of the account's state.
 */
export type NoticeScope = "exercises" | "gyms" | "goals" | "exercise-history";
export type Notice = { message: string; viewHref?: string };

let notices: Partial<Record<NoticeScope, Notice>> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNotice(scope: NoticeScope, notice: Notice): void {
  notices = { ...notices, [scope]: notice };
  emit();
}

export function clearNotice(scope: NoticeScope): void {
  if (!notices[scope]) return;
  notices = { ...notices, [scope]: undefined };
  emit();
}

export function useNotice(scope: NoticeScope): Notice | null {
  return useSyncExternalStore(subscribe, () => notices[scope] ?? null);
}

/** Forget every notice: on sign-out (clearAccountQueries) and in tests. */
export function resetNotices(): void {
  notices = {};
  emit();
}
