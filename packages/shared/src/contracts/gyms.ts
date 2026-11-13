/**
 * The account's gyms. Built by apps/web/src/lib/gyms/queries.ts (moved here in
 * Pitch 21b, so the compiler holds the server's output to the contract). Wire
 * conventions: ./wire.ts.
 */
/**
 * Gym reads. The selection list filters `deletedAt: null`; history views (a
 * later pitch) must read gyms WITHOUT that filter so archived gyms still
 * resolve in past workouts. The address is personal location data and is
 * returned only here (spec UI Data Contracts).
 */
export type GymListItemDto = {
  id: string;
  name: string;
  address: string | null;
};
