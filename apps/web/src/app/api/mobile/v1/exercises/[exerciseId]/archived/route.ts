import { readJsonObject } from "@/lib/api/mobile/body";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import {
  RESOURCE_BODY_LIMIT,
  setExerciseArchivedFromRequest,
} from "@/lib/api/mobile/resources";

/**
 * PUT /api/mobile/v1/exercises/{exerciseId}/archived (Pitch 21h spec §6 E7):
 * `{ archived: true }` archives the account's own custom exercise (it leaves
 * the library and the pickers; history and plans keep it); `false` is the
 * Undo. Library exercises are never archivable (404). Free.
 */
export const PUT = mobileRoute<{ exerciseId: string }>(
  async ({ account, request }, { exerciseId }) => {
    const body = await readJsonObject(request, RESOURCE_BODY_LIMIT);
    return apiJson(
      await setExerciseArchivedFromRequest(account, exerciseId, body),
    );
  },
);
