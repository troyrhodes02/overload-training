/**
 * Prisma seed entry point: the one-time (and safely re-runnable) import of the
 * free-exercise-db catalog into Overload's own `exercises` table and
 * `exercise-images` Storage bucket (Library & Gyms Setup).
 *
 * Run with `npm run db:seed` (→ `prisma db seed` → `tsx prisma/seed.ts`).
 *
 * Environment (from the operator's shell; see docs/runs/02-library-gyms-setup-runbook.md):
 *   DATABASE_URL               target database (pooled URL is fine)
 *   NEXT_PUBLIC_SUPABASE_URL   target Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  server-only; used here ONLY to write Storage
 *   OVERLOAD_IMPORT_CONFIRM_HOST  required when DATABASE_URL is not local
 *
 * This process builds its own PrismaClient: src/lib/db.ts is `server-only` and
 * cannot load outside Next. It is a separate CLI process, so "one client per
 * process" still holds.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { githubImageSource, supabaseImageStore } from "./seed/adapters";
import { importCatalog } from "./seed/catalog-import";
import {
  FREE_EXERCISE_DB_COMMIT,
  loadVendoredDataset,
} from "./seed/free-exercise-db/source";
import { assertImportTargetAllowed } from "./seed/target-guard";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const { host, remote } = assertImportTargetAllowed(
    databaseUrl,
    process.env.OVERLOAD_IMPORT_CONFIRM_HOST,
  );
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log(
    `Importing free-exercise-db @ ${FREE_EXERCISE_DB_COMMIT.slice(0, 7)} into ${host}` +
      (remote ? " (REMOTE — confirmed)" : " (local)"),
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const report = await importCatalog({
      prisma,
      records: loadVendoredDataset(),
      imageStore: supabaseImageStore(supabase),
      imageSource: githubImageSource(),
      log: (line) => console.log(line),
    });
    console.log(
      JSON.stringify(
        { ...report, imageFailures: report.imageFailures.length },
        null,
        2,
      ),
    );
    if (report.imageFailures.length > 0) {
      console.log(
        "Some images failed; those exercises remain usable without an image. " +
          "Re-run the import to retry just the missing images.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
