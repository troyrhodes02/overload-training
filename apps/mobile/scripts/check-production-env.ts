/**
 * Run by scripts/update-production.ts inside the EAS `production` environment
 * (`eas env:exec production …`), before publishing (Pitch 21l runbook §8). A
 * Production update must carry the Production environment and anon key, or
 * every TestFlight phone that opens it shows the misconfigured screen.
 *
 * Prints problem names only, never a value.
 */
import { checkProductionEnvironment } from "../../../packages/shared/src/mobile/production-environment.ts";

const env = checkProductionEnvironment({
  environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  localApiOrigin: process.env.EXPO_PUBLIC_LOCAL_API_ORIGIN,
});
if (!env.ok) {
  console.error(
    `The EAS production environment can't build a Production update:\n- ${env.problems.join("\n- ")}`,
  );
  process.exit(1);
}
console.log("EAS production environment: Production values present.");
