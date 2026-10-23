/**
 * Cross-account isolation coverage registry (Multi-User Foundation spec
 * §14.2). Every owned model must appear here with the suite files that prove
 * a second account can't read, change, enumerate, or detect it. The coverage
 * meta-test fails when the schema gains an owned model this registry lacks —
 * so a later pitch that adds one must add its isolation tests too.
 * Accounts (Pitch 9): account-deletion.int.test.ts proves deletion removes
 * every owned model of the acting account and nothing of another's.
 * Personalization & Navigation Polish (Pitch 10): greeting.int.test.ts proves
 * the greeting reads only the acting account's profile and logged sessions;
 * profile.int.test.ts covers the new Profile.appearance column.
 * Open signup & usernames (OVE-50): profile.int.test.ts covers
 * Profile.username — unique across accounts, never readable or changeable by
 * another account, and the availability check answers yes/no only.
 * Onboarding Tour (Pitch 11): tour.int.test.ts proves an account's
 * TourProgress can't be read, changed, or detected by another.
 * What's New (Pitch 12): release-notes.int.test.ts proves an account's
 * ReleaseSeen can't be read, changed, or detected by another, and that one
 * account's dialog never moves another's seen point.
 * Faster Logging UX (Pitch 13): no new owned model; logging.int.test.ts proves
 * the card's "Last time" context and working weight read only the acting
 * account's LoggedExercise/LoggedSet/GymExerciseBaseline rows.
 * Exercise History & PR Intelligence (Pitch 16): no new owned model;
 * exercise-history.int.test.ts proves another account sees none of the
 * acting account's sessions, records, calls, scopes, or goals on a shared
 * library exercise, and that its custom exercise and gym ids read as missing.
 * Admin Center & Feedback (Pitch 17): feedback.int.test.ts proves another
 * account can't read, count, change, or detect an account's Feedback, and
 * that the admin-only AdminAuditEntry is unreachable through account.db.
 */
export const ISOLATION_COVERAGE: Record<string, string[]> = {
  Mesocycle: ["plan.int.test.ts", "account-deletion.int.test.ts"],
  Session: ["plan.int.test.ts", "account-deletion.int.test.ts"],
  SessionExercise: ["plan.int.test.ts", "account-deletion.int.test.ts"],
  PlannedCardio: ["plan.int.test.ts", "account-deletion.int.test.ts"],
  Exercise: ["library.int.test.ts", "account-deletion.int.test.ts"],
  ExerciseFavorite: ["library.int.test.ts", "account-deletion.int.test.ts"],
  Gym: ["gyms.int.test.ts", "account-deletion.int.test.ts"],
  GymExerciseBaseline: ["logging.int.test.ts", "account-deletion.int.test.ts"],
  LoggedSession: [
    "logging.int.test.ts",
    "account-deletion.int.test.ts",
    "greeting.int.test.ts",
  ],
  LoggedExercise: ["logging.int.test.ts", "account-deletion.int.test.ts"],
  LoggedSet: ["logging.int.test.ts", "account-deletion.int.test.ts"],
  MissedDayResolution: ["logging.int.test.ts", "account-deletion.int.test.ts"],
  CardioLog: ["logging.int.test.ts", "account-deletion.int.test.ts"],
  Goal: ["goals.int.test.ts", "account-deletion.int.test.ts"],
  Profile: [
    "profile.int.test.ts",
    "account-deletion.int.test.ts",
    "greeting.int.test.ts",
  ],
  TourProgress: ["tour.int.test.ts", "account-deletion.int.test.ts"],
  ReleaseSeen: ["release-notes.int.test.ts", "account-deletion.int.test.ts"],
  Feedback: ["feedback.int.test.ts", "account-deletion.int.test.ts"],
};
