import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readSwapCandidates } from "@/lib/api/mobile/logging";

/**
 * GET /api/mobile/v1/logged-exercises/{loggedExerciseId}/swap-candidates
 * (Pitch 21f spec §6 E9): the swap picker's list. `?muscle=` names any muscle
 * group; without it, or with an unknown value, the planned exercise's group is
 * listed. Only the shared library and the account's own exercises appear.
 */
export const GET = mobileRoute<{ loggedExerciseId: string }>(
  async ({ account, request }, { loggedExerciseId }) =>
    apiJson(
      await readSwapCandidates(
        account,
        loggedExerciseId,
        new URL(request.url).searchParams.get("muscle"),
      ),
    ),
);
