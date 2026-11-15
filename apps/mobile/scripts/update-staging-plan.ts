/**
 * The rules for publishing a staging over-the-air update (21d Checkpoint C),
 * kept pure so they are tested. The runner is scripts/update-staging.ts.
 *
 * Why: the staging update the iPhone opened was published from an older
 * commit with uncommitted changes, so it lacked the navigation fixes and
 * nobody could tell. A publish now comes only from a clean, pushed commit,
 * and the bundle carries that commit for Diagnostics.
 */
export type RepoState = {
  /** `git status --porcelain` output. */
  status: string;
  /** Remote branches containing HEAD (`git branch -r --contains HEAD`). */
  remoteBranches: string;
  sha: string;
  subject: string;
};

export type PublishPlan =
  | { ok: true; args: string[]; env: Record<string, string> }
  | { ok: false; problems: string[] };

/** The only channel, branch, environment, and platform a 21d update targets. */
export const STAGING = {
  channel: "staging",
  environment: "development",
  platform: "ios",
} as const;

export function planStagingUpdate(
  repo: RepoState,
  extraArgs: readonly string[],
): PublishPlan {
  const problems: string[] = [];
  if (repo.status.trim() !== "") {
    problems.push(
      "The working tree has uncommitted changes. Commit and push them first, so the update is exactly a commit.",
    );
  }
  if (repo.remoteBranches.trim() === "") {
    problems.push(
      "HEAD is not on GitHub yet. Push it first, so the update's commit can be found.",
    );
  }
  if (!/^[0-9a-f]{40}$/.test(repo.sha)) {
    problems.push("HEAD is not a commit.");
  }
  // Only a message may be passed. Everything else (where the update goes,
  // and what it bundles: --skip-bundler, --input-dir) is fixed here, so the
  // update is always a fresh export of HEAD.
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
  if (note !== undefined && note.trim() === "") {
    problems.push("--message needs text.");
  }
  if (note && /production/i.test(note)) {
    problems.push("The message names Production. Staging updates only.");
  }
  if (problems.length > 0) return { ok: false, problems };

  const short = repo.sha.slice(0, 7);
  return {
    ok: true,
    args: [
      "update",
      "--channel",
      STAGING.channel,
      "--environment",
      STAGING.environment,
      "--platform",
      STAGING.platform,
      "--message",
      `${short} ${note ?? repo.subject}`.slice(0, 1000),
      "--non-interactive",
    ],
    env: {
      EAS_UPDATE_CHANNEL: STAGING.channel,
      EXPO_PUBLIC_SOURCE_COMMIT: repo.sha,
    },
  };
}

export type BuildSummary = {
  status: string;
  buildProfile: string | null;
  channel: string | null;
  runtimeVersion: string | null;
};

/**
 * An update reaches only builds with the same runtime (the native
 * fingerprint). Refuse a publish no installed development build can receive,
 * because it would succeed and change nothing on the phone.
 */
export function receivingBuilds(
  runtime: string,
  builds: readonly BuildSummary[],
): BuildSummary[] {
  return builds.filter(
    (b) =>
      b.status === "FINISHED" &&
      b.buildProfile === "development" &&
      b.channel === STAGING.channel &&
      b.runtimeVersion === runtime,
  );
}
