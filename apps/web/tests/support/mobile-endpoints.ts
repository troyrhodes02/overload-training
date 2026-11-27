/**
 * The mobile API endpoint registry (Pitch 21c spec §17; RD-13). Every exported
 * method of every route under src/app/api/mobile is listed here:
 *  - tests/unit/mobile-api-guards.test.ts fails when a route method is missing
 *    from this list (or listed but gone), and pins the public set;
 *  - tests/integration/isolation/mobile-api.int.test.ts fails when an entry
 *    here has no isolation case.
 * Adding an endpoint therefore means adding it here AND giving it cases.
 */
export type MobileEndpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The route directory under src/app, e.g. "api/mobile/v1/me". */
  route: string;
  /**
   * public: no token (app config, the unknown-path 404, and the version-gated
   * account routes signup and reset request); account: token required.
   */
  auth: "public" | "account";
};

const CATCH_ALL = "api/mobile/[[...path]]";

export const MOBILE_ENDPOINTS: readonly MobileEndpoint[] = [
  { method: "GET", route: "api/mobile/v1/app-config", auth: "public" },
  { method: "GET", route: "api/mobile/v1/me", auth: "account" },
  { method: "GET", route: "api/mobile/v1/today", auth: "account" },
  { method: "GET", route: "api/mobile/v1/gyms", auth: "account" },
  // Pitch 21h
  { method: "POST", route: "api/mobile/v1/gyms", auth: "account" },
  {
    method: "PUT",
    route: "api/mobile/v1/gyms/[gymId]/archived",
    auth: "account",
  },
  // Pitch 21d
  { method: "POST", route: "api/mobile/v1/accounts", auth: "public" },
  { method: "POST", route: "api/mobile/v1/password-reset", auth: "public" },
  { method: "PUT", route: "api/mobile/v1/me/appearance", auth: "account" },
  // Pitch 21e
  { method: "POST", route: "api/mobile/v1/workouts", auth: "account" },
  {
    method: "GET",
    route: "api/mobile/v1/workouts/[loggedSessionId]",
    auth: "account",
  },
  {
    method: "POST",
    route: "api/mobile/v1/workouts/[loggedSessionId]/complete",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/logged-exercises/[loggedExerciseId]/sets/[setNumber]",
    auth: "account",
  },
  { method: "GET", route: "api/mobile/v1/history", auth: "account" },
  {
    method: "GET",
    route: "api/mobile/v1/history/[loggedSessionId]",
    auth: "account",
  },
  // Pitch 21e Checkpoint A (RD-23): native missed-day resolution
  {
    method: "PUT",
    route: "api/mobile/v1/mesocycles/[mesocycleId]/missed-days/[missedOn]",
    auth: "account",
  },
  // Pitch 21f: logging completeness
  {
    method: "PUT",
    route: "api/mobile/v1/workouts/[loggedSessionId]/gym",
    auth: "account",
  },
  {
    method: "GET",
    route: "api/mobile/v1/logged-exercises/[loggedExerciseId]/swap-candidates",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/logged-exercises/[loggedExerciseId]/exercise",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/logged-exercises/[loggedExerciseId]/skipped",
    auth: "account",
  },
  {
    method: "PATCH",
    route: "api/mobile/v1/logged-exercises/[loggedExerciseId]/planned-sets",
    auth: "account",
  },
  {
    method: "PATCH",
    route: "api/mobile/v1/sets/[loggedSetId]",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/mesocycles/[mesocycleId]/cardio-logs/[scheduledFor]",
    auth: "account",
  },
  {
    method: "PATCH",
    route: "api/mobile/v1/cardio-logs/[cardioLogId]",
    auth: "account",
  },
  // Pitch 21h: plans, library, and gyms
  { method: "GET", route: "api/mobile/v1/plan", auth: "account" },
  {
    method: "GET",
    route: "api/mobile/v1/mesocycles/[mesocycleId]/sessions/[sessionId]",
    auth: "account",
  },
  { method: "GET", route: "api/mobile/v1/exercises", auth: "account" },
  { method: "POST", route: "api/mobile/v1/exercises", auth: "account" },
  {
    method: "PUT",
    route: "api/mobile/v1/exercises/[exerciseId]/favorite",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/exercises/[exerciseId]/archived",
    auth: "account",
  },
  {
    method: "GET",
    route: "api/mobile/v1/exercises/[exerciseId]",
    auth: "account",
  },
  // Pitch 21i: goals and exercise history
  { method: "GET", route: "api/mobile/v1/goals", auth: "account" },
  { method: "POST", route: "api/mobile/v1/goals", auth: "account" },
  {
    method: "GET",
    route: "api/mobile/v1/exercises/[exerciseId]/goal-form",
    auth: "account",
  },
  {
    method: "GET",
    route: "api/mobile/v1/exercises/[exerciseId]/history",
    auth: "account",
  },
  { method: "GET", route: "api/mobile/v1/goals/history", auth: "account" },
  { method: "GET", route: "api/mobile/v1/goals/[goalId]", auth: "account" },
  {
    method: "PUT",
    route: "api/mobile/v1/goals/[goalId]/archived",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/goals/[goalId]/acknowledged",
    auth: "account",
  },
  // OVE-241: native weekly scheduling parity
  { method: "GET", route: "api/mobile/v1/this-week", auth: "account" },
  {
    method: "POST",
    route: "api/mobile/v1/mesocycles/[mesocycleId]/schedule/skip",
    auth: "account",
  },
  {
    method: "POST",
    route: "api/mobile/v1/mesocycles/[mesocycleId]/schedule/move",
    auth: "account",
  },
  // Pitch 21j
  { method: "GET", route: "api/mobile/v1/me/profile", auth: "account" },
  { method: "PUT", route: "api/mobile/v1/me/profile", auth: "account" },
  { method: "GET", route: "api/mobile/v1/me/plan", auth: "account" },
  { method: "GET", route: "api/mobile/v1/release-notes", auth: "account" },
  {
    method: "POST",
    route: "api/mobile/v1/me/release-notes/seen",
    auth: "account",
  },
  { method: "GET", route: "api/mobile/v1/me/export", auth: "account" },
  {
    method: "GET",
    route: "api/mobile/v1/me/deletion-inventory",
    auth: "account",
  },
  { method: "POST", route: "api/mobile/v1/me/delete", auth: "account" },
  { method: "POST", route: "api/mobile/v1/feedback", auth: "account" },
  // Pitch 21k
  { method: "PUT", route: "api/mobile/v1/me/tour/outcome", auth: "account" },
  { method: "POST", route: "api/mobile/v1/me/tour/offered", auth: "account" },
  // Pitch 25
  { method: "POST", route: "api/mobile/v1/wing-it-workouts", auth: "account" },
  {
    method: "GET",
    route: "api/mobile/v1/workouts/[loggedSessionId]/exercise-candidates",
    auth: "account",
  },
  {
    method: "PUT",
    route: "api/mobile/v1/workouts/[loggedSessionId]/exercises/[exerciseId]",
    auth: "account",
  },
  ...(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((method) => ({
    method,
    route: CATCH_ALL,
    auth: "public" as const,
  })),
];

/** The only routes allowed to skip the token AND the version gate (21c spec §6.3). */
export const PUBLIC_MOBILE_ROUTES: readonly string[] = [
  "api/mobile/v1/app-config",
  CATCH_ALL,
];

/**
 * The only routes allowed to skip the token while keeping the version gate
 * (Pitch 21d spec §10.2): native signup and the native reset request.
 */
export const PUBLIC_VERSIONED_MOBILE_ROUTES: readonly string[] = [
  "api/mobile/v1/accounts",
  "api/mobile/v1/password-reset",
];

export const endpointKey = (e: Pick<MobileEndpoint, "method" | "route">) =>
  `${e.method} ${e.route}`;
