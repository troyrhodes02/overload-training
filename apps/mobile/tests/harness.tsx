import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { AppConfigDto } from "@overload/shared/contracts/app-config";
import type { MeDto } from "@overload/shared/contracts/account";
import { QUERY_KEYS } from "../src/api/queries";
import { ThemeProvider } from "../src/ui/ThemeProvider";

export const appConfig = (over: Partial<AppConfigDto> = {}): AppConfigDto => ({
  minimumAppVersion: "0.0.0",
  latestAppVersion: "0.0.0",
  killSwitches: { planImportEnabled: false, maintenance: false },
  signupMode: "public",
  botChallenge: null,
  ...over,
});

export const meDto = (over: Partial<MeDto> = {}): MeDto =>
  ({
    profile: {
      firstName: "Sam",
      lastName: "Ortiz",
      username: "sam_lifts",
      timeZone: "America/Chicago",
    },
    email: "sam@example.com",
    emailVerified: true,
    appearance: "system",
    entitlement: {
      plan: "pro",
      capabilities: [],
      sources: ["trial"],
      displayState: "trial",
      trialDaysLeft: 9,
    },
    tour: { autoStart: false },
    whatsNew: null,
    trialNotice: null,
    ...over,
  }) as MeDto;

/** Providers with seeded app-config and me, and no network. */
export function Providers({
  children,
  config = appConfig(),
  me = meDto(),
}: {
  children: React.ReactNode;
  config?: AppConfigDto;
  me?: MeDto;
}) {
  const client = new QueryClient({
    // No garbage-collection timers, so Jest exits as soon as the tests finish.
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  client.setQueryData(QUERY_KEYS.appConfig, config);
  client.setQueryData(QUERY_KEYS.me, me);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
