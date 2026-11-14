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

/**
 * The query layer (spec §6, RD-16). Temporary failures retry twice; nothing
 * else retries. The cache is cleared on sign-out, so another account never
 * sees this account's data.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) =>
          count < 2 &&
          error instanceof ApiError &&
          (error.code === "network" || error.code === "unavailable"),
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

export function useUpdateAppearance() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation<UpdateAppearanceResponseDto, ApiError, Appearance>({
    mutationFn: (appearance) =>
      api.request<UpdateAppearanceResponseDto>("/me/appearance", {
        method: "PUT",
        body: { appearance },
      }),
    onSuccess: (result) => {
      client.setQueryData<MeDto>(QUERY_KEYS.me, (me) =>
        me ? { ...me, appearance: result.appearance } : me,
      );
    },
  });
}
