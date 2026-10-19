import "server-only";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/actions/result";
import { AccountScopeError, scopeArgs } from "./scope";

/**
 * The account-scoped Prisma client (Multi-User Foundation, spec §9/§11): the
 * shared client from src/lib/db.ts wrapped in a query extension that runs
 * every model operation through scopeArgs for ONE account. It shares the
 * underlying connection pool (no second PrismaClient is constructed), and
 * interactive transactions opened on it keep the scoping.
 *
 * Feature code never builds one of these: it receives `account.db` from
 * requireAccount() (src/lib/data/account.ts). Scripts and tests use
 * accountFor() (src/lib/data/operator.ts) with an explicitly named account.
 */
export function createAccountClient(
  userId: string,
  base: PrismaClient = prisma,
) {
  if (!isUuid(userId)) {
    throw new AccountScopeError("The acting account id is not valid.");
  }
  return base.$extends({
    name: "overload-account-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(
            scopeArgs(model, operation, args, userId) as typeof args,
          );
        },
      },
    },
  });
}

export type AccountClient = ReturnType<typeof createAccountClient>;
/** The transaction client of an account-scoped client (still scoped). */
export type AccountTx = Parameters<
  Parameters<AccountClient["$transaction"]>[0]
>[0];
/** Either: read helpers accept both the client and a transaction. */
export type AccountDb = AccountClient | AccountTx;
