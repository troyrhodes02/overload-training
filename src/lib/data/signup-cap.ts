import "server-only";
import { prisma } from "@/lib/db";

/**
 * The global signup cap's count (signup hardening, item 2d): accounts created
 * since `since`, read from existing data (Profile.createdAt) — no new table,
 * no migration. A count only; no account is identified or returned.
 */
export async function countRecentSignups(since: Date): Promise<number> {
  return prisma.profile.count({ where: { createdAt: { gte: since } } });
}
