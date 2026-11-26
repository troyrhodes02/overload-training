/**
 * Pitch 21l (review #1; runbook §8): a Production update is a human step, made
 * hard to get wrong. Only released source, only the production channel, the
 * Production environment forced, and only for a matching Production build.
 */
import {
  planProductionUpdate,
  receivingProductionBuilds,
} from "../scripts/update-production-plan";

const SHA = "4aacae7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const released = {
  status: "",
  remoteBranches:
    "  origin/HEAD -> origin/main\n  origin/main\n  origin/staging",
  sha: SHA,
  subject: "Release: Pitch 21l",
};

describe("planProductionUpdate", () => {
  it("publishes a released commit to production, iOS only, with the Production target forced", () => {
    expect(
      planProductionUpdate(released, ["--message", "Fix the summary"]),
    ).toEqual({
      ok: true,
      args: [
        "update",
        "--channel",
        "production",
        "--environment",
        "production",
        "--platform",
        "ios",
        "--message",
        "4aacae7 Fix the summary",
        "--non-interactive",
      ],
      env: {
        EAS_UPDATE_CHANNEL: "production",
        EXPO_PUBLIC_OVERLOAD_ENV: "production",
        EXPO_PUBLIC_SOURCE_COMMIT: SHA,
      },
    });
  });

  it("refuses a commit that isn't on origin/main (staging or a feature branch)", () => {
    const plan = planProductionUpdate(
      { ...released, remoteBranches: "  origin/staging\n  origin/feature/x" },
      ["--message", "x"],
    );
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.problems.join(" ")).toMatch(/origin\/main/);
  });

  it("refuses a dirty tree, a missing message, a message naming staging, and any other flag", () => {
    expect(
      planProductionUpdate({ ...released, status: " M a.ts" }, ["-m", "x"]).ok,
    ).toBe(false);
    expect(planProductionUpdate(released, []).ok).toBe(false);
    expect(planProductionUpdate(released, ["-m", "staging retry"]).ok).toBe(
      false,
    );
    const flags = planProductionUpdate(released, [
      "-m",
      "x",
      "--channel",
      "staging",
    ]);
    expect(!flags.ok && flags.problems.join(" ")).toMatch(
      /refused: --channel staging/,
    );
  });
});

describe("receivingProductionBuilds", () => {
  const b = (over: object) => ({
    status: "FINISHED",
    buildProfile: "production",
    channel: "production",
    runtimeVersion: "e8a58a870a",
    ...over,
  });
  it("only finished production-channel builds of the same runtime", () => {
    expect(
      receivingProductionBuilds("e8a58a870a", [
        b({}),
        b({ status: "ERRORED" }),
        b({ buildProfile: "development", channel: "staging" }),
        b({ runtimeVersion: "2e4a65d9cd" }),
      ]),
    ).toHaveLength(1);
    expect(
      receivingProductionBuilds("2e4a65d9cd", [
        b({
          buildProfile: "development",
          channel: "staging",
          runtimeVersion: "2e4a65d9cd",
        }),
      ]),
    ).toEqual([]);
  });
});
