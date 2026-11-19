import { AppState, type AppStateStatus } from "react-native";
import * as Network from "expo-network";
import {
  focusManager,
  onlineManager,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AppConfigDto } from "@overload/shared/contracts/app-config";
import type {
  MeDto,
  UpdateAppearanceResponseDto,
} from "@overload/shared/contracts/account";
import type { Appearance } from "@overload/shared/appearance/appearance";
import { useApi } from "./ApiProvider";
import { ApiError } from "./errors";
import { resetProNotes } from "../insights/pro-note-store";

/**
 * The query layer (spec §6, RD-16). Temporary failures retry twice; nothing
 * else retries. The cache is cleared on sign-out, so another account never
 * sees this account's data.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The client's one definition of "temporary" (review #6); staging
        // protection is temporary for the session but retrying won't help.
        retry: (count, error) =>
          count < 2 &&
          error instanceof ApiError &&
          error.temporary &&
          error.code !== "staging_protected",
        retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
      },
      mutations: { retry: false },
    },
  });
}

/** Refetch on foreground, and pause while offline. */
export function connectQueryManagers(): () => void {
  const onChange = (state: AppStateStatus) =>
    focusManager.setFocused(state === "active");
  const appState = AppState.addEventListener("change", onChange);
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((s) =>
      setOnline(s.isConnected !== false),
    );
    return () => sub.remove();
  });
  return () => appState.remove();
}

export const QUERY_KEYS = {
  appConfig: ["app-config"] as const,
  me: ["me"] as const,
};

/**
 * Forget every account's cached data on sign-out (RD-5), and keep the app
 * config, which is the same for everyone and is what the signed-out gate needs.
 *
 * Never `queryClient.clear()` here: it removes the app-config query too, and
 * TanStack silently cancels a removed query that is mid-fetch, which leaves
 * its mounted observer pending forever (the "Opening Overload" hang after
 * sign-out, because the gate waits for the config).
 */
export function clearAccountQueries(client: QueryClient): void {
  // Presentation state belongs to the account too (Pitch 21g review #3): a
  // Pro note one account dismissed must show for the next one.
  resetProNotes();
  client.removeQueries({
    predicate: (query) => query.queryKey[0] !== QUERY_KEYS.appConfig[0],
  });
}

export function useAppConfig() {
  const api = useApi();
  return useQuery<AppConfigDto, ApiError>({
    queryKey: QUERY_KEYS.appConfig,
    queryFn: ({ signal }) =>
      api.request<AppConfigDto>("/app-config", { auth: false, signal }),
    staleTime: 60_000,
  });
}

export function useMe(enabled: boolean) {
  const api = useApi();
  return useQuery<MeDto, ApiError>({
    queryKey: QUERY_KEYS.me,
    queryFn: ({ signal }) => api.request<MeDto>("/me", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Save the appearance. The caller (More → Appearance) serializes saves and
 * writes the `me` cache only for the last choice, so a superseded response can
 * never overwrite a newer one (review #2).
 */
export function useUpdateAppearance() {
  const api = useApi();
  return useMutation<UpdateAppearanceResponseDto, ApiError, Appearance>({
    mutationFn: (appearance) =>
      api.request<UpdateAppearanceResponseDto>("/me/appearance", {
        method: "PUT",
        body: { appearance },
      }),
  });
}

export function setCachedAppearance(
  client: ReturnType<typeof useQueryClient>,
  appearance: Appearance,
): void {
  client.setQueryData<MeDto>(QUERY_KEYS.me, (me) =>
    me ? { ...me, appearance } : me,
  );
}
