import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  createExerciseFromRequest,
  readExercises,
} from "@/lib/api/mobile/resources";

/**
 * GET /api/mobile/v1/exercises?view=&muscle=&q=&limit= (Pitch 21h spec §6
 * E3): the shared library plus the account's own exercises, archived ones
 * left out, filtered exactly as the web's library page filters them. Free.
 */
export const GET = mobileRoute(async ({ account, request }) =>
  apiJson(await readExercises(account, new URL(request.url).searchParams)),
);

/**
 * POST /api/mobile/v1/exercises (Pitch 21h spec §6 E5), with an
 * `Idempotency-Key`: add a custom exercise (name, primary muscle, equipment,
 * secondary muscles; no image) with the web's rules. A retry with the same
 * key and body answers with the first result; the same key with another body
 * is a 409. Free.
 */
export const POST = mobileRoute(async ({ account, request }) =>
  createExerciseFromRequest(account, request),
);
