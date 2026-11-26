import { createContext, useContext, useMemo } from "react";
import { useSession } from "../auth/session";
import { APP_VERSION } from "../config/env";
import { readStagingKey, stagingAccessAllowed } from "../staging-access/key";
import { apiOrigin, createApiClient, type ApiClient } from "./client";

const ApiContext = createContext<ApiClient | null>(null);

/** One API client for the app, bound to the session's tokens (spec §6). */
export function ApiProvider({
  children,
  onUpgradeRequired,
}: {
  children: React.ReactNode;
  onUpgradeRequired: () => void;
}) {
  const { tokens } = useSession();
  const client = useMemo(
    () =>
      createApiClient({
        fetch: (...args) => fetch(...args),
        apiOrigin: apiOrigin(),
        appVersion: APP_VERSION,
        tokens,
        stagingKey: readStagingKey,
        stagingAccess: stagingAccessAllowed(),
        onUpgradeRequired,
      }),
    [tokens, onUpgradeRequired],
  );
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const value = useContext(ApiContext);
  if (!value) throw new Error("useApi outside ApiProvider");
  return value;
}
