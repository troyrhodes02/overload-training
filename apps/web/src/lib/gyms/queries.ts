import "server-only";
import type { Account } from "@/lib/data/account";

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

export async function listActiveGyms(
  account: Account,
): Promise<GymListItemDto[]> {
  return account.db.gym.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, address: true },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}
