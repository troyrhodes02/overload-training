/** Pitch 21d spec §5: the root gate machine, every rule and its order. */
import type { AppConfigDto } from "@overload/shared/contracts/app-config";
import type { MeDto } from "@overload/shared/contracts/account";
import { ApiError } from "../src/api/errors";
import {
  compareVersions,
  decideGate,
  type GateInput,
} from "../src/app-state/gate";

const config = (over: Partial<AppConfigDto> = {}): AppConfigDto => ({
  minimumAppVersion: "0.0.0",
  latestAppVersion: "0.0.0",
  killSwitches: { planImportEnabled: false, maintenance: false },
  signupMode: "public",
  botChallenge: null,
  supportEmail: null,
  ...over,
});
const me = {} as MeDto;
const err = (
  code: ConstructorParameters<typeof ApiError>[0],
  status: number | null = null,
) => new ApiError(code, "x", status);

const base: GateInput = {
  envOk: true,
  config: { status: "success", data: config() },
  session: "present",
  me: { status: "success", data: me },
  appVersion: "0.1.0",
  upgradeRequiredSeen: false,
};

describe("decideGate", () => {
  it("signed in when everything is ready", () => {
    expect(decideGate(base)).toBe("signed_in");
  });

  it("1. a misconfigured build makes no further decision", () => {
    expect(
      decideGate({ ...base, envOk: false, upgradeRequiredSeen: true }),
    ).toBe("misconfigured");
  });

  it("2. launching while the session restores, or the first config loads", () => {
    expect(decideGate({ ...base, session: "restoring" })).toBe("launching");
    expect(decideGate({ ...base, config: { status: "loading" } })).toBe(
      "launching",
    );
  });

  it("3. update required from the minimum version or any 426, before maintenance", () => {
    expect(
      decideGate({
        ...base,
        config: {
          status: "success",
          data: config({
            minimumAppVersion: "0.2.0",
            killSwitches: { planImportEnabled: false, maintenance: true },
          }),
        },
      }),
    ).toBe("update_required");
    expect(decideGate({ ...base, upgradeRequiredSeen: true })).toBe(
      "update_required",
    );
    expect(
      decideGate({
        ...base,
        config: {
          status: "success",
          data: config({ minimumAppVersion: "0.1.0" }),
        },
      }),
    ).toBe("signed_in");
  });

  it("4. maintenance blocks signed-in and signed-out alike", () => {
    const m = {
      status: "success" as const,
      data: config({
        killSwitches: { planImportEnabled: false, maintenance: true },
      }),
    };
    expect(decideGate({ ...base, config: m })).toBe("maintenance");
    expect(
      decideGate({ ...base, config: m, session: "none", me: "idle" }),
    ).toBe("maintenance");
  });

  it("5. a Vercel protection page asks for staging access, never signs out", () => {
    expect(
      decideGate({
        ...base,
        config: { status: "error", error: err("staging_protected") },
        session: "none",
        me: "idle",
      }),
    ).toBe("staging_access");
    expect(
      decideGate({
        ...base,
        me: { status: "error", error: err("staging_protected") },
      }),
    ).toBe("staging_access");
  });

  it("6–7. signed out needs the config; without it the app is unreachable", () => {
    expect(decideGate({ ...base, session: "none", me: "idle" })).toBe(
      "signed_out",
    );
    expect(
      decideGate({
        ...base,
        session: "none",
        me: "idle",
        config: { status: "error", error: err("network") },
      }),
    ).toBe("unreachable");
  });

  it("a flaky config never blocks a signed-in lifter who can reach me", () => {
    expect(
      decideGate({
        ...base,
        config: { status: "error", error: err("unavailable", 503) },
      }),
    ).toBe("signed_in");
  });

  it("8. a suspended account gets its own gate", () => {
    expect(
      decideGate({
        ...base,
        me: { status: "error", error: err("account_suspended", 403) },
      }),
    ).toBe("suspended");
  });

  it("9–10. me loading is launching; me failing temporarily is unreachable, not signed out", () => {
    expect(decideGate({ ...base, me: { status: "loading" } })).toBe(
      "launching",
    );
    for (const code of ["network", "unavailable", "internal_error"] as const) {
      expect(
        decideGate({ ...base, me: { status: "error", error: err(code, 503) } }),
      ).toBe("unreachable");
    }
    // A refetch failure with data still cached keeps the shell up.
    expect(
      decideGate({
        ...base,
        me: { status: "error", error: err("network"), data: me },
      }),
    ).toBe("signed_in");
  });
});

describe("compareVersions", () => {
  it("compares MAJOR.MINOR.PATCH numerically; junk sorts lowest", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "0.0.0")).toBe(-1);
  });
});
