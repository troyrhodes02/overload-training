import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  EditCardioLogResponseDto,
  LogCardioResponseDto,
} from "@overload/shared/contracts/cardio";
import type { GymsResponseDto } from "@overload/shared/contracts/gyms";
import type { HistoryWeekDto } from "@overload/shared/contracts/history";
import type {
  ChangeGymResponseDto,
  CompleteWorkoutResponseDto,
  EditPlannedSetsResponseDto,
  MissedDayResolutionDto,
  SetSkippedResponseDto,
  StartWorkoutResponseDto,
  SwapContextDto,
  SwapExerciseResponseDto,
} from "@overload/shared/contracts/logging";
import type { MuscleGroupValue } from "@overload/shared/exercises/taxonomy";
import type {
  EditCardioLogRequest,
  EditLoggedSetRequest,
  LogCardioRequest,
  LogSetRequest,
  ResolveMissedDayRequest,
  StartWorkoutRequest,
} from "@overload/shared/contracts/requests";
import {
  CORE_FIELDS_QUERY,
  type LoggedSetDto,
  type LoggedWorkoutDetailViewDto,
  type TodayDto,
  type WorkoutViewDto,
} from "@overload/shared/contracts/views";
import { useApi } from "./ApiProvider";
import type { ApiError } from "./errors";

/**
 * The Workout Loop's reads and writes (Pitch 21e spec §7, data layer). The
 * server is the only authority: every write is one request whose 200 is the
 * only thing that makes a set, a workout, or a finish real. Writes never
 * auto-retry (the 21d client default); the lifter retries, and each write is
 * safe to repeat at the server (natural keys, RD-3). Nothing is stored on the
 * device; `clearAccountQueries` removes all of it on sign-out.
 */

export const TRAINING_KEYS = {
  today: ["today"] as const,
  gyms: ["gyms"] as const,
  workout: (loggedSessionId: string) => ["workout", loggedSessionId] as const,
  historyWeek: (week: string | null) =>
    ["history-week", week ?? "current"] as const,
  historyWorkout: (loggedSessionId: string) =>
    ["history-workout", loggedSessionId] as const,
  /** The swap picker's list for one muscle group (null: the planned group). */
  swap: (loggedExerciseId: string, muscle: MuscleGroupValue | null) =>
    ["swap", loggedExerciseId, muscle ?? "planned"] as const,
};

const enc = encodeURIComponent;

/**
 * This app renders no progression calls, summaries, or goals yet (21g/21i),
 * so its reads ask for the core fields and the server skips computing them
 * (Checkpoint A round 2, RD-28). Remove it from a read when a screen starts
 * rendering one of those.
 */
const CORE = `?${CORE_FIELDS_QUERY}`;

/**
 * How long a Today or History answer counts as current (RD-28): a tab switch
 * or the return from a workout within it reads the cache instead of asking
 * again. Every write the app makes marks these reads stale itself
 * (invalidateTraining, markTrainingStale, applyConfirmedCompletion), which
 * overrides this, and pull to refresh always asks. The workout never uses it.
 */
export const OVERVIEW_STALE_MS = 10_000;

export function useToday() {
  const api = useApi();
  return useQuery<TodayDto, ApiError>({
    staleTime: OVERVIEW_STALE_MS,
    queryKey: TRAINING_KEYS.today,
    queryFn: ({ signal }) => api.request<TodayDto>(`/today${CORE}`, { signal }),
  });
}

export function useWorkout(
  loggedSessionId: string,
  opts: { enabled?: boolean } = {},
) {
  const api = useApi();
  return useQuery<WorkoutViewDto, ApiError>({
    enabled: opts.enabled ?? true,
    queryKey: TRAINING_KEYS.workout(loggedSessionId),
    queryFn: ({ signal }) =>
      api.request<WorkoutViewDto>(`/workouts/${enc(loggedSessionId)}${CORE}`, {
        signal,
      }),
    staleTime: 0,
  });
}

export function useHistoryWeek(week: string | null) {
  const api = useApi();
  return useQuery<HistoryWeekDto, ApiError>({
    staleTime: OVERVIEW_STALE_MS,
    queryKey: TRAINING_KEYS.historyWeek(week),
    queryFn: ({ signal }) =>
      api.request<HistoryWeekDto>(
        week ? `/history?week=${enc(week)}` : "/history",
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useLoggedWorkout(
  loggedSessionId: string,
  opts: { enabled?: boolean } = {},
) {
  const api = useApi();
  return useQuery<LoggedWorkoutDetailViewDto, ApiError>({
    enabled: opts.enabled ?? true,
    queryKey: TRAINING_KEYS.historyWorkout(loggedSessionId),
    queryFn: ({ signal }) =>
      api.request<LoggedWorkoutDetailViewDto>(
        `/history/${enc(loggedSessionId)}${CORE}`,
        { signal },
      ),
  });
}

/** The account's active gyms, fetched when Start needs to choose one. */
export function useFetchGyms() {
  const api = useApi();
  const client = useQueryClient();
  return () =>
    client.fetchQuery<GymsResponseDto, ApiError>({
      queryKey: TRAINING_KEYS.gyms,
      queryFn: ({ signal }) =>
        api.request<GymsResponseDto>("/gyms", { signal }),
      staleTime: 30_000,
    });
}

/**
 * After a set: the workout already holds the server's confirmed set, so the
 * other reads are only marked stale, not refetched (review #6); Today and
 * History refetch when they are next shown (useRefetchWhenFocused).
 */
export function markTrainingStale(
  client: QueryClient,
  loggedSessionId: string,
): Promise<void> {
  const stale = { refetchType: "none" as const };
  return Promise.all([
    client.invalidateQueries({ queryKey: TRAINING_KEYS.today, ...stale }),
    client.invalidateQueries({ queryKey: ["history-week"], ...stale }),
    client.invalidateQueries({ queryKey: ["history-workout"], ...stale }),
    client.invalidateQueries({
      queryKey: TRAINING_KEYS.workout(loggedSessionId),
      ...stale,
    }),
  ]).then(() => undefined);
}

/** Refetch a screen's query when the screen comes back into view and is stale. */
export function useRefetchWhenFocused(queryKey: readonly unknown[]) {
  const client = useQueryClient();
  const key = JSON.stringify(queryKey);
  useFocusEffect(
    useCallback(() => {
      void client.refetchQueries({ queryKey: JSON.parse(key), stale: true });
    }, [client, key]),
  );
}

/** Every training read that a write can change. */
export function invalidateTraining(
  client: QueryClient,
  loggedSessionId?: string,
): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: TRAINING_KEYS.today }),
    client.invalidateQueries({ queryKey: ["history-week"] }),
    client.invalidateQueries({ queryKey: ["history-workout"] }),
    loggedSessionId
      ? client.invalidateQueries({
          queryKey: TRAINING_KEYS.workout(loggedSessionId),
        })
      : Promise.resolve(),
  ]).then(() => undefined);
}

export function useStartWorkout() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<StartWorkoutResponseDto, ApiError, StartWorkoutRequest>({
    mutationFn: (body) =>
      api.request<StartWorkoutResponseDto>("/workouts", {
        method: "POST",
        body,
      }),
    onSuccess: (data) => {
      void invalidateTraining(client, data.loggedSessionId);
    },
  });
}

export type ResolveMissedDayVariables = {
  mesocycleId: string;
  missedOn: string;
  outcome: ResolveMissedDayRequest["outcome"];
};

/**
 * Shift or skip a missed day (Pitch 21e Checkpoint A, RD-23): one request to
 * the web's own resolver, safe to repeat (the same outcome returns the stored
 * answer). Today and History refetch from the server afterwards; nothing about
 * the schedule is worked out here.
 */
export function useResolveMissedDay() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    MissedDayResolutionDto,
    ApiError,
    ResolveMissedDayVariables
  >({
    mutationFn: ({ mesocycleId, missedOn, outcome }) =>
      api.request<MissedDayResolutionDto>(
        `/mesocycles/${enc(mesocycleId)}/missed-days/${enc(missedOn)}`,
        { method: "PUT", body: { outcome } },
      ),
    onSettled: () => {
      void invalidateTraining(client);
    },
  });
}

export type LogSetVariables = {
  loggedSessionId: string;
  loggedExerciseId: string;
  setNumber: number;
  body: LogSetRequest;
};

/**
 * Merge a confirmed set into the cached workout (RD-9): the row becomes saved
 * with the SERVER's values. Only a 200 reaches here, so the cache never shows
 * a set the server didn't store. A refetch follows to pick up anything else
 * the write changed.
 */
export function mergeConfirmedSet(
  view: WorkoutViewDto | undefined,
  set: LoggedSetDto,
): WorkoutViewDto | undefined {
  if (!view) return view;
  return {
    ...view,
    workout: {
      ...view.workout,
      gymLocked: true,
      exercises: view.workout.exercises.map((e) =>
        e.loggedExerciseId !== set.loggedExerciseId
          ? e
          : {
              ...e,
              sets: upsertSet(e.sets, e.plannedSets, set),
            },
      ),
    },
  };
}

function upsertSet(
  sets: WorkoutViewDto["workout"]["exercises"][number]["sets"],
  plannedSets: number,
  set: LoggedSetDto,
) {
  const row = {
    setNumber: set.setNumber,
    loggedSetId: set.id,
    weightLbs: set.weightLbs,
    reps: set.reps,
    rir: set.rir,
    saved: true,
    extra: set.setNumber > plannedSets,
  };
  const exists = sets.some((s) => s.setNumber === set.setNumber);
  const next = exists
    ? sets.map((s) => (s.setNumber === set.setNumber ? row : s))
    : [...sets, row];
  return next.sort((a, b) => a.setNumber - b.setNumber);
}

export function useLogSet() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<LoggedSetDto, ApiError, LogSetVariables>({
    mutationFn: ({ loggedExerciseId, setNumber, body }) =>
      api.request<LoggedSetDto>(
        `/logged-exercises/${enc(loggedExerciseId)}/sets/${setNumber}`,
        { method: "PUT", body },
      ),
    onSuccess: (set, { loggedSessionId }) => {
      client.setQueryData<WorkoutViewDto>(
        TRAINING_KEYS.workout(loggedSessionId),
        (view) => mergeConfirmedSet(view, set),
      );
      void markTrainingStale(client, loggedSessionId);
    },
  });
}

/**
 * Record a finish the server has CONFIRMED (its 200) in every cached read
 * that shows the workout, before any screen moves on (Checkpoint A round 2,
 * owner finding 1). Nothing here is optimistic: it runs only after the
 * server's answer, and it changes only the workout's status, which that
 * answer states. A full refetch of each read follows.
 *
 * Why it is needed: a refetch alone loses the race. The workout screen is
 * replaced by the summary as soon as the finish returns, and TanStack cancels
 * a fetch whose last observer unmounts and restores the cached copy, which
 * still said "in progress". Today and History can also be holding an answer
 * read before the finish. Each in-flight read is cancelled first, so an older
 * answer can't land after this and bring "in progress" back.
 */
export async function applyConfirmedCompletion(
  client: QueryClient,
  loggedSessionId: string,
): Promise<void> {
  const workoutKey = TRAINING_KEYS.workout(loggedSessionId);
  await Promise.all([
    client.cancelQueries({ queryKey: workoutKey }),
    client.cancelQueries({ queryKey: TRAINING_KEYS.today }),
    client.cancelQueries({ queryKey: ["history-week"] }),
  ]);
  client.setQueryData<WorkoutViewDto>(workoutKey, (view) =>
    view && view.workout.status !== "complete"
      ? { ...view, workout: { ...view.workout, status: "complete" } }
      : view,
  );
  client.setQueryData<TodayDto>(TRAINING_KEYS.today, (today) =>
    today ? markTodayComplete(today, loggedSessionId) : today,
  );
  client.setQueriesData<HistoryWeekDto>(
    { queryKey: ["history-week"] },
    (week) => (week ? markWeekComplete(week, loggedSessionId) : week),
  );
}

function completeDay<
  D extends { kind: string; loggedSessionId: string | null },
>(day: D, loggedSessionId: string): D {
  return day.kind === "in_progress" && day.loggedSessionId === loggedSessionId
    ? { ...day, kind: "complete" }
    : day;
}

/** Today with the confirmed finish: the shown day, or the day below a missed one. */
export function markTodayComplete(
  today: TodayDto,
  loggedSessionId: string,
): TodayDto {
  const d = today.dashboard;
  if (d.kind === "missed_day") {
    return d.below
      ? {
          ...today,
          dashboard: { ...d, below: completeDay(d.below, loggedSessionId) },
        }
      : today;
  }
  if (d.kind === "in_progress") {
    return { ...today, dashboard: completeDay(d, loggedSessionId) };
  }
  return today;
}

/** A History week with the confirmed finish on the workout's own row. */
export function markWeekComplete(
  week: HistoryWeekDto,
  loggedSessionId: string,
): HistoryWeekDto {
  const v = week.view;
  if (v.kind === "active") {
    return {
      ...week,
      view: {
        ...v,
        days: v.days.map((d) =>
          d.loggedSessionId === loggedSessionId && d.state === "in_progress"
            ? { ...d, state: "complete" as const }
            : d,
        ),
      },
    };
  }
  return {
    ...week,
    view: {
      ...v,
      days: v.days.map((day) => ({
        ...day,
        workouts: day.workouts.map((w) =>
          w.loggedSessionId === loggedSessionId && w.state === "in_progress"
            ? { ...w, state: "complete" as const }
            : w,
        ),
      })),
    },
  };
}

export function useCompleteWorkout() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<CompleteWorkoutResponseDto, ApiError, string>({
    mutationFn: (loggedSessionId) =>
      api.request<CompleteWorkoutResponseDto>(
        `/workouts/${enc(loggedSessionId)}/complete`,
        { method: "POST" },
      ),
    // Awaited: mutateAsync resolves (and the screen moves on) only once every
    // cached read says finished. The refetches then run in the background.
    onSuccess: async (_data, loggedSessionId) => {
      await applyConfirmedCompletion(client, loggedSessionId);
      // The workout itself isn't refetched: its screen is closing, and the
      // next open reads it again (staleTime 0).
      void invalidateTraining(client);
    },
  });
}

/**
 * After a write that changes what the workout's cards say (its gym, an
 * exercise swapped or marked not done): Today and History are marked stale,
 * and the workout is read again from the server and WAITED for, so the screen
 * shows the server's answer, never a guess (Pitch 21f spec §7).
 */
export async function refreshWorkout(
  client: QueryClient,
  loggedSessionId: string,
): Promise<void> {
  const stale = { refetchType: "none" as const };
  void client.invalidateQueries({ queryKey: TRAINING_KEYS.today, ...stale });
  void client.invalidateQueries({ queryKey: ["history-week"], ...stale });
  void client.invalidateQueries({ queryKey: ["history-workout"], ...stale });
  await client.invalidateQueries({
    queryKey: TRAINING_KEYS.workout(loggedSessionId),
  });
}

export type ChangeGymVariables = { loggedSessionId: string; gymId: string };

/**
 * Change where the workout is logged (Pitch 21f E8). The server allows it
 * only while the workout has no set; setting the same gym again is harmless.
 */
export function useChangeGym() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<ChangeGymResponseDto, ApiError, ChangeGymVariables>({
    mutationFn: ({ loggedSessionId, gymId }) =>
      api.request<ChangeGymResponseDto>(
        `/workouts/${enc(loggedSessionId)}/gym`,
        { method: "PUT", body: { gymId } },
      ),
    onSuccess: (_data, { loggedSessionId }) =>
      refreshWorkout(client, loggedSessionId),
  });
}

/** The swap picker's candidates for one muscle group (Pitch 21f E9). */
export function useSwapCandidates(
  loggedExerciseId: string,
  muscle: MuscleGroupValue | null,
) {
  const api = useApi();
  return useQuery<SwapContextDto, ApiError>({
    queryKey: TRAINING_KEYS.swap(loggedExerciseId, muscle),
    queryFn: ({ signal }) =>
      api.request<SwapContextDto>(
        `/logged-exercises/${enc(loggedExerciseId)}/swap-candidates${
          muscle ? `?muscle=${enc(muscle)}` : ""
        }`,
        { signal },
      ),
    staleTime: 60_000,
    // The last group's list stays (dimmed) while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export type SwapExerciseVariables = {
  loggedSessionId: string;
  loggedExerciseId: string;
  newExerciseId: string;
};

/**
 * Swap what is performed in this occurrence (Pitch 21f E10). The plan is
 * never written. The workout is read again before the picker closes, so the
 * card shows the substitute with its own history.
 */
export function useSwapExercise() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<SwapExerciseResponseDto, ApiError, SwapExerciseVariables>({
    mutationFn: ({ loggedExerciseId, newExerciseId }) =>
      api.request<SwapExerciseResponseDto>(
        `/logged-exercises/${enc(loggedExerciseId)}/exercise`,
        { method: "PUT", body: { newExerciseId } },
      ),
    onSuccess: async (_data, { loggedSessionId, loggedExerciseId }) => {
      client.removeQueries({ queryKey: ["swap", loggedExerciseId] });
      await refreshWorkout(client, loggedSessionId);
    },
  });
}

export type SetSkippedVariables = {
  loggedSessionId: string;
  loggedExerciseId: string;
  skipped: boolean;
};

/** The cached workout with one card's confirmed not-done state. */
export function mergeConfirmedSkip(
  view: WorkoutViewDto | undefined,
  answer: SetSkippedResponseDto,
): WorkoutViewDto | undefined {
  if (!view) return view;
  return {
    ...view,
    workout: {
      ...view.workout,
      exercises: view.workout.exercises.map((e) =>
        e.loggedExerciseId === answer.loggedExerciseId
          ? { ...e, skipped: answer.skipped }
          : e,
      ),
    },
  };
}

/**
 * Mark an exercise not done, or undo that (Pitch 21f E11). The card changes
 * only on the server's answer, with the state that answer states.
 */
export function useSetSkipped() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<SetSkippedResponseDto, ApiError, SetSkippedVariables>({
    mutationFn: ({ loggedExerciseId, skipped }) =>
      api.request<SetSkippedResponseDto>(
        `/logged-exercises/${enc(loggedExerciseId)}/skipped`,
        { method: "PUT", body: { skipped } },
      ),
    onSuccess: (answer, { loggedSessionId }) => {
      client.setQueryData<WorkoutViewDto>(
        TRAINING_KEYS.workout(loggedSessionId),
        (view) => mergeConfirmedSkip(view, answer),
      );
      void markTrainingStale(client, loggedSessionId);
    },
  });
}

/** A logged workout's record with one set's corrected values (the server's). */
export function mergeCorrectedSet(
  view: LoggedWorkoutDetailViewDto | undefined,
  set: LoggedSetDto,
): LoggedWorkoutDetailViewDto | undefined {
  if (!view) return view;
  return {
    ...view,
    detail: {
      ...view.detail,
      exercises: view.detail.exercises.map((e) =>
        e.loggedExerciseId !== set.loggedExerciseId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) =>
                s.loggedSetId === set.id
                  ? {
                      ...s,
                      weightLbs: set.weightLbs,
                      reps: set.reps,
                      rir: set.rir,
                    }
                  : s,
              ),
            },
      ),
    },
  };
}

export type EditSetVariables = {
  loggedSessionId: string;
  loggedSetId: string;
  body: EditLoggedSetRequest;
};

/**
 * Correct one saved set (Pitch 21f E12): values only, through the server's
 * one set-writing path. The server's answer replaces the row in the workout
 * and in its History record; everything else is marked stale, so progression
 * and trends are read again from the corrected history. Sending the same
 * correction twice stores the same values.
 */
export function useEditSet() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<LoggedSetDto, ApiError, EditSetVariables>({
    mutationFn: ({ loggedSetId, body }) =>
      api.request<LoggedSetDto>(`/sets/${enc(loggedSetId)}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: (set, { loggedSessionId }) => {
      client.setQueryData<WorkoutViewDto>(
        TRAINING_KEYS.workout(loggedSessionId),
        (view) => mergeConfirmedSet(view, set),
      );
      client.setQueryData<LoggedWorkoutDetailViewDto>(
        TRAINING_KEYS.historyWorkout(loggedSessionId),
        (view) => mergeCorrectedSet(view, set),
      );
      void markTrainingStale(client, loggedSessionId);
    },
  });
}

export type EditPlannedSetsVariables = {
  loggedSessionId: string;
  loggedExerciseId: string;
  plannedSets: number;
};

/**
 * Lower this workout's planned-set count for one exercise (Pitch 21f E13).
 * The server only ever lowers it, on this occurrence, and removes no set. The
 * workout and its History record are read again before the caller goes on.
 */
export function useEditPlannedSets() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<
    EditPlannedSetsResponseDto,
    ApiError,
    EditPlannedSetsVariables
  >({
    mutationFn: ({ loggedExerciseId, plannedSets }) =>
      api.request<EditPlannedSetsResponseDto>(
        `/logged-exercises/${enc(loggedExerciseId)}/planned-sets`,
        { method: "PATCH", body: { plannedSets } },
      ),
    onSuccess: async (_data, { loggedSessionId }) => {
      await Promise.all([
        refreshWorkout(client, loggedSessionId),
        client.invalidateQueries({
          queryKey: TRAINING_KEYS.historyWorkout(loggedSessionId),
        }),
      ]);
    },
  });
}

/** Cardio shows on Today and in History only: both are read again. */
function invalidateCardioReads(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: TRAINING_KEYS.today }),
    client.invalidateQueries({ queryKey: ["history-week"] }),
  ]).then(() => undefined);
}

export type LogCardioVariables = {
  mesocycleId: string;
  scheduledFor: string;
  body: LogCardioRequest;
};

/**
 * Record the cardio done for one planned day (Pitch 21f E14). Keyed by the
 * day at the server: a repeat returns the stored record untouched, with
 * `alreadyLogged` true, so a retry can never record it twice.
 */
export function useLogCardio() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<LogCardioResponseDto, ApiError, LogCardioVariables>({
    mutationFn: ({ mesocycleId, scheduledFor, body }) =>
      api.request<LogCardioResponseDto>(
        `/mesocycles/${enc(mesocycleId)}/cardio-logs/${enc(scheduledFor)}`,
        { method: "PUT", body },
      ),
    onSuccess: () => void invalidateCardioReads(client),
  });
}

export type EditCardioVariables = {
  cardioLogId: string;
  body: EditCardioLogRequest;
};

/** Correct a cardio record's activity and minutes (Pitch 21f E15). */
export function useEditCardio() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<EditCardioLogResponseDto, ApiError, EditCardioVariables>({
    mutationFn: ({ cardioLogId, body }) =>
      api.request<EditCardioLogResponseDto>(
        `/cardio-logs/${enc(cardioLogId)}`,
        { method: "PATCH", body },
      ),
    onSuccess: () => void invalidateCardioReads(client),
  });
}
