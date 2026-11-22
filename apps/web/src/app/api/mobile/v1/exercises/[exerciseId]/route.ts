import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readExercise } from "@/lib/api/mobile/resources";

/**
 * GET /api/mobile/v1/exercises/{exerciseId} (Pitch 21h spec §6 E4): one
 * exercise's name, classification, image, favorite state, and whether it is
 * the account's own — archived ones included. No history: that is 21i. Free.
 */
export const GET = mobileRoute<{ exerciseId: string }>(
  async ({ account }, { exerciseId }) =>
    apiJson(await readExercise(account, exerciseId)),
);
