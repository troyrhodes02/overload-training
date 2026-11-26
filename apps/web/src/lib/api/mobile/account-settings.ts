import "server-only";
import type { Account } from "@/lib/data/account";
import {
  getSettingsProfile,
  timeZoneOptions,
  updateProfile,
} from "@/lib/accounts/profile";
import { buildAccountExport, type AccountExport } from "@/lib/accounts/export";
import { getBillingScreen } from "@/lib/billing/screen";
import { proHighlights } from "@/lib/billing/pro-highlights";
import { markReleaseNotesSeen } from "@/lib/release-notes/seen";
import { markTourOffered, recordTourOutcome } from "@/lib/tour/progress";
import {
  orderedReleaseNotes,
  toReleaseNoteView,
} from "@overload/shared/release-notes/catalog";
import type {
  MePlanDto,
  ProfileViewDto,
  TourOfferedResponseDto,
  TourOutcomeResponseDto,
  UpdateProfileResponseDto,
} from "@overload/shared/contracts/account";
import type {
  MarkReleaseNotesSeenResponseDto,
  ReleaseNotesDto,
} from "@overload/shared/contracts/release-notes";
import { readJsonObject } from "./body";

/**
 * Account & Settings's mobile adapters (Pitch 21j spec §6, E1–E5 and E7). Each
 * is a thin shell over the module the web's Settings, Plan & Billing, What's
 * New, and export already use, unchanged: the account is the verified
 * token's, every read and write runs on its scoped client, and every rule
 * (validation, the seen point's forward-only move, the export's contents)
 * stays in that module. Nothing here is Pro and nothing here calls Stripe:
 * the plan view reads the mirror the verified webhooks keep.
 */

/** Profile and seen-mark bodies are a few short fields. */
export const ACCOUNT_BODY_LIMIT = 4 * 1024;

/** E1 `GET /me/profile`. */
export async function readProfile(account: Account): Promise<ProfileViewDto> {
  const profile = await getSettingsProfile(account);
  return { profile, timeZones: timeZoneOptions(profile.timeZone) };
}

/**
 * E2 `PUT /me/profile`: a full replace through `updateProfile`, which
 * validates every field (the web's messages) and maps another account's
 * username to "taken" and nothing more. An absolute write: a retry saves the
 * same values again.
 */
export async function writeProfile(
  account: Account,
  request: Request,
): Promise<UpdateProfileResponseDto> {
  const body = await readJsonObject(request, ACCOUNT_BODY_LIMIT);
  const saved = await updateProfile(account, {
    firstName: body.firstName,
    lastName: body.lastName,
    username: body.username,
    timeZone: body.timeZone,
  });
  return { profile: saved };
}

/**
 * E3 `GET /me/plan`: the web's read-only app-shell projection of Plan &
 * Billing (RD-15). No price, no subscribe or manage action, no promo, and no
 * Stripe refetch on a GET (21c RD-5).
 */
export async function readPlanAccess(account: Account): Promise<MePlanDto> {
  const screen = await getBillingScreen(account, { inAppShell: true });
  return {
    displayState: screen.displayState,
    label: screen.label,
    shortLabel: screen.shortLabel,
    explanation: screen.explanation,
    trialDaysLeft: screen.trialDaysLeft,
    problem: screen.problem,
    cancelAtPeriodEnd: screen.cancelAtPeriodEnd,
    endsOn: screen.endsOn,
    proIncludes: proHighlights({ client: "app" }),
  };
}

/** E4 `GET /release-notes`: the canonical catalog, newest first, as the web page lists it. */
export function readReleaseNotes(): ReleaseNotesDto {
  return { entries: orderedReleaseNotes().map(toReleaseNoteView) };
}

/** E5 `POST /me/release-notes/seen`: forward-only, shared with the web dialog. */
export async function markSeen(
  account: Account,
  request: Request,
): Promise<MarkReleaseNotesSeenResponseDto> {
  const body = await readJsonObject(request, ACCOUNT_BODY_LIMIT);
  return markReleaseNotesSeen(account, body.throughId);
}

/**
 * E7 `GET /me/export`: exactly the document the web's /settings/export
 * downloads (RD-12). The app re-serializes it with the shared serializer, so
 * the saved file is the web's file. Read-only.
 */
export function readExport(account: Account): Promise<AccountExport> {
  return buildAccountExport(account);
}

/**
 * `PUT /me/tour/outcome` (Pitch 21k spec §6, T1): the native tour was finished
 * or skipped. The one recorder the web's tour uses (Onboarding Tour R7): the
 * latest outcome wins, a repeat sets the same value, and an outcome never
 * re-arms the automatic offer. Only `outcome` is read; any id in the body is
 * ignored, because the account is the verified token's.
 */
export async function putTourOutcome(
  account: Account,
  request: Request,
): Promise<TourOutcomeResponseDto> {
  const body = await readJsonObject(request, ACCOUNT_BODY_LIMIT);
  return { outcome: await recordTourOutcome(account, body.outcome) };
}

/**
 * `POST /me/tour/offered` (Pitch 21k spec §6, T2): an automatically started
 * native tour has appeared, so the account's one offer is spent (Onboarding
 * Tour R8). A repeat, or an account that was never due, changes nothing.
 * No body is read.
 */
export function postTourOffered(
  account: Account,
): Promise<TourOfferedResponseDto> {
  return markTourOffered(account);
}
