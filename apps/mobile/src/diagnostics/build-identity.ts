import type { AppEnvironmentCheck } from "@overload/shared/mobile/app-environment";
import { environmentLabel } from "@overload/shared/mobile/app-environment";
import {
  describeRunningBundle,
  type RunningBundleInput,
} from "./running-bundle";

/**
 * About this app (Pitch 21l design §12 A1; spec RD-21): which Overload this
 * is, in every build, so the owner never infers the environment from the
 * app's look. Read-only and public facts only: never a token, a key, an
 * email, or an account name. The Supabase project id is public (it is in the
 * sign-in URL).
 */
export type IdentityRow = { title: string; value: string };

export type BuildIdentity = {
  build: IdentityRow[];
  updates: IdentityRow[];
};

const NONE = "—";

export function describeBuildIdentity(input: {
  env: AppEnvironmentCheck;
  version: string;
  buildNumber: string | null;
  runtimeVersion: string | null;
  bundle: RunningBundleInput;
}): BuildIdentity {
  const { env } = input;
  const bundle = describeRunningBundle(input.bundle);
  return {
    build: [
      { title: "Environment", value: environmentLabel(env) },
      {
        title: "Server",
        value: env.ok ? env.config.apiOrigin.replace(/^https?:\/\//, "") : NONE,
      },
      {
        title: "Sign-in project",
        value: env.ok ? env.config.supabaseRef : NONE,
      },
      { title: "Version", value: input.version },
      { title: "Build", value: input.buildNumber?.trim() || NONE },
    ],
    updates: [
      { title: "Running", value: bundle.source },
      { title: "Channel", value: bundle.channel },
      { title: "Update group", value: bundle.updateGroup },
      { title: "Published", value: bundle.published },
      { title: "Runtime", value: input.runtimeVersion?.slice(0, 10) || NONE },
    ],
  };
}

/** The More footer line: "Overload 1.0.0 (3)" in Production, "· Staging" otherwise. */
export function footerLine(input: {
  env: AppEnvironmentCheck;
  version: string;
  buildNumber: string | null;
}): string {
  const { env } = input;
  if (env.ok && env.config.environment === "production") {
    const build = input.buildNumber?.trim();
    return build
      ? `Overload ${input.version} (${build})`
      : `Overload ${input.version}`;
  }
  return `Overload ${input.version} · ${environmentLabel(env)}`;
}
