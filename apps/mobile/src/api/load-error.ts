import type { SymbolViewProps } from "expo-symbols";
import { diagnosticsAvailable } from "../diagnostics/availability";
import { ApiError } from "./errors";

export type LoadErrorView = {
  icon: SymbolViewProps["name"];
  title: string;
  message: string;
  /** Staging builds only: what failed, for a tester (never a token or body). */
  technical: string | null;
};

/**
 * What a failed READ tells the lifter (Pitch 21e Checkpoint A, OVE-203). One
 * description for every screen, so a failure is never presented as content:
 * the API's catch-all "There's nothing here." for a route this server lacks
 * became History's explanation at Checkpoint A.
 *
 * - no connection;
 * - the server not answering as the API (5xx, protection, not JSON);
 * - signed out (the session gate normally takes over first);
 * - this server lacks the screen: a 404 on a read that has no id, so the
 *   app is newer than the server it talks to;
 * - anything else: the server's own message, written to be shown.
 *
 * A successful empty answer is NOT an error and never comes here.
 */
export function describeLoadError(
  error: unknown,
  what: { subject: string; request: string; byId?: boolean },
  showTechnical: boolean = diagnosticsAvailable(),
): LoadErrorView {
  const e =
    error instanceof ApiError
      ? error
      : new ApiError("unavailable", "Overload isn't responding right now.");
  const technical = showTechnical
    ? `${what.request} → ${e.status ?? "no answer"} ${e.code}`
    : null;
  const base = { technical };
  if (e.code === "network") {
    return {
      ...base,
      icon: "wifi.exclamationmark",
      title: "Can't reach Overload",
      message: `${what.subject} needs a connection. Check your signal or Wi-Fi and try again.`,
    };
  }
  if (e.code === "signed_out" || e.code === "unauthorized") {
    return {
      ...base,
      icon: "person.crop.circle.badge.exclamationmark",
      title: "You're signed out",
      message: "Sign in again to see this.",
    };
  }
  if (e.code === "not_found" && !what.byId) {
    return {
      ...base,
      icon: "arrow.triangle.2.circlepath",
      title: `${what.subject} isn't available from this server`,
      message:
        "This version of the app is newer than the server it's talking to. Nothing is wrong with your data.",
    };
  }
  if (e.code === "not_found") {
    return {
      ...base,
      icon: "questionmark.circle",
      title: "This workout isn't available.",
      message: "It may have been removed, or it isn't yours.",
    };
  }
  if (e.temporary) {
    return {
      ...base,
      icon: "exclamationmark.icloud",
      title: "Overload isn't responding",
      message: `${what.subject} couldn't load. Try again in a moment.`,
    };
  }
  return {
    ...base,
    icon: "exclamationmark.triangle",
    title: `Couldn't load ${what.subject.toLowerCase()}`,
    message: e.message,
  };
}
