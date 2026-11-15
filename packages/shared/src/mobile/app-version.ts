/**
 * The app version rule both sides use (Pitch 21d review audit): the API's
 * version gate (apps/web/src/lib/api/mobile/version.ts) and the app's gate
 * (apps/mobile/src/app-state/gate.ts) parse and compare MAJOR.MINOR.PATCH the
 * same way, so they can never disagree about whether an app is too old.
 */
export type AppVersion = readonly [number, number, number];

const MAX_PART = 999_999;
// Canonical non-negative integers only: no leading zeros, sign, or suffix.
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

/** Strict MAJOR.MINOR.PATCH, or null. */
export function parseAppVersion(
  raw: string | null | undefined,
): AppVersion | null {
  if (typeof raw !== "string") return null;
  const m = VERSION.exec(raw.trim());
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
  return parts.every((p) => p <= MAX_PART) ? parts : null;
}

export function compareAppVersions(a: AppVersion, b: AppVersion): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function formatAppVersion(v: AppVersion): string {
  return v.join(".");
}
