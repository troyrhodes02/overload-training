import { isValidTimeZone } from "@overload/shared/plan/calendar";
import { useMe } from "../api/queries";

/**
 * The account's time zone for "today" (CLAUDE.md, "Today is per account"):
 * the stored profile zone from `me`. The tabs render only once `me` has
 * loaded (the gate), so the device zone is a defensive fallback only.
 */
export function useAccountTimeZone(): string {
  const zone = useMe(true).data?.profile.timeZone;
  if (zone && isValidTimeZone(zone)) return zone;
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(device) ? device : "UTC";
}
