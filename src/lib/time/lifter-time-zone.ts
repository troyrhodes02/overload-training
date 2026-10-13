import "server-only";
import { cookies } from "next/headers";
import { isValidTimeZone, todayIso } from "@/lib/plan/calendar";
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE } from "./time-zone";

/**
 * The lifter's IANA time zone for this request, from the cookie the browser
 * island sets (src/components/shell/time-zone-sync.tsx). Anything missing or
 * invalid — or no request at all (integration tests, CLI scripts) — falls
 * back to UTC, the previous behavior.
 */
export async function lifterTimeZone(): Promise<string> {
  try {
    const raw = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
    const value = raw ? decodeURIComponent(raw) : undefined;
    if (isValidTimeZone(value)) return value;
  } catch {
    // Outside a request scope: no cookie to read.
  }
  return DEFAULT_TIME_ZONE;
}

/** Today's calendar date ("YYYY-MM-DD") in the lifter's time zone. */
export async function lifterToday(): Promise<string> {
  return todayIso(await lifterTimeZone());
}
