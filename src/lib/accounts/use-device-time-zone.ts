import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The browser's IANA timezone, or null (on the server render and when the
 * browser gives none) — so hydration always matches. Used by signup (captured
 * silently) and Settings (the device-mismatch hint). One copy, one fallback.
 */
export function useDeviceTimeZone(): string | null {
  return useSyncExternalStore(noSubscribe, deviceTimeZone, () => null);
}
