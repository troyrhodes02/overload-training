import { readReleaseNotes } from "@/lib/api/mobile/account-settings";
import { apiJson } from "@/lib/api/mobile/errors";
import { mobileRoute } from "@/lib/api/mobile/pipeline";

/**
 * GET /api/mobile/v1/release-notes: every What's New entry, newest first
 * (Pitch 21j E4). Reads nothing about the account; reading it marks nothing.
 */
export const GET = mobileRoute(async () => apiJson(readReleaseNotes()));
