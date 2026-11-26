/**
 * Account contracts: who the acting account is, its plan, and the shell state
 * the app shows on launch (`GET /me`, `GET /me/plan`, `GET /me/profile`,
 * `GET /me/deletion-inventory`, `POST /me/delete`; implemented in 21c and
 * 21j). Every value is
 * about the acting account only; nothing here names or reveals another.
 */
import type { Appearance } from "../appearance/appearance";
import type { Capability, Plan } from "../billing/plans";
import type {
  DisplayState,
  EntitlementSourceKind,
} from "../entitlements/types";
import type { WhatsNewDialogData } from "./release-notes";
import type { TourOutcomeValue } from "../enums";

export type AccountInventoryDto = {
  mesocycles: number;
  loggedSessions: number;
  loggedSets: number;
  goals: number;
  gyms: number;
  customExercises: number;
  cardioLogs: number;
};

/**
 * The acting account's profile (Accounts spec §11; OVE-50): first name, last
 * name, username, and the IANA timezone that is the only authority for
 * "today". Email and password live in Supabase Auth.
 */

export type SettingsProfile = {
  firstName: string;
  lastName: string;
  /** "" for an account made before usernames: it picks one in Settings. */
  username: string;
  timeZone: string;
};

/** The Settings nudge's view of the acting account's OWN email verification. */
export type EmailVerificationDto = { email: string; verified: boolean };

export type TrialNoticePhase =
  { phase: "ending"; endsToday: boolean } | { phase: "ended" };

/** The trial notice the shell is due to show (OVE-112), with Pro's capabilities in plain words. */
export type TrialNoticeData = TrialNoticePhase & {
  /** Pro's capabilities in plain words, from the capability model. */
  highlights: string[];
  /**
   * Whether the notice may offer a purchase: billing is on in this
   * deployment and the request is not from an app shell. When false the
   * notice keeps its facts but carries no purchase sentence or action.
   */
  purchasable: boolean;
};

/** The editable profile (the Settings profile). */
export type ProfileDto = SettingsProfile;

/**
 * `GET /me/profile` (Pitch 21j E1): the profile and every time zone the server
 * accepts (sorted, always including the stored one), so the app never relies
 * on its own `Intl` list (RD-3).
 */
export type ProfileViewDto = {
  profile: ProfileDto;
  timeZones: string[];
};

/** `PUT /me/profile` (E2): a full replace of the four editable fields. */
export type UpdateProfileRequest = {
  firstName: string;
  lastName: string;
  /** "" keeps a pre-username account without one; it can never clear one. */
  username: string;
  timeZone: string;
};

/** `PUT /me/profile` → 200: the values as saved (trimmed, username lowercased). */
export type UpdateProfileResponseDto = { profile: ProfileDto };

/**
 * The resolved entitlement on the wire. The server resolves it (trial, comp,
 * subscription) and decides every gate; the app only displays it and never
 * uses it to unlock a Pro result.
 */
export type EntitlementDto = {
  plan: Plan;
  /** The server's ReadonlySet, as an array. */
  capabilities: Capability[];
  sources: EntitlementSourceKind[];
  displayState: DisplayState;
  trialDaysLeft: number | null;
};

/** Whether the onboarding tour should start on its own (once per account). */
export type TourStateDto = { autoStart: boolean };

/** `PUT /me/tour/outcome` (Pitch 21k): the outcome now recorded. */
export type TourOutcomeResponseDto = { outcome: TourOutcomeValue };

/**
 * `POST /me/tour/offered` (Pitch 21k): `spent` is true only when this call
 * stamped the account's offer time. A repeat, or an account with no tour
 * record, answers false and changes nothing. It never changes an outcome and
 * never makes a tour due again.
 */
export type TourOfferedResponseDto = { spent: boolean };

/** The trial notice the shell is due to show, or null. Never purchasable in the app. */
export type TrialNoticeDto = TrialNoticeData;

/** `GET /me`: everything the app needs on launch. */
export type MeDto = {
  profile: ProfileDto;
  email: string;
  emailVerified: boolean;
  appearance: Appearance;
  entitlement: EntitlementDto;
  tour: TourStateDto;
  whatsNew: WhatsNewDialogData | null;
  trialNotice: TrialNoticeDto | null;
};

/**
 * `GET /me/plan`: the Plan & Billing screen, read-only. A projection of the
 * web's BillingScreenDto with no prices, no subscribe or manage action, and no
 * promo (no purchase flow in the app; CLAUDE.md).
 */
export type MePlanDto = {
  displayState: DisplayState;
  label: string;
  shortLabel: string;
  explanation: string;
  trialDaysLeft: number | null;
  problem: boolean;
  cancelAtPeriodEnd: boolean;
  /** The subscription's period end as display text, or null. */
  endsOn: string | null;
  /**
   * What Pro includes, in plain words, from the capability model (Pitch 21j
   * RD-15). Plan copy only: it unlocks nothing and carries no training data.
   */
  proIncludes: string[];
};

/** `POST /me/delete` (Pitch 21j E9). The account is the token's; only the password is sent. */
export type DeleteAccountRequest = { password: string };

/**
 * `POST /me/delete` → 200. `identity_pending`: the account's data was deleted
 * but closing the sign-in identity didn't finish; a retry finishes it.
 */
export type DeleteAccountResponseDto = {
  outcome: "deleted" | "identity_pending";
};

/**
 * The auth session a successful native signup returns (Pitch 21d RD-7). The
 * server signed the new account in once, and the app adopts this session
 * (Supabase `setSession`) instead of signing in a second time. The tokens are
 * the account's own; the app keeps them only in the device keychain.
 */
export type MobileSessionDto = {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch, as Supabase reports it. */
  expiresAt: number;
  tokenType: "bearer";
};

/** `POST /api/mobile/v1/accounts` → 201. */
export type SignUpResponseDto = { session: MobileSessionDto };

/** `POST /api/mobile/v1/password-reset` → 200, identical for every address. */
export type PasswordResetResponseDto = { sent: true };

/** `PUT /api/mobile/v1/me/appearance` → 200. */
export type UpdateAppearanceResponseDto = { appearance: Appearance };
