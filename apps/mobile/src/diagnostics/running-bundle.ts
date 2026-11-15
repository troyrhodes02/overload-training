/**
 * What JavaScript is running, for Diagnostics (design M3) and Checkpoint C.
 *
 * A development build runs one of three bundles, and each reports expo-updates
 * differently:
 *   - Metro (`__DEV__`): no update id at all;
 *   - an EAS update the dev launcher opened by URL: an update id and a
 *     manifest with `metadata.updateGroup`, but no channel, because the
 *     launcher configures expo-updates from the URL, not from the build;
 *   - an embedded bundle (a release build): `isEmbeddedLaunch`.
 * The update group (random) identifies a publish; the update id's first
 * characters are a timestamp and look alike from one publish to the next.
 */
export type RunningBundleInput = {
  dev: boolean;
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  manifest: unknown;
  channel: string | null;
  createdAt: Date | null;
  commit: string | null;
};

export type RunningBundle = {
  source: "Metro (development)" | "EAS update" | "Embedded bundle";
  updateGroup: string;
  channel: string;
  published: string;
  commit: string;
};

const NONE = "—";
const SHA = /^[0-9a-f]{7,40}$/;

function updateGroupOf(manifest: unknown): string | null {
  if (typeof manifest !== "object" || manifest === null) return null;
  const metadata = (manifest as { metadata?: unknown }).metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const group = (metadata as { updateGroup?: unknown }).updateGroup;
  return typeof group === "string" && group.length > 0 ? group : null;
}

export function describeRunningBundle(i: RunningBundleInput): RunningBundle {
  const source = i.dev
    ? "Metro (development)"
    : i.isEmbeddedLaunch || !i.updateId
      ? "Embedded bundle"
      : "EAS update";
  const fromUpdate = source === "EAS update";
  const group = fromUpdate ? updateGroupOf(i.manifest) : null;
  const commit = i.commit?.trim().toLowerCase() ?? "";
  return {
    source,
    updateGroup: group ? group.slice(0, 8) : NONE,
    channel: i.channel?.trim()
      ? i.channel.trim()
      : fromUpdate
        ? "Not set (opened by URL)"
        : NONE,
    published:
      fromUpdate && i.createdAt
        ? `${i.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
        : NONE,
    // Stamped by `npm run update:staging`; a Metro bundle has none.
    commit: SHA.test(commit) ? commit.slice(0, 7) : NONE,
  };
}
