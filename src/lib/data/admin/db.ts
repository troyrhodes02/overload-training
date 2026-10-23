import "server-only";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminArgs } from "./gate";

/**
 * The admin client (Admin Center & Feedback, spec section 6.2; R15): the
 * shared client from src/lib/db.ts wrapped in a query extension that runs
 * every model operation through the pure admin gate. It shares the
 * connection pool (no second PrismaClient is constructed), interactive
 * transactions keep the gate, and admin code never uses raw queries (guard
 * tests). Only the admin data modules in this directory import it.
 */
export function createAdminClient(base: PrismaClient = prisma) {
  return base.$extends({
    name: "overload-admin-gate",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(adminArgs(model, operation, args) as typeof args);
        },
      },
    },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
/** The transaction client of the admin client (still gated). */
export type AdminTx = Parameters<Parameters<AdminClient["$transaction"]>[0]>[0];
export type AdminDb = AdminClient | AdminTx;

let shared: AdminClient | undefined;

/** The process's admin client, built on first use. */
export function adminDb(): AdminClient {
  shared ??= createAdminClient();
  return shared;
}

/** Transaction clients opened by inAdminTx, while their transaction runs. */
const OPEN = new WeakSet<object>();

/**
 * Runs an admin mutation in one transaction on the admin client. The audit
 * writer accepts only a transaction client opened here, so an audit entry
 * can never be committed separately from the change it records.
 */
export function inAdminTx<T>(
  run: (tx: AdminTx) => Promise<T>,
  client: AdminClient = adminDb(),
): Promise<T> {
  return client.$transaction(async (tx) => {
    OPEN.add(tx);
    try {
      return await run(tx);
    } finally {
      OPEN.delete(tx);
    }
  });
}

/** Whether `tx` is a transaction inAdminTx opened and that is still running. */
export function isOpenAdminTx(tx: unknown): boolean {
  return typeof tx === "object" && tx !== null && OPEN.has(tx);
}
