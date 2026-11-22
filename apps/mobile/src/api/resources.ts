import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import type {
  ExerciseDetailDto,
  ExerciseList,
  SetArchivedResponseDto,
  SetFavoriteResponseDto,
} from "@overload/shared/contracts/exercises";
import type {
  CreateCustomExerciseRequest,
  CreateGymRequest,
} from "@overload/shared/contracts/requests";
import type {
  GymListItemDto,
  GymsResponseDto,
} from "@overload/shared/contracts/gyms";
import type { MuscleGroupValue } from "@overload/shared/exercises/taxonomy";
import { useApi } from "./ApiProvider";
import type { ApiError } from "./errors";
import { OVERVIEW_STALE_MS, TRAINING_KEYS } from "./training";

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
export function usePlanSession(
  mesocycleId: string,
  sessionId: string,
  opts: { enabled?: boolean } = {},
) {
  const api = useApi();
  return useQuery<PlanSessionDto, ApiError>({
    enabled: opts.enabled ?? true,
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

/** Set one exercise's favorite state in every cached list and its detail. */
function writeFavorite(
  client: QueryClient,
  exerciseId: string,
  isFavorite: boolean,
): void {
  client.setQueriesData<ExerciseList>(
    { queryKey: RESOURCE_KEYS.exercisesAll },
    (list) =>
      list
        ? {
            ...list,
            items: list.items.map((e) =>
              e.id === exerciseId ? { ...e, isFavorite } : e,
            ),
          }
        : list,
  );
  client.setQueryData<ExerciseDetailDto>(
    RESOURCE_KEYS.exercise(exerciseId),
    (e) => (e ? { ...e, isFavorite } : e),
  );
}

/**
 * Per exercise: how many toggles are still out, and the last value the
 * server confirmed (Pitch 21h review #1). With several taps in flight, the
 * screen shows the newest intent; once the last one settles it shows what the
 * server holds — the last success, or the value before the taps.
 */
const favoritePending = new Map<string, number>();
const favoriteConfirmed = new Map<string, boolean>();

/**
 * E6 star / unstar. Shown at once (the web's star is optimistic too); when
 * the last toggle for an exercise settles, the shown state is put back to the
 * server's, so a refusal undoes itself and a list read that landed mid-flight
 * can't leave a wrong star. A row unstarred in the Favorites view stays until
 * the next read, as on the web.
 */
export function useToggleFavorite() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    SetFavoriteResponseDto,
    ApiError,
    { exerciseId: string; isFavorite: boolean }
  >({
    mutationFn: ({ exerciseId, isFavorite }) =>
      api.request<SetFavoriteResponseDto>(
        `/exercises/${enc(exerciseId)}/favorite`,
        { method: "PUT", body: { isFavorite } },
      ),
    onMutate: async ({ exerciseId, isFavorite }) => {
      const pending = favoritePending.get(exerciseId) ?? 0;
      if (pending === 0) favoriteConfirmed.set(exerciseId, !isFavorite);
      favoritePending.set(exerciseId, pending + 1);
      // A detail read already out would land on top of the new state.
      await client.cancelQueries({
        queryKey: RESOURCE_KEYS.exercise(exerciseId),
      });
      writeFavorite(client, exerciseId, isFavorite);
    },
    onSuccess: (data, { exerciseId }) => {
      favoriteConfirmed.set(exerciseId, data.isFavorite);
    },
    onSettled: (_d, _e, { exerciseId }) => {
      const left = (favoritePending.get(exerciseId) ?? 1) - 1;
      if (left > 0) {
        favoritePending.set(exerciseId, left);
        return;
      }
      favoritePending.delete(exerciseId);
      const confirmed = favoriteConfirmed.get(exerciseId);
      favoriteConfirmed.delete(exerciseId);
      if (confirmed !== undefined) writeFavorite(client, exerciseId, confirmed);
      void client.invalidateQueries({
        queryKey: RESOURCE_KEYS.exercisesAll,
        refetchType: "none",
      });
      void client.invalidateQueries({
        queryKey: RESOURCE_KEYS.exercise(exerciseId),
        refetchType: "none",
      });
      void client.invalidateQueries({ queryKey: ["swap"] });
    },
  });
}

/**
 * E5 `POST /exercises` with the intent's key. A retry of the same intent
 * sends the same key, so the server answers with the first result.
 */
export function useCreateExercise() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    ExerciseDetailDto,
    ApiError,
    { key: string; body: CreateCustomExerciseRequest }
  >({
    mutationFn: ({ key, body }) =>
      api.request<ExerciseDetailDto>("/exercises", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
      }),
    onSuccess: (created) => {
      client.setQueryData(RESOURCE_KEYS.exercise(created.id), created);
      void client.invalidateQueries({ queryKey: RESOURCE_KEYS.exercisesAll });
      void client.invalidateQueries({ queryKey: ["swap"] });
    },
  });
}

/**
 * E7 archive (or Undo) one of the account's own exercises. Only its
 * `deletedAt` changes on the server; every list it can appear in re-reads.
 */
export function useSetExerciseArchived() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    SetArchivedResponseDto,
    ApiError,
    { exerciseId: string; archived: boolean }
  >({
    mutationFn: ({ exerciseId, archived }) =>
      api.request<SetArchivedResponseDto>(
        `/exercises/${enc(exerciseId)}/archived`,
        { method: "PUT", body: { archived } },
      ),
    onSuccess: ({ archived }, { exerciseId }) => {
      client.setQueryData<ExerciseDetailDto>(
        RESOURCE_KEYS.exercise(exerciseId),
        (e) => (e ? { ...e, isArchived: archived } : e),
      );
      for (const queryKey of [
        RESOURCE_KEYS.exercisesAll,
        ["swap"],
        ["plan-session"],
        ["plan"],
      ]) {
        void client.invalidateQueries({ queryKey });
      }
    },
  });
}

/**
 * `GET /gyms`: the account's active gyms, under the key the start flow uses,
 * so a gym added here is offered by the next Start.
 */
export function useGyms() {
  const api = useApi();
  return useQuery<GymsResponseDto, ApiError>({
    queryKey: TRAINING_KEYS.gyms,
    queryFn: ({ signal }) => api.request<GymsResponseDto>("/gyms", { signal }),
    staleTime: OVERVIEW_STALE_MS,
  });
}

/** E8 `POST /gyms` with the intent's key (a retry answers with the first gym). */
export function useCreateGym() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    GymListItemDto,
    ApiError,
    { key: string; body: CreateGymRequest }
  >({
    mutationFn: ({ key, body }) =>
      api.request<GymListItemDto>("/gyms", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: TRAINING_KEYS.gyms });
    },
  });
}

/** E9 archive (or Undo) one of the account's gyms. */
export function useSetGymArchived() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    SetArchivedResponseDto,
    ApiError,
    { gymId: string; archived: boolean }
  >({
    mutationFn: ({ gymId, archived }) =>
      api.request<SetArchivedResponseDto>(`/gyms/${enc(gymId)}/archived`, {
        method: "PUT",
        body: { archived },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: TRAINING_KEYS.gyms });
    },
  });
}
