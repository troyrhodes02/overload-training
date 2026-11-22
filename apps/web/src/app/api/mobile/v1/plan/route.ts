import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readPlan } from "@/lib/api/mobile/resources";

/**
 * GET /api/mobile/v1/plan?week=n (Pitch 21h spec §6 E1): the account's active
 * block (or none), its position in the account's today, its deload weeks, its
 * authored template, and one dated week of the effective schedule. `week` out
 * of range is clamped; anything else is today's week. Read-only and Free.
 */
export const GET = mobileRoute(async ({ account, request }) =>
  apiJson(
    await readPlan(account, new URL(request.url).searchParams.get("week")),
  ),
);
