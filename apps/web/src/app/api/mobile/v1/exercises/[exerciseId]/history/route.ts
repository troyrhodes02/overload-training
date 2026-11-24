import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readExerciseHistory } from "@/lib/api/mobile/goals";

/**
 * GET /api/mobile/v1/exercises/{exerciseId}/history?scope=&sessions=all
 * (Pitch 21i spec §6 E8): the exercise's history as the web page reads it —
 * every logged session, the records, the trend points, "Next time", and the
 * goals on the lift — through the GATED reader: a Free account gets the
 * plain history with every Pro field withheld and `locked` set. Read-only.
 */
export const GET = mobileRoute<{ exerciseId: string }>(
  async ({ account, request }, { exerciseId }) =>
    apiJson(
      await readExerciseHistory(
        account,
        exerciseId,
        new URL(request.url).searchParams,
      ),
    ),
);
