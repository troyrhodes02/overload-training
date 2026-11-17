import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readWorkout, wantsCoreFields } from "@/lib/api/mobile/workouts";

/**
 * GET /api/mobile/v1/workouts/{loggedSessionId} (Pitch 21e spec §6 E2): the
 * workout runner from the web's getWorkoutView. Each card carries the
 * server's weight context (Prescription-Aware Intelligence); the per-card
 * calls come only from the gated reader (`locked` on a Free account).
 * Another account's workout is a 404, exactly like a missing one.
 */
export const GET = mobileRoute<{ loggedSessionId: string }>(
  async ({ account, request }, { loggedSessionId }) =>
    apiJson(
      await readWorkout(account, loggedSessionId, {
        core: wantsCoreFields(request),
      }),
    ),
);
