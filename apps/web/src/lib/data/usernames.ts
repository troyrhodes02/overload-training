import "server-only";
import { prisma } from "@/lib/db";

/**
 * Usernames are unique across ALL accounts (OVE-50), so whether one is free is
 * the one question this layer answers across accounts. It answers yes or no
 * only: never which account holds it, its id, or anything else about it.
 *
 * A courtesy pre-check so signup can say "taken" before creating anything. The
 * unique index on profiles.username is the authority: two signups racing for
 * one name both pass here, and the database rejects the second.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const holder = await prisma.profile.findUnique({
    where: { username },
    select: { userId: true },
  });
  return holder === null;
}
