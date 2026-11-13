import "server-only";
import type { Account } from "@/lib/data/account";
import type { GymListItemDto } from "@overload/shared/contracts/gyms";
export type { GymListItemDto } from "@overload/shared/contracts/gyms";

export async function listActiveGyms(
  account: Account,
): Promise<GymListItemDto[]> {
  return account.db.gym.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, address: true },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}
