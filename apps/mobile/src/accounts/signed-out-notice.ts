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

/**
 * A half-closed account (Pitch 21j review #1): the data is deleted but the
 * sign-in still exists. The app can't finish that (it never recreates a
 * profile); the website can, through its own delete page.
 */
export const FINISH_ON_WEB_NOTICE =
  "Your training data was deleted, but closing your sign-in didn't finish. To finish, sign in on the Overload website and delete your account there.";

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
