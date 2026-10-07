import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The single shared Prisma client for the whole application.
//
// Runtime connects through the POOLED connection (`DATABASE_URL`) via the pg
// driver adapter (Prisma 7 requires an adapter). The direct connection
// (`DIRECT_URL`) is used only by the migration CLI, configured in
// prisma.config.ts — never at runtime.
//
// Do NOT construct another PrismaClient anywhere. Import this one.

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The runtime Prisma client requires the pooled connection string.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
