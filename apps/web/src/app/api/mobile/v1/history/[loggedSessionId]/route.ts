import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";
import { readLoggedWorkout } from "@/lib/api/mobile/workouts";

/**
 * GET /api/mobile/v1/history/{loggedSessionId} (Pitch 21e spec §6 E6): one
 * logged workout exactly as recorded (archived exercises and gyms by name),
 * with its gated summary (locked for a Free account) and the goals it moved.
 * Another account's workout is a 404, exactly like a missing one.
 */
export const GET = mobileRoute<{ loggedSessionId: string }>(
  async ({ account }, { loggedSessionId }) =>
    apiJson(await readLoggedWorkout(account, loggedSessionId)),
);
