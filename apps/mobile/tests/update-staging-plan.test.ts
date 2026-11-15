import {
  planStagingUpdate,
  receivingBuilds,
} from "../scripts/update-staging-plan";

const SHA = "30b8bb57b8cdba31c41aaba1e75df31625276856";
const clean = {
  status: "",
  remoteBranches: "  origin/feature/21d-app-shell-design-system-accounts",
  sha: SHA,
  subject: "OVE-186: Diagnostics only in staging builds",
};

describe("planStagingUpdate", () => {
  it("publishes a clean, pushed commit to staging, iOS only, stamped with the commit", () => {
    const plan = planStagingUpdate(clean, []);
    expect(plan).toEqual({
      ok: true,
      args: [
        "update",
        "--channel",
        "staging",
        "--environment",
        "development",
        "--platform",
        "ios",
        "--message",
        "30b8bb5 OVE-186: Diagnostics only in staging builds",
        "--non-interactive",
      ],
      env: { EAS_UPDATE_CHANNEL: "staging", EXPO_PUBLIC_SOURCE_COMMIT: SHA },
    });
  });

  it("prefixes a given message with the commit", () => {
    const plan = planStagingUpdate(clean, ["--message", "Checkpoint C retry"]);
    expect(plan.ok && plan.args).toContain("30b8bb5 Checkpoint C retry");
  });

  it("refuses uncommitted changes (the stale update came from a dirty tree)", () => {
    const plan = planStagingUpdate(
      { ...clean, status: " M src/app/_layout.tsx" },
      [],
    );
    expect(plan.ok).toBe(false);
  });

  it("refuses a commit that isn't pushed", () => {
    expect(planStagingUpdate({ ...clean, remoteBranches: "" }, []).ok).toBe(
      false,
    );
  });

  it("refuses any attempt to pick another channel, branch, or Production", () => {
    for (const args of [
      ["--channel", "production"],
      ["--branch", "main"],
      ["--environment=production"],
      ["--auto"],
      ["-p", "all"],
      ["--message", "to production"],
    ]) {
      expect(planStagingUpdate(clean, args).ok).toBe(false);
    }
  });
});

describe("receivingBuilds", () => {
  const build = {
    status: "FINISHED",
    buildProfile: "development",
    channel: "staging",
    runtimeVersion: "f98506f78acfef2f8bfc764d2e31f16475e2f501",
  };
  it("finds the staging development build with the same runtime", () => {
    expect(receivingBuilds(build.runtimeVersion, [build])).toHaveLength(1);
  });
  it("finds none when the fingerprint changed (a package.json script edit is enough)", () => {
    expect(
      receivingBuilds("923728ab2af6b88297277c5f7b217011826af522", [build]),
    ).toHaveLength(0);
  });
  it("ignores unfinished builds and other channels", () => {
    expect(
      receivingBuilds(build.runtimeVersion, [
        { ...build, status: "ERRORED" },
        { ...build, channel: "production" },
      ]),
    ).toHaveLength(0);
  });
});
