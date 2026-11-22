import { useMemo } from "react";

/**
 * Retry-safe creates (Pitch 21h RD-21; the server's 21c mechanism). One save
 * intent is one key: the same values resent after a timeout or a failed
 * connection carry the same key, so the server answers with the first result
 * instead of making a second row. Changing the values starts a new intent.
 * The server accepts 8 to 255 of [A-Za-z0-9._:-].
 */
export function newIdempotencyKey(
  now: number = Date.now(),
  random: () => number = Math.random,
): string {
  let tail = "";
  while (tail.length < 16) tail += random().toString(36).slice(2);
  return `ovl-${now.toString(36)}-${tail.slice(0, 16)}`;
}

/** A key that stays the same while `values` serialize the same. */
export function useIntentKey(values: unknown): string {
  const serialized = JSON.stringify(values);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => newIdempotencyKey(), [serialized]);
}
