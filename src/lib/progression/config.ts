/**
 * Progressive Overload Engine — tunable progression constants (spec §11a).
 *
 * The ONE home for every progression number. No magic numbers live in the
 * engine, the read layer, components, routes, or chart code (CLAUDE.md:
 * "named constants in lib/progression/config.ts, not magic numbers").
 *
 * All values are Bucket C tunable defaults (NOT PRD-derived); they are expected
 * to be re-tuned from lived usage. Changing one here changes it everywhere.
 */

/** Minimum completed qualifying performances before any reactive call (R4). */
export const MIN_QUALIFYING_SESSIONS = 2;

/** Consecutive qualifying performances required for a raw Progress candidate (R5). */
export const PROGRESS_CONSECUTIVE_SESSIONS = 2;

/** Consecutive qualifying performances required for a reactive Deload (R6). */
export const DELOAD_CONSECUTIVE_SESSIONS = 2;

/**
 * e1RM stall window. The stall gate only operates once this many qualifying
 * points exist; with exactly two all-top sessions Progress proceeds (R22, R24).
 */
export const STALL_WINDOW_SESSIONS = 3;

/** Suggested load increment on a valid Progress, in lbs. Suggestion only (R27). */
export const PROGRESS_INCREMENT_LBS = 5;

/** Scheduled-deload working-load factor: 90% of the normal working weight (R33). */
export const SCHEDULED_DELOAD_FACTOR = 0.9;

/**
 * Load granularity for rounding the scheduled-deload suggestion, in lbs. The
 * suggestion rounds DOWN to this step, never above the raw 90% target (R35).
 */
export const LOAD_STEP_LBS = 5;
