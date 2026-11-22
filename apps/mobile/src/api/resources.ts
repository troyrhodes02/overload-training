import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { useApi } from "./ApiProvider";
import type { ApiError } from "./errors";
import { OVERVIEW_STALE_MS } from "./training";

/**
 * Plans, Library & Gyms's reads and writes (Pitch 21h spec §7, data layer).
 * The server is the only authority: the plan, its week, and every list come
 * from the mobile API as the server computed them (the account's today, the
 * effective schedule, the web's library filters). Nothing is stored on the
 * device; `clearAccountQueries` removes all of it on sign-out.
 */

export const RESOURCE_KEYS = {
  /** The plan overview for one block week (null: the server's current week). */
  plan: (week: number | null) => ["plan", week ?? "current"] as const,
  planSession: (mesocycleId: string, sessionId: string) =>
    ["plan-session", mesocycleId, sessionId] as const,
};

const enc = encodeURIComponent;

/**
 * E1 `GET /plan?week=`. Changing week keeps the shown week until the next
 * answers (no jump). A workout write marks it stale (markTrainingStale,
 * invalidateTraining), and Plan re-reads it when shown.
 */
export function usePlan(week: number | null) {
  const api = useApi();
  return useQuery<PlanOverviewDto, ApiError>({
    queryKey: RESOURCE_KEYS.plan(week),
    queryFn: ({ signal }) =>
      api.request<PlanOverviewDto>(
        week === null ? "/plan" : `/plan?week=${week}`,
        {
          signal,
        },
      ),
    staleTime: OVERVIEW_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/** E2 `GET /mesocycles/{id}/sessions/{id}`: one authored session. */
export function usePlanSession(mesocycleId: string, sessionId: string) {
  const api = useApi();
  return useQuery<PlanSessionDto, ApiError>({
    queryKey: RESOURCE_KEYS.planSession(mesocycleId, sessionId),
    queryFn: ({ signal }) =>
      api.request<PlanSessionDto>(
        `/mesocycles/${enc(mesocycleId)}/sessions/${enc(sessionId)}`,
        { signal },
      ),
    staleTime: OVERVIEW_STALE_MS,
  });
}
