import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readHistoryWeek } from "@/lib/api/mobile/workouts";

/**
 * GET /api/mobile/v1/history?week=YYYY-MM-DD (Pitch 21e spec §6 E5): one
 * week of all-time history from the web's getHistoryWeek, which reads one
 * week per request and bounds navigation by the first logged day. With no
 * `week` (or one it can't use) it answers this week, as the web page does.
 */
export const GET = mobileRoute(async ({ account, request }) => {
  const week = new URL(request.url).searchParams.get("week");
  return apiJson(await readHistoryWeek(account, week));
});
