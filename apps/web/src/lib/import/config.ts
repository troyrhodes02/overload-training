/**
 * Workout Plan Import & Review (Pitch 22) — the server-side kill switch,
 * mirroring billing's isCheckoutEnabled() (src/lib/billing/config.ts).
 *
 * Plan import is OFF unless PLAN_IMPORT_ENABLED is exactly "true" — so a
 * production deploy with the flag unset (the default until the owner turns it
 * on) cannot start an import, upload a source, or reach a provider call, even if
 * every other dependency is present. This is the single switch: both the entry
 * on /plan (shows a plain "unavailable" note) and every import server action
 * (refuses before any work) read it, so the UI and the server agree. It fails
 * CLOSED — any value other than the exact string "true" means OFF.
 */
export function isPlanImportEnabled(): boolean {
  return process.env.PLAN_IMPORT_ENABLED === "true";
}
