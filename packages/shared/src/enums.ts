/**
 * The enum registry (Pitch 21b; mobile audit D-6). Prisma's schema is the
 * authority for every enum's values; the shared package cannot import Prisma,
 * so each enum a client needs is written here once, as an `as const` tuple
 * plus its union type. A web test (apps/web/tests/unit/enum-parity.test.ts)
 * checks every tuple against `Prisma.$Enums` and fails when Prisma gains an
 * enum that is in neither this registry nor its list of web-only enums.
 *
 * Tuples that already had a home in a domain module are re-exported from it
 * (one definition each); the rest are defined here.
 */
import { APPEARANCES } from "./appearance/appearance";
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from "./exercises/taxonomy";
import { FEEDBACK_CATEGORIES } from "./feedback/validation";
import { SPLIT_TYPES } from "./plan/presets";

export { APPEARANCES, type Appearance } from "./appearance/appearance";
export {
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  type EquipmentValue,
  type MuscleGroupValue,
} from "./exercises/taxonomy";
export {
  FEEDBACK_CATEGORIES,
  type FeedbackCategoryValue,
} from "./feedback/validation";
export { SPLIT_TYPES, type SplitTypeValue } from "./plan/presets";

export const MESOCYCLE_STATUSES = ["draft", "active", "archived"] as const;
export type MesocycleStatusValue = (typeof MESOCYCLE_STATUSES)[number];

export const GOAL_STATUSES = ["active", "archived"] as const;
export type GoalStatusValue = (typeof GOAL_STATUSES)[number];

export const GOAL_ARCHIVE_REASONS = ["completed", "manual"] as const;
export type GoalArchiveReasonValue = (typeof GOAL_ARCHIVE_REASONS)[number];

export const LOGGED_SESSION_STATUSES = ["in_progress", "complete"] as const;
export type LoggedSessionStatusValue = (typeof LOGGED_SESSION_STATUSES)[number];

export const MISSED_DAY_OUTCOMES = [
  "logged_late",
  "shifted",
  "skipped",
] as const;
export type MissedDayOutcomeValue = (typeof MISSED_DAY_OUTCOMES)[number];
/** The outcomes a missed-day resolution records ("log it late" starts a workout instead). */
export type ResolvableMissedDayOutcome = Exclude<
  MissedDayOutcomeValue,
  "logged_late"
>;

export const PLANS = ["free", "pro"] as const;
export type PlanValue = (typeof PLANS)[number];

export const TOUR_OUTCOMES = ["completed", "skipped"] as const;
export type TourOutcomeValue = (typeof TOUR_OUTCOMES)[number];

export const ACCOUNT_STATUSES = ["active", "suspended"] as const;
export type AccountStatusValue = (typeof ACCOUNT_STATUSES)[number];

/**
 * Every shared enum by its Prisma enum name. The parity test walks this map;
 * adding a Prisma enum a client needs means adding it here.
 */
export const SHARED_ENUMS = {
  MesocycleStatus: MESOCYCLE_STATUSES,
  SplitType: SPLIT_TYPES,
  GoalStatus: GOAL_STATUSES,
  GoalArchiveReason: GOAL_ARCHIVE_REASONS,
  LoggedSessionStatus: LOGGED_SESSION_STATUSES,
  MissedDayOutcome: MISSED_DAY_OUTCOMES,
  MuscleGroup: MUSCLE_GROUPS,
  Equipment: EQUIPMENT_TYPES,
  Appearance: APPEARANCES,
  Plan: PLANS,
  TourOutcome: TOUR_OUTCOMES,
  AccountStatus: ACCOUNT_STATUSES,
  FeedbackCategory: FEEDBACK_CATEGORIES,
} as const;
