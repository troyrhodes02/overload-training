import type { ConfigContext, ExpoConfig } from "expo/config";
import {
  checkEasTarget,
  checkMobileEnvironment,
  mentionsProduction,
} from "../../packages/shared/src/mobile/environment.ts";
import { colors } from "../../packages/shared/src/design/tokens.ts";

// Expo evaluates this file with Node, which strips the shared package's
// TypeScript natively (Node >= 22.18; eas.json pins the build's Node). The
// explicit .ts paths are deliberate: the config loader does not resolve the
// workspace package's source exports.

/**
 * The Overload iPhone app's Expo config (Pitch 21d spec §7, §13).
 *
 * Every 21d artifact is staging-only. This file refuses, before anything is
 * bundled or built:
 *   - an environment other than staging;
 *   - a Production Supabase key or reference in any public value;
 *   - an EAS build profile other than development / development-simulator;
 *   - an update channel other than staging, when EAS_UPDATE_CHANNEL is set
 *     (`npm run update:staging` sets it; eas-cli itself may not). The fence
 *     that always holds is in eas.json: every build listens to `staging`
 *     only, so an update published to any other channel reaches no build.
 * Problems name the variable, never its value.
 */

const VERSION = "0.1.0";

/** The EAS project (public identifier, not a secret). */
const EAS_PROJECT_ID: string | null = "3b322e4a-1bf6-422e-9feb-3aa859dffb46";

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = checkMobileEnvironment({
    environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Validated here so a typo fails early; used only by a Metro dev bundle.
    localApiOrigin: process.env.EXPO_PUBLIC_LOCAL_API_ORIGIN,
    allowLocalApi: true,
  });
  // eas-cli evaluates this file once before it injects the EAS environment
  // (and without .env files), so a value that is simply absent is not refused
  // here: the bundle step runs with the values, and the app's launch check
  // refuses a build without them. A value that is present and wrong (another
  // environment, another Supabase project, anything naming Production) is
  // always refused.
  const absent = (name: string) => !process.env[name]?.trim();
  const problems = [
    ...(env.ok ? [] : env.problems).filter(
      (p) =>
        !(
          p.startsWith("EXPO_PUBLIC_OVERLOAD_ENV") &&
          absent("EXPO_PUBLIC_OVERLOAD_ENV")
        ) &&
        !(
          p === "EXPO_PUBLIC_SUPABASE_ANON_KEY is missing" &&
          absent("EXPO_PUBLIC_SUPABASE_ANON_KEY")
        ),
    ),
    ...checkEasTarget({
      profile: process.env.EAS_BUILD_PROFILE,
      channel: process.env.EAS_UPDATE_CHANNEL,
    }),
    ...Object.entries(process.env)
      .filter(([name]) => name.startsWith("EXPO_PUBLIC_"))
      .filter(([, value]) => mentionsProduction(value))
      .map(([name]) => `${name} names Production`),
  ];
  if (problems.length > 0) {
    throw new Error(
      `Overload mobile config refused (staging only):\n- ${problems.join("\n- ")}`,
    );
  }

  return {
    ...config,
    name: "Overload Dev",
    slug: "overload",
    owner: "wtrhodes",
    scheme: "overload-dev",
    version: VERSION,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    platforms: ["ios"],
    ios: {
      bundleIdentifier: "app.overloadtraining.dev",
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        // A local `next start` against overload-dev during development only.
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      },
    },
    runtimeVersion: { policy: "fingerprint" },
    ...(EAS_PROJECT_ID
      ? {
          updates: {
            url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
            checkAutomatically: "ON_LOAD" as const,
          },
          extra: { eas: { projectId: EAS_PROJECT_ID } },
        }
      : {}),
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 96,
          backgroundColor: colors.light.background,
          dark: {
            image: "./assets/splash-icon.png",
            backgroundColor: colors.dark.background,
          },
        },
      ],
      "expo-font",
      [
        "expo-dev-client",
        // The dev launcher opens the last project automatically.
        { launchMode: "most-recent" },
      ],
    ],
  };
};
