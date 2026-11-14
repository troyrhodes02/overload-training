import type { AppConfigDto } from "@overload/shared/contracts/app-config";
import type { MeDto } from "@overload/shared/contracts/account";
import type { ApiError } from "../api/errors";
import type { SessionStatus } from "../auth/session";

/**
 * The root gate machine (spec §5; design §4). Pure: the root layout feeds it
 * the current inputs and renders exactly one gate, or the navigator.
 */
export type Gate =
  | "misconfigured"
  | "launching"
  | "update_required"
  | "maintenance"
  | "staging_access"
  | "unreachable"
  | "signed_out"
  | "suspended"
  | "signed_in";

export type Loadable<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "error"; error: ApiError; data?: T }
  | { status: "success"; data: T; error?: undefined };

export type GateInput = {
  envOk: boolean;
  config: Loadable<AppConfigDto>;
  session: SessionStatus;
  me: Loadable<MeDto> | "idle";
  appVersion: string;
  upgradeRequiredSeen: boolean;
};

/** Strict MAJOR.MINOR.PATCH comparison; an unparsable version sorts lowest. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [-1, -1, -1];
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

export function decideGate(i: GateInput): Gate {
  if (!i.envOk) return "misconfigured";

  const config = i.config.data;
  if (i.session === "restoring") return "launching";
  if (!config && i.config.status === "loading") return "launching";

  if (
    i.upgradeRequiredSeen ||
    (config && compareVersions(i.appVersion, config.minimumAppVersion) < 0)
  ) {
    return "update_required";
  }
  if (config?.killSwitches.maintenance) return "maintenance";

  const me = i.me === "idle" ? null : i.me;
  if (
    i.config.error?.code === "staging_protected" ||
    me?.error?.code === "staging_protected"
  ) {
    return "staging_access";
  }

  if (i.session === "none") return config ? "signed_out" : "unreachable";

  if (me?.error?.code === "account_suspended") return "suspended";
  if (!me || (me.status === "loading" && !me.data)) return "launching";
  if (me.status === "error" && !me.data) return "unreachable";
  return "signed_in";
}
