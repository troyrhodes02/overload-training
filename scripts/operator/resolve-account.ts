/**
 * Resolve an operator task's target account (CLAUDE.md → Operator tasks:
 * "Name the target account explicitly, by email, and confirm the resolved
 * account before writing anything"). The ONE lookup shared by every operator
 * tool, so a fix here reaches all of them.
 *
 * Error text never repeats the email (CLAUDE.md → Personal data). The resolved
 * account (id + email) is returned for the tool to echo as its confirmation.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Raw =
  | Pick<PrismaClient, "$queryRawUnsafe">
  | Pick<Prisma.TransactionClient, "$queryRawUnsafe">;

export type ResolvedAccount = { userId: string; email: string };

export async function resolveAccountByEmail(
  db: Raw,
  email: string,
): Promise<{ account: ResolvedAccount } | { error: string }> {
  const wanted = typeof email === "string" ? email.trim() : "";
  if (!wanted) return { error: "No target account email was given." };
  let rows: { id: string; email: string }[];
  try {
    rows = await db.$queryRawUnsafe<{ id: string; email: string }[]>(
      `SELECT id::text AS id, email::text AS email FROM auth.users
        WHERE lower(email) = lower($1)`,
      wanted,
    );
  } catch {
    return { error: "auth.users is not readable on this database." };
  }
  if (rows.length === 0) return { error: "No account has that email." };
  if (rows.length > 1) {
    return { error: "More than one account matches that email." };
  }
  return { account: { userId: rows[0].id, email: rows[0].email } };
}
