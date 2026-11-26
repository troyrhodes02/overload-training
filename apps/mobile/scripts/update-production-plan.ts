/**
 * The rules for publishing a Production over-the-air update (Pitch 21l
 * runbook §8; review #1), kept pure so they are tested. The runner is
 * scripts/update-production.ts. Publishing to `production` is always a human
 * step: this only makes the step hard to get wrong.
 *
 * An update comes only from a clean commit that is on origin/main (approved,
 * released source), only to the `production` channel, with the Production
 * environment forced, and only when a finished Production build has the
 * same runtime.
 */
export type ProductionRepoState = {
  /** `git status --porcelain` output. */
  status: string;
  /** Remote branches containing HEAD (`git branch -r --contains HEAD`). */
  remoteBranches: string;
  sha: string;
  subject: string;
};

export type ProductionPublishPlan =
  | { ok: true; args: string[]; env: Record<string, string> }
  | { ok: false; problems: string[] };

export const PRODUCTION = {
  channel: "production",
  environment: "production",
  platform: "ios",
  profile: "production",
} as const;

export function planProductionUpdate(
  repo: ProductionRepoState,
  extraArgs: readonly string[],
): ProductionPublishPlan {
  const problems: string[] = [];
  if (repo.status.trim() !== "") {
    problems.push(
      "The working tree has uncommitted changes. A Production update is exactly a released commit.",
    );
  }
  const onMain = repo.remoteBranches
    .split("\n")
    .map((b) => b.trim())
    .includes("origin/main");
  if (!onMain) {
    problems.push(
      "HEAD is not on origin/main. Production updates come only from released source (switch to main and pull).",
    );
  }
  if (!/^[0-9a-f]{40}$/.test(repo.sha)) problems.push("HEAD is not a commit.");
  let note: string | undefined;
  const refused: string[] = [];
  for (let i = 0; i < extraArgs.length; i += 1) {
    const a = extraArgs[i];
    if (a === "--message" || a === "-m") {
      note = extraArgs[i + 1];
      i += 1;
    } else if (a.startsWith("--message=")) {
      note = a.slice("--message=".length);
    } else {
      refused.push(a);
    }
  }
  if (refused.length > 0) {
    problems.push(
      `Only --message can be passed; refused: ${refused.join(" ")}`,
    );
  }
  if (note === undefined || note.trim() === "") {
    problems.push("--message is required: say what the update fixes.");
  } else if (/staging/i.test(note)) {
    problems.push("The message names staging. Production updates only.");
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    args: [
      "update",
      "--channel",
      PRODUCTION.channel,
      "--environment",
      PRODUCTION.environment,
      "--platform",
      PRODUCTION.platform,
      "--message",
      `${repo.sha.slice(0, 7)} ${note}`.slice(0, 1000),
      "--non-interactive",
    ],
    env: {
      // Forces the Production target in app.config.ts, so a stray staging
      // .env value can never be judged by the staging rules.
      EAS_UPDATE_CHANNEL: PRODUCTION.channel,
      EXPO_PUBLIC_OVERLOAD_ENV: PRODUCTION.environment,
      EXPO_PUBLIC_SOURCE_COMMIT: repo.sha,
    },
  };
}

export type ProductionBuildSummary = {
  status: string;
  buildProfile: string | null;
  channel: string | null;
  runtimeVersion: string | null;
};

/** Finished Production builds an update with this runtime would reach. */
export function receivingProductionBuilds(
  runtime: string,
  builds: readonly ProductionBuildSummary[],
): ProductionBuildSummary[] {
  return builds.filter(
    (b) =>
      b.status === "FINISHED" &&
      b.buildProfile === PRODUCTION.profile &&
      b.channel === PRODUCTION.channel &&
      b.runtimeVersion === runtime,
  );
}
