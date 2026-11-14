import { isValidTimeZone } from "@overload/shared/plan/calendar";

/**
 * The account's time zone for "today" (CLAUDE.md "Today is per account").
 * OVE-184: the device zone until the account's `me` is wired (OVE-185).
 */
export function useAccountTimeZone(): string {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(device) ? device : "UTC";
}
