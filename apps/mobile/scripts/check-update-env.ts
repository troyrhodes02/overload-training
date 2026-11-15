/**
 * Run by scripts/update-staging.ts inside the EAS `development` environment
 * (`eas env:exec development …`), before publishing. An update is a release
 * bundle: it must carry the staging environment and anon key, or every phone
 * that opens it shows the misconfigured screen (RD-23 lets absent values pass
 * at config time, so this is where they are required).
 *
 * Prints problem names only, never a value.
 */
import { checkMobileEnvironment } from "../../../packages/shared/src/mobile/environment.ts";

const env = checkMobileEnvironment({
  environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  localApiOrigin: undefined,
  allowLocalApi: false,
});
if (!env.ok) {
  console.error(
    `The EAS development environment can't build a staging update:\n- ${env.problems.join("\n- ")}`,
  );
  process.exit(1);
}
if (env.config.environment !== "staging") {
  console.error("The EAS development environment is not staging.");
  process.exit(1);
}
console.log("EAS development environment: staging values present.");
