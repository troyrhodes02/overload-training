/**
 * The account's gyms. Built by apps/web/src/lib/gyms/queries.ts (moved here in
 * Pitch 21b, so the compiler holds the server's output to the contract). Wire
 * conventions: ./wire.ts.
 */
/** One of the account's gyms. The address is personal location data, shown only on the gym screens. */
export type GymListItemDto = {
  id: string;
  name: string;
  address: string | null;
};
