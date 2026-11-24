import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readThisWeek } from "@/lib/api/mobile/schedule";

/**
 * GET /api/mobile/v1/this-week (OVE-241 S1): the current block week for
 * Today's week strip — the same effective schedule Today, History, and the
 * web's strip read — with which of this week's changes each workout allows.
 * `{ week: null }` with no active block week. Free.
 */
export const GET = mobileRoute(async ({ account }) =>
  apiJson(await readThisWeek(account)),
);
