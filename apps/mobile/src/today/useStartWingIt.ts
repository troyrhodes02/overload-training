import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import type { WingItTodayDto } from "@overload/shared/contracts/views";
import {
  WING_IT_COPY,
  wingItBlockedMessage,
  wingItBlockedResume,
} from "@overload/shared/logging/wing-it";
import { useFetchGyms, useStartWingIt } from "../api/training";
import { ApiError } from "../api/errors";
import { workoutHref } from "../workout/routes";
import {
  chooseGym,
  pickGymFromSheet,
  type StartState,
} from "./useStartWorkout";

/**
 * Start or resume a Wing-It workout from Today (Pitch 25 design §6.5, §15).
 *
 * - Open: the server already has it, so it opens; nothing is sent.
 * - Blocked: another workout is in progress with saved sets. The lifter is
 *   told which, with Resume first (a system alert); nothing is started or
 *   discarded. The server refuses the same way (409) if Today was stale.
 * - Start: the planned start's gym rule — one active gym is used, two or
 *   more open the action sheet, none is refused before any request.
 *
 * Safe to repeat: the server keeps one open Wing-It workout per account, and
 * a synchronous guard drops a second tap while one is in flight.
 */
export type BlockedChoice = "resume" | "cancel";

export function askAboutBlocked(sessionName: string): Promise<BlockedChoice> {
  return new Promise((resolve) =>
    Alert.alert(
      "A workout is in progress",
      wingItBlockedMessage(sessionName),
      [
        {
          text: wingItBlockedResume(sessionName),
          onPress: () => resolve("resume"),
        },
        { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
      ],
      { cancelable: true, onDismiss: () => resolve("cancel") },
    ),
  );
}

/** The workout a 409 names, from the server's details. */
export function blockedFrom(
  error: unknown,
): { loggedSessionId: string; sessionName: string } | null {
  if (!(error instanceof ApiError) || error.code !== "conflict") return null;
  const id = error.details?.loggedSessionId;
  const name = error.details?.sessionName;
  return id && name ? { loggedSessionId: id, sessionName: name } : null;
}

export function useStartWingItWorkout(
  pick: (names: string[]) => Promise<number | null> = pickGymFromSheet,
  ask: typeof askAboutBlocked = askAboutBlocked,
) {
  const fetchGyms = useFetchGyms();
  const start = useStartWingIt();
  const [state, setState] = useState<StartState>({ kind: "idle" });
  const busy = useRef(false);

  function release(afterPush = false) {
    if (!afterPush) {
      busy.current = false;
      return;
    }
    // Long enough to cover a double tap while the screen pushes.
    setTimeout(() => {
      busy.current = false;
    }, 800);
  }

  async function resumeBlocked(blocked: {
    loggedSessionId: string;
    sessionName: string;
  }) {
    const choice = await ask(blocked.sessionName);
    if (choice === "resume") {
      router.push(workoutHref(blocked.loggedSessionId));
      return true;
    }
    return false;
  }

  async function run(wingIt: WingItTodayDto | undefined) {
    if (busy.current) return;
    busy.current = true;
    if (wingIt?.open) {
      router.push(workoutHref(wingIt.open.loggedSessionId));
      release(true);
      return;
    }
    if (wingIt?.blockedBy) {
      release(await resumeBlocked(wingIt.blockedBy));
      return;
    }
    setState({ kind: "busy" });
    try {
      const { gyms } = await fetchGyms();
      if (gyms.length === 0) {
        setState({ kind: "no_gym" });
        release();
        return;
      }
      const gym = await chooseGym(gyms, pick);
      if (!gym) {
        setState({ kind: "idle" });
        release();
        return;
      }
      const { loggedSessionId } = await start.mutateAsync({ gymId: gym.id });
      setState({ kind: "idle" });
      router.push(workoutHref(loggedSessionId));
      release(true);
    } catch (error) {
      const blocked = blockedFrom(error);
      if (blocked) {
        setState({ kind: "idle" });
        release(await resumeBlocked(blocked));
        return;
      }
      setState({
        kind: "error",
        message:
          error instanceof ApiError ? error.message : WING_IT_COPY.startFailed,
      });
      release();
    }
  }

  /** Forget a "no gym yet" note when Today comes back into view. */
  const clearNoGym = useCallback(
    () => setState((s) => (s.kind === "no_gym" ? { kind: "idle" } : s)),
    [],
  );

  return { state, run, clearNoGym };
}
