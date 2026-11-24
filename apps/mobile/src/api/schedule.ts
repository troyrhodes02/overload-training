import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  RescheduleWorkoutRequest,
  RescheduleWorkoutResponseDto,
  SkipUpcomingWorkoutRequest,
  SkipUpcomingWorkoutResponseDto,
  ThisWeekResponseDto,
} from "@overload/shared/contracts/schedule";
import { useApi } from "./ApiProvider";
import type { ApiError } from "./errors";
import { invalidateTraining, OVERVIEW_STALE_MS } from "./training";

/**
 * This week's schedule on Today (OVE-241; chore spec §2–§3). The server is
 * the only authority: which day holds which workout, what can move, and why
 * not all come from the released OVE-240 modules. The phone never moves a
 * workout itself and never reports a change before the server confirms it.
 */

export const SCHEDULE_KEYS = { thisWeek: ["this-week"] as const };

const enc = encodeURIComponent;

/** S1 `GET /this-week`. */
export function useThisWeek() {
  const api = useApi();
  return useQuery<ThisWeekResponseDto, ApiError>({
    queryKey: SCHEDULE_KEYS.thisWeek,
    queryFn: ({ signal }) =>
      api.request<ThisWeekResponseDto>("/this-week", { signal }),
    staleTime: OVERVIEW_STALE_MS,
  });
}

/** Every read a schedule change moves: Today, its calls, the week, History, Plan. */
export function invalidateSchedule(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: SCHEDULE_KEYS.thisWeek }),
    invalidateTraining(client),
  ]).then(() => undefined);
}

/** S2 skip a workout before its day. */
export function useSkipUpcomingWorkout() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    SkipUpcomingWorkoutResponseDto,
    ApiError,
    { mesocycleId: string; body: SkipUpcomingWorkoutRequest }
  >({
    mutationFn: ({ mesocycleId, body }) =>
      api.request<SkipUpcomingWorkoutResponseDto>(
        `/mesocycles/${enc(mesocycleId)}/schedule/skip`,
        { method: "POST", body },
      ),
    onSettled: () => invalidateSchedule(client),
  });
}

/** S3 Train today, or swap two days (or a workout and a rest day). */
export function useMoveWorkout() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    RescheduleWorkoutResponseDto,
    ApiError,
    { mesocycleId: string; body: RescheduleWorkoutRequest }
  >({
    mutationFn: ({ mesocycleId, body }) =>
      api.request<RescheduleWorkoutResponseDto>(
        `/mesocycles/${enc(mesocycleId)}/schedule/move`,
        { method: "POST", body },
      ),
    onSettled: () => invalidateSchedule(client),
  });
}
