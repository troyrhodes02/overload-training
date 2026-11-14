import { publicMobileRoute } from "@/lib/api/mobile/pipeline";
import { apiErrorResponse, ApiFailure } from "@/lib/api/mobile/errors";

/**
 * Any path under /api/mobile that no endpoint answers, including the bare
 * /api/mobile itself (an optional catch-all; release review #1) (Pitch 21c
 * spec §6.3):
 * a JSON 404 in the API's error envelope, never Next's HTML not-found page, for
 * every method. Specific routes always win over this catch-all. It checks no
 * version and no token, so an unknown path is never reported as anything but
 * not found.
 */
const notFound = publicMobileRoute<{ path?: string[] }>(async () =>
  apiErrorResponse(new ApiFailure("not_found", "There's nothing here.")),
);

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
