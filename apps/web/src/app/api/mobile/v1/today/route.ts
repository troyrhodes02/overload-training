import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { apiJson } from "@/lib/api/mobile/errors";
import { getTodayView } from "@/lib/views/today";
import { wantsCoreFields } from "@/lib/api/mobile/workouts";

/**
 * GET /api/mobile/v1/today — the Today screen (Pitch 21c spec §9.2), built by
 * the same function the web's Today page renders from. Pro calls come only
 * from the gated readers inside it: a Free account gets `locked` and null Pro
 * fields. Its only writes are the web's own: last-active (in the pipeline) and
 * the conditional goal completion when the dashboard shows goals.
 */
export const GET = mobileRoute(async ({ account, request }) =>
  apiJson(await getTodayView(account, { core: wantsCoreFields(request) })),
);
