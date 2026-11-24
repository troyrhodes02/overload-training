import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readGoalForm } from "@/lib/api/mobile/goals";

/**
 * GET /api/mobile/v1/exercises/{exerciseId}/goal-form?gymId= (Pitch 21i spec
 * §6 E7): what the goal form needs for one exercise, or why it can't take a
 * goal — the web's own form context, after the web's completion check. A
 * missing exercise (or another account's) is `kind: "not_found"`, as on the
 * web. Free.
 */
export const GET = mobileRoute<{ exerciseId: string }>(
  async ({ account, request }, { exerciseId }) =>
    apiJson(
      await readGoalForm(
        account,
        exerciseId,
        new URL(request.url).searchParams,
      ),
    ),
);
