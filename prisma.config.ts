import path from "node:path";
// Prisma 7 does not auto-load .env for the config file, so load it here before
// reading process.env. dotenv does NOT override variables already present in
// the environment, so an explicitly exported DIRECT_URL (e.g. the production
// value passed on the command line) still takes precedence over .env.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 configuration. Connection URLs live here, not in schema.prisma.
//
// The CLI (migrations, introspection) connects through the DIRECT_URL — the
// direct, non-pooled connection. The runtime PrismaClient is constructed in
// src/lib/db.ts with the pooled DATABASE_URL, so no ad hoc client is created
// and runtime never uses the direct connection.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // Read directly from the environment (not prisma's env()) so offline
    // commands (validate, generate, migrate diff) don't fail when the var is
    // absent. Commands that actually connect require DIRECT_URL to be set.
    url: process.env.DIRECT_URL,
  },
});
