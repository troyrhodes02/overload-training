import { useSyncExternalStore } from "react";

/**
 * The one line the signed-out Welcome shows after a deletion (Pitch 21j
 * design §6 A9): "Your account was deleted." It names no account and holds
 * no account data, so unlike the account's own notices it outlives sign-out;
 * it is cleared when shown and on the next sign-in.
 */
let message: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const ACCOUNT_DELETED_NOTICE = "Your account was deleted.";

export function setSignedOutNotice(text: string | null): void {
  message = text;
  emit();
}

export function useSignedOutNotice(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => message,
  );
}
