/**
 * Diagnostics' "Updates" facts (Checkpoint C). On the iPhone, the update the
 * launcher opened was indistinguishable from the next publish, and a Metro
 * launch read "Update ?".
 */
import { describeRunningBundle } from "../src/diagnostics/running-bundle";

const base = {
  dev: false,
  isEmbeddedLaunch: false,
  updateId: "01a1dbb6-dd01-7ece-9836-7dd06967a365",
  manifest: {
    id: "01a1dbb6-dd01-7ece-9836-7dd06967a365",
    metadata: {
      updateGroup: "60fd1959-122c-45e1-ba69-3b1d3eb0cd9e",
      branchName: "staging",
    },
  },
  channel: "",
  createdAt: new Date("2026-11-14T20:19:16.865Z"),
  commit: "30B8BB57b8cdba31c41aaba1e75df31625276856",
};

describe("describeRunningBundle", () => {
  it("an update the dev launcher opened by URL: group, commit, time, and why the channel is empty", () => {
    expect(describeRunningBundle(base)).toEqual({
      source: "EAS update",
      updateGroup: "60fd1959",
      commit: "30b8bb5",
      published: "2026-11-14 20:19 UTC",
      channel: "Not set (opened by URL)",
    });
  });

  it("an update the build fetched itself reports its channel", () => {
    expect(describeRunningBundle({ ...base, channel: "staging" }).channel).toBe(
      "staging",
    );
  });

  it("a Metro bundle says so and claims no update", () => {
    expect(
      describeRunningBundle({ ...base, dev: true, updateId: null }),
    ).toEqual({
      source: "Metro (development)",
      updateGroup: "—",
      commit: "30b8bb5",
      published: "—",
      channel: "—",
    });
  });

  it("an embedded bundle claims no update", () => {
    const r = describeRunningBundle({
      ...base,
      isEmbeddedLaunch: true,
      commit: null,
    });
    expect(r.source).toBe("Embedded bundle");
    expect(r.updateGroup).toBe("—");
    expect(r.commit).toBe("—");
  });

  it("shows only a commit hash, never arbitrary text", () => {
    expect(describeRunningBundle({ ...base, commit: "not a sha" }).commit).toBe(
      "—",
    );
    expect(describeRunningBundle({ ...base, manifest: null }).updateGroup).toBe(
      "—",
    );
  });
});
