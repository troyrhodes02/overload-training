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
 * The Overload iPhone app's Expo config (Pitch 21d spec §7, §13; Pitch 21l
 * spec §3–§4).
 *
 * Two targets, never mixed. A Production target (any of
 * EXPO_PUBLIC_OVERLOAD_ENV=production, EAS_BUILD_PROFILE=production, or
 * EAS_UPDATE_CHANNEL=production) is checked by `productionConfig` below
 * against packages/shared/src/mobile/production-environment.ts, which is
 * loaded ONLY then: every file this config loads is an input to the runtime
 * fingerprint, and the staging build's runtime must not move (21l RD-19).
 *
 * Every other target is staging, unchanged since 21d. This file refuses,
 * before anything is bundled or built:
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

/** Pitch 21l: the TestFlight app's identity (RD-16–RD-18). */
const PRODUCTION_VERSION = "1.0.0";

type ProductionModule =
  typeof import("../../packages/shared/src/mobile/production-environment.ts");

/** Any Production signal (21l spec §3); spelled out here so staging loads nothing. */
function isProductionTarget(): boolean {
  return (
    process.env.EXPO_PUBLIC_OVERLOAD_ENV?.trim() === "production" ||
    process.env.EAS_BUILD_PROFILE === "production" ||
    process.env.EAS_UPDATE_CHANNEL === "production"
  );
}

/**
 * The Production config: the Production API and Supabase project only, no
 * dev launcher, no local-network exception, its own bundle id and channel.
 * Refuses any staging value, a staging profile or channel, and a local API.
 */
function productionConfig(config: ConfigContext["config"]): ExpoConfig {
  // Loaded only here, so the staging fingerprint never includes it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const prod: ProductionModule = require("../../packages/shared/src/mobile/production-environment.ts");
  const env = prod.checkProductionEnvironment({
    environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    localApiOrigin: process.env.EXPO_PUBLIC_LOCAL_API_ORIGIN,
  });
  // As for staging: eas-cli evaluates this file once before it injects the EAS
  // environment, so a value that is simply absent is left to the bundle step
  // and the launch check. A value that is present and wrong is refused.
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
    ...prod.checkProductionEasTarget({
      environment: process.env.EXPO_PUBLIC_OVERLOAD_ENV,
      profile: process.env.EAS_BUILD_PROFILE,
      channel: process.env.EAS_UPDATE_CHANNEL,
    }),
    ...Object.entries(process.env)
      .filter(([name]) => name.startsWith("EXPO_PUBLIC_"))
      .filter(([, value]) => prod.mentionsStaging(value))
      .map(([name]) => `${name} names staging`),
  ];
  if (problems.length > 0) {
    throw new Error(
      `Overload mobile config refused (Production):\n- ${[...new Set(problems)].join("\n- ")}`,
    );
  }
  if (!EAS_PROJECT_ID)
    throw new Error(
      "Overload mobile config refused (Production):\n- the EAS project id is missing",
    );

  return {
    ...config,
    name: "Overload",
    slug: "overload",
    owner: "wtrhodes",
    scheme: "overload",
    version: PRODUCTION_VERSION,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    platforms: ["ios"],
    ios: {
      bundleIdentifier: "app.overloadtraining",
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
    },
    runtimeVersion: { policy: "fingerprint" },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      checkAutomatically: "ON_LOAD" as const,
    },
    extra: { eas: { projectId: EAS_PROJECT_ID } },
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Overload opens your photos only when you choose a screenshot to attach to feedback.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
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
    ],
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  if (isProductionTarget()) return productionConfig(config);

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
      // Pitch 21j (RD-9, RD-10): pick one screenshot for feedback. The
      // system photo picker needs no library permission; the string is the
      // fallback iOS requires. No camera and no microphone.
      [
        "expo-image-picker",
        {
          photosPermission:
            "Overload opens your photos only when you choose a screenshot to attach to feedback.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
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
