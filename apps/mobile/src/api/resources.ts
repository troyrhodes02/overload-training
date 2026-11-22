import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import type {
  ExerciseDetailDto,
  ExerciseList,
} from "@overload/shared/contracts/exercises";
import type { MuscleGroupValue } from "@overload/shared/exercises/taxonomy";
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

/** The library's filters: the web's, carried in screen state (RD-6). */
export type LibraryFilters = {
  view: "all" | "favorites";
  muscle: MuscleGroupValue | null;
  q: string;
  limit: number;
};

export const LIBRARY_PAGE_SIZE = 50;
export const LIBRARY_MAX_LIMIT = 1000;

/** The library query string, omitting defaults (the web's own shape). */
export function libraryQuery(f: LibraryFilters): string {
  const params: string[] = [];
  if (f.view === "favorites") params.push("view=favorites");
  if (f.muscle) params.push(`muscle=${encodeURIComponent(f.muscle)}`);
  const q = f.q.trim();
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  if (f.limit > LIBRARY_PAGE_SIZE) params.push(`limit=${f.limit}`);
  return params.length ? `?${params.join("&")}` : "";
}

export const RESOURCE_KEYS = {
  /** Every library list (prefix for invalidation). */
  exercisesAll: ["exercises"] as const,
  exercises: (f: LibraryFilters) =>
    ["exercises", f.view, f.muscle ?? "all", f.q.trim(), f.limit] as const,
  exercise: (exerciseId: string) => ["exercise", exerciseId] as const,
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

/**
 * E3 `GET /exercises`. A new search, filter, or page keeps the shown list
 * until the next answers, so typing never flashes an empty list.
 */
export function useExercises(filters: LibraryFilters) {
  const api = useApi();
  return useQuery<ExerciseList, ApiError>({
    queryKey: RESOURCE_KEYS.exercises(filters),
    queryFn: ({ signal }) =>
      api.request<ExerciseList>(`/exercises${libraryQuery(filters)}`, {
        signal,
      }),
    staleTime: OVERVIEW_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/** E4 `GET /exercises/{id}`: archived ones included. */
export function useExercise(exerciseId: string) {
  const api = useApi();
  return useQuery<ExerciseDetailDto, ApiError>({
    queryKey: RESOURCE_KEYS.exercise(exerciseId),
    queryFn: ({ signal }) =>
      api.request<ExerciseDetailDto>(`/exercises/${enc(exerciseId)}`, {
        signal,
      }),
    staleTime: OVERVIEW_STALE_MS,
  });
}
