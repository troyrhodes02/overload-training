import type { AppConfigDto } from "@overload/shared/contracts/app-config";
import {
  compareAppVersions,
  parseAppVersion,
} from "@overload/shared/mobile/app-version";
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

/** A TanStack query result as the gate machine reads it. */
export function toLoadable<T>(q: {
  status: "pending" | "error" | "success";
  data: T | undefined;
  error: unknown;
}): Loadable<T> {
  if (q.status === "success" && q.data !== undefined)
    return { status: "success", data: q.data };
  if (q.status === "error")
    return { status: "error", error: q.error as ApiError, data: q.data };
  return { status: "loading" };
}

export type GateInput = {
  envOk: boolean;
  config: Loadable<AppConfigDto>;
  session: SessionStatus;
  me: Loadable<MeDto> | "idle";
  appVersion: string;
  upgradeRequiredSeen: boolean;
  /**
   * Whether this build may ask for the staging access key (staging only).
   * When it can't, a Vercel protection answer is just "unreachable" (21l
   * RD-27): Production never shows the staging access screen.
   */
  stagingAccess?: boolean;
};

/**
 * The API's own version rule (shared, review #10): -1 when `a` is older than
 * `b`. An unparsable app version counts as older than any minimum, which is
 * also what the API answers (it refuses a malformed header).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const x = parseAppVersion(a);
  const y = parseAppVersion(b);
  if (!x) return y ? -1 : 0;
  if (!y) return 1;
  return compareAppVersions(x, y);
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
    return i.stagingAccess === false ? "unreachable" : "staging_access";
  }

  if (i.session === "none") return config ? "signed_out" : "unreachable";

  if (me?.error?.code === "account_suspended") return "suspended";
  if (!me || (me.status === "loading" && !me.data)) return "launching";
  // A refused account is being confirmed (OVE-255 #2): it ends in sign-out
  // or recovers, so it is never "unreachable" meanwhile.
  if (me.status === "error" && !me.data && me.error.code === "unauthorized") {
    return "launching";
  }
  if (me.status === "error" && !me.data) return "unreachable";
  return "signed_in";
}
