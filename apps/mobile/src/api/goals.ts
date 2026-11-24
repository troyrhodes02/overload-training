import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AcknowledgeGoalResponseDto,
  ArchiveGoalResponseDto,
  GoalDetailDto,
  GoalHistoryListDto,
  GoalsOverviewDto,
} from "@overload/shared/contracts/goals";
import { useApi } from "./ApiProvider";
import type { ApiError } from "./errors";
import { OVERVIEW_STALE_MS } from "./training";

/**
 * Goals & Exercise History's reads and writes (Pitch 21i spec §7, data
 * layer). The server is the only authority: every percent, best session,
 * record, and trend point comes from the mobile API as the web computes it,
 * and the goal reads run the web's completion check first. Nothing is stored
 * on the device; `clearAccountQueries` removes all of it on sign-out.
 */

export const GOAL_KEYS = {
  overview: ["goals"] as const,
  history: ["goals-history"] as const,
  /** One goal (prefix `["goal"]` for invalidation). */
  goal: (goalId: string) => ["goal", goalId] as const,
  /** Every exercise-history read (prefix for invalidation; Pitch 21i E8). */
  exerciseHistoryAll: ["exercise-history"] as const,
  /** Every goal-form context (prefix for invalidation; Pitch 21i E7). */
  goalFormAll: ["goal-form"] as const,
};

const enc = encodeURIComponent;

/** E1 `GET /goals`: reached cards, active goals, the history count. */
export function useGoals() {
  const api = useApi();
  return useQuery<GoalsOverviewDto, ApiError>({
    queryKey: GOAL_KEYS.overview,
    queryFn: ({ signal }) =>
      api.request<GoalsOverviewDto>("/goals", { signal }),
    staleTime: OVERVIEW_STALE_MS,
  });
}

/** E2 `GET /goals/history`. */
export function useGoalHistory() {
  const api = useApi();
  return useQuery<GoalHistoryListDto, ApiError>({
    queryKey: GOAL_KEYS.history,
    queryFn: ({ signal }) =>
      api.request<GoalHistoryListDto>("/goals/history", { signal }),
    staleTime: OVERVIEW_STALE_MS,
  });
}

/** E3 `GET /goals/{goalId}`. */
export function useGoal(goalId: string) {
  const api = useApi();
  return useQuery<GoalDetailDto, ApiError>({
    queryKey: GOAL_KEYS.goal(goalId),
    queryFn: ({ signal }) =>
      api.request<GoalDetailDto>(`/goals/${enc(goalId)}`, { signal }),
    staleTime: OVERVIEW_STALE_MS,
  });
}

/**
 * Every read a goal write (or a training write) can change: the goal reads,
 * the goal form contexts, and every exercise history (its goals section).
 * `refetch: false` only marks them stale, so a screen re-reads when it is
 * next shown (Pitch 21i RD-13).
 */
export function invalidateGoalReads(
  client: QueryClient,
  opts: { refetch?: boolean } = {},
): Promise<void> {
  const how = opts.refetch === false ? { refetchType: "none" as const } : {};
  return Promise.all([
    client.invalidateQueries({ queryKey: GOAL_KEYS.overview, ...how }),
    client.invalidateQueries({ queryKey: GOAL_KEYS.history, ...how }),
    client.invalidateQueries({ queryKey: ["goal"], ...how }),
    client.invalidateQueries({ queryKey: GOAL_KEYS.goalFormAll, ...how }),
    client.invalidateQueries({
      queryKey: GOAL_KEYS.exerciseHistoryAll,
      ...how,
    }),
  ]).then(() => undefined);
}

/** E5 `PUT /goals/{goalId}/archived`: no undo (Goals R9). */
export function useArchiveGoal() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<ArchiveGoalResponseDto, ApiError, { goalId: string }>({
    mutationFn: ({ goalId }) =>
      api.request<ArchiveGoalResponseDto>(`/goals/${enc(goalId)}/archived`, {
        method: "PUT",
        body: { archived: true },
      }),
    onSettled: () => invalidateGoalReads(client),
  });
}

/** E6 `PUT /goals/{goalId}/acknowledged`: the reached card is seen. */
export function useAcknowledgeGoal() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<AcknowledgeGoalResponseDto, ApiError, { goalId: string }>({
    mutationFn: ({ goalId }) =>
      api.request<AcknowledgeGoalResponseDto>(
        `/goals/${enc(goalId)}/acknowledged`,
        { method: "PUT", body: { acknowledged: true } },
      ),
    onSettled: () => invalidateGoalReads(client),
  });
}
