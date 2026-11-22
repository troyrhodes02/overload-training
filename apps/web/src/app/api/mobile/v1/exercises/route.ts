import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readExercises } from "@/lib/api/mobile/resources";

/**
 * GET /api/mobile/v1/exercises?view=&muscle=&q=&limit= (Pitch 21h spec §6
 * E3): the shared library plus the account's own exercises, archived ones
 * left out, filtered exactly as the web's library page filters them. Free.
 */
export const GET = mobileRoute(async ({ account, request }) =>
  apiJson(await readExercises(account, new URL(request.url).searchParams)),
);
