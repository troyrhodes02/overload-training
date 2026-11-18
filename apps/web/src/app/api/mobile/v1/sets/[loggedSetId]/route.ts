import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { WORKOUT_BODY_LIMIT } from "@/lib/api/mobile/workouts";
import { editSetFromRequest } from "@/lib/api/mobile/logging";

/**
 * PATCH /api/mobile/v1/sets/{loggedSetId} (Pitch 21f spec §6 E12): correct a
 * logged set's weight, reps, and RIR through the web's write path
 * (logged-sets.ts), then reconcile goals after commit. Values only: the set
 * keeps its id, exercise, gym, number, and date, and no gym baseline is
 * replayed. Allowed in a finished workout too. The same correction twice
 * stores the same values.
 */
export const PATCH = mobileRoute<{ loggedSetId: string }>(
  async ({ account, request }, { loggedSetId }) => {
    const body = await readJsonObject(request, WORKOUT_BODY_LIMIT);
    return apiJson(await editSetFromRequest(account, loggedSetId, body));
  },
);
