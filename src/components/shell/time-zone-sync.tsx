"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isValidTimeZone } from "@/lib/plan/calendar";
import {
  TIME_ZONE_COOKIE,
  TIME_ZONE_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/time/time-zone";

/**
 * Keeps the server's idea of "today" in the lifter's own time zone: stores
 * the browser's IANA zone in a cookie and, when it was missing or changed
 * (first visit, travel), re-renders once so the page uses it. Renders nothing.
 */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isValidTimeZone(zone)) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie =
      `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; ` +
      `max-age=${TIME_ZONE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
