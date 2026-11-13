/**
 * Account contracts: who the acting account is, its plan, and the shell state
 * the app shows on launch (`GET /me`, `GET /me/plan`, `GET /me/profile`,
 * `GET /me/deletion-inventory`; implemented in 21c and 21j). Every value is
 * about the acting account only; nothing here names or reveals another.
 */
import type { Appearance } from "../appearance/appearance";
import type { Capability, Plan } from "../billing/plans";
import type {
  DisplayState,
  EntitlementSourceKind,
} from "../entitlements/types";
import type { WhatsNewDialogData } from "./release-notes";

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

/**
 * Trial notices (OVE-112) — the acting account's one-time trial notice for
 * the (app) layout, and the write that records it was shown. Reached only
 * through the account-scoped client, so one account can never read, change,
 * or detect another's notice state. The shown-at columns are presentation
 * state on Profile; nothing here touches an entitlement.
 */

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

/** `GET /me/profile`: the editable profile (the Settings profile). */
export type ProfileDto = SettingsProfile;

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
};
