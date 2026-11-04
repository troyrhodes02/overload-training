/**
 * Local-only demo account provisioning (spec §13, RD-18; pitch Appendix A
 * item 2). For a genuinely ISOLATED local Supabase CLI stack only.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *   DEMO_SUPABASE_URL=http://127.0.0.1:54321 \
 *   DEMO_SUPABASE_SERVICE_ROLE_KEY=<local stack service_role key> \
 *   DEMO_EMAIL=demo@example.test DEMO_PASSWORD=<local-only password> \
 *   npm run demo:provision-local
 *
 * Creates the auth user through the Supabase Auth ADMIN API (never raw SQL),
 * then its profile through establishProfile — exactly what signup does
 * (14-day trial, tour due, release notes caught up). Refuses if the email
 * already exists; never deletes or modifies anything. Prints the new user id
 * for the seed CLI. The credentials stay on the operator's machine: there is
 * no public demo login.
 */
import {
  DemoSeedRefused,
  assertSafeEnvironment,
  isLoopbackHost,
} from "./guard";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  let databaseUrl: string;
  try {
    ({ databaseUrl } = assertSafeEnvironment(process.env));
  } catch (error) {
    if (error instanceof DemoSeedRefused) fail(`REFUSED: ${error.message}`);
    throw error;
  }
  const url = process.env.DEMO_SUPABASE_URL;
  const key = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD;
  if (!url || !isLoopbackHost(new URL(url).hostname.toLowerCase()))
    fail("REFUSED: DEMO_SUPABASE_URL must be the loopback local stack.");
  if (!key)
    fail("DEMO_SUPABASE_SERVICE_ROLE_KEY is not set (local stack key).");
  if (!email || !email.endsWith(".test"))
    fail(
      "DEMO_EMAIL must be a reserved .test address (synthetic, undeliverable).",
    );
  if (!password || password.length < 12)
    fail("DEMO_PASSWORD must be at least 12 characters (local only).");

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email: email!,
    password: password!,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    fail(
      `Could not create the demo user (${created.error?.code ?? "unknown"}). If it already exists, reuse its id with the seed CLI; this tool never deletes.`,
    );
  }
  const userId = created.data.user.id;

  // establishProfile writes through the app's client, which reads
  // DATABASE_URL — the same loopback database the guard just verified.
  void databaseUrl;
  const { establishProfile } = await import("@/lib/data/account");
  const { DEMO_TIME_ZONE } = await import("./fixture");
  await establishProfile(
    { id: userId },
    {
      firstName: "Demo",
      lastName: "Lifter",
      username: `demo_${userId.slice(0, 6)}`,
      timeZone: DEMO_TIME_ZONE,
    },
  );
  console.log(`Created local demo account ${userId}.`);
  console.log(
    `Next: npm run demo:seed -- --user-id ${userId}   (dry run first)`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
