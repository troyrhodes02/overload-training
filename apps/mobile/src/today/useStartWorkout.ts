import { useRef, useState } from "react";
import { ActionSheetIOS } from "react-native";
import { router } from "expo-router";
import type { DashboardTodayDto } from "@overload/shared/contracts/logging";
import type { GymListItemDto as GymDto } from "@overload/shared/contracts/gyms";
import { useFetchGyms, useStartWorkout } from "../api/training";
import { ApiError } from "../api/errors";
import { workoutHref } from "../workout/routes";

/**
 * Start or resume the day's workout (Pitch 21e design W0; spec RD-4).
 *
 * - Resume: the server already has the workout, so it opens; nothing is sent.
 * - Start: the server's start rule needs a gym. One active gym is used; two or
 *   more open an action sheet; none is refused before any request.
 *
 * The server keys a workout by (session, date), so a repeated Start returns
 * the same workout. The button is disabled while a start is in flight.
 */
export type StartState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "no_gym" }
  | { kind: "error"; message: string };

export function chooseGym(
  gyms: readonly GymDto[],
  pick: (names: string[]) => Promise<number | null>,
): Promise<GymDto | null> {
  if (gyms.length === 0) return Promise.resolve(null);
  if (gyms.length === 1) return Promise.resolve(gyms[0]);
  return pick(gyms.map((g) => g.name)).then((i) =>
    i === null ? null : (gyms[i] ?? null),
  );
}

/** The native action sheet "Where are you training?" (design §15 T1). */
export function pickGymFromSheet(names: string[]): Promise<number | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Where are you training?",
        options: [...names, "Cancel"],
        cancelButtonIndex: names.length,
      },
      (index) => resolve(index < names.length ? index : null),
    );
  });
}

export function useStartOrResume(
  pick: (names: string[]) => Promise<number | null> = pickGymFromSheet,
) {
  const fetchGyms = useFetchGyms();
  const start = useStartWorkout();
  const [state, setState] = useState<StartState>({ kind: "idle" });
  // A synchronous guard (review #4): a second tap before the re-render can
  // neither start twice nor push the workout twice.
  const busy = useRef(false);

  async function run(day: DashboardTodayDto) {
    if (busy.current) return;
    busy.current = true;
    if (day.loggedSessionId) {
      router.push(workoutHref(day.loggedSessionId));
      // Long enough to cover a double tap while the screen pushes.
      setTimeout(() => {
        busy.current = false;
      }, 800);
      return;
    }
    setState({ kind: "busy" });
    try {
      const { gyms } = await fetchGyms();
      if (gyms.length === 0) {
        setState({ kind: "no_gym" });
        return;
      }
      const gym = await chooseGym(gyms, pick);
      if (!gym) {
        setState({ kind: "idle" });
        return;
      }
      const { loggedSessionId } = await start.mutateAsync({
        sessionId: day.sessionId,
        scheduledFor: day.scheduledFor,
        gymId: gym.id,
      });
      setState({ kind: "idle" });
      router.push(workoutHref(loggedSessionId));
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Couldn't start the workout. Nothing was changed.",
      });
    } finally {
      busy.current = false;
    }
  }

  return { state, run };
}
