import { useCallback, useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ApiProvider } from "../api/ApiProvider";
import {
  clearAccountQueries,
  connectQueryManagers,
  createQueryClient,
  useAppConfig,
  useMe,
} from "../api/queries";
import { decideGate, toLoadable, type Gate } from "../app-state/gate";
import { RootNavigator } from "../app-state/RootNavigator";
import { stackScreenOptions } from "../ui/stackOptions";
import { SessionProvider, useSession } from "../auth/session";
import { APP_VERSION, ENV } from "../config/env";
import { runHermesChecks } from "../diagnostics/hermes-checks";
import {
  MaintenanceGate,
  MisconfiguredGate,
  StagingAccessGate,
  SuspendedGate,
  UnreachableGate,
  UpdateRequiredGate,
} from "../gates/Gates";
import { LaunchingScreen } from "../ui/StateView";
import {
  FINISH_ON_WEB_NOTICE,
  setSignedOutNotice,
} from "../accounts/signed-out-notice";
import { ThemeProvider, useThemeContext } from "../ui/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Development bundles report the Hermes date and time-zone spike (spec §12)
// once at launch, so a simulator run records it in Metro's log.
if (__DEV__) {
  const results = runHermesChecks();
  const failed = results.filter((r) => !r.ok);
  console.log(
    `[hermes-checks] ${results.length - failed.length}/${results.length} passed` +
      `${(globalThis as { HermesInternal?: unknown }).HermesInternal ? " on Hermes" : ""}` +
      failed
        .map((f) => `\n  FAIL ${f.id}: got ${f.actual}, expected ${f.expected}`)
        .join(""),
  );
}

/**
 * The root (spec §5, §9): fonts bundled with the app, the theme, the query
 * layer, the auth session, and the API client, then the gate machine. Gates
 * render in place of the navigator, so no deep link reaches behind one, and
 * RootNavigator keeps signed-out and signed-in routes apart.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [queryClient] = useState(createQueryClient);
  useEffect(() => connectQueryManagers(), []);
  // Another account never sees this account's cached data (RD-5).
  const clearCache = useCallback(
    () => clearAccountQueries(queryClient),
    [queryClient],
  );
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider onSignedOut={clearCache}>
            <Root fontsLoaded={fontsLoaded} />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const [upgradeRequiredSeen, setUpgradeRequiredSeen] = useState(false);
  const onUpgradeRequired = useCallback(() => setUpgradeRequiredSeen(true), []);
  return (
    <ApiProvider onUpgradeRequired={onUpgradeRequired}>
      <Gatekeeper
        fontsLoaded={fontsLoaded}
        upgradeRequiredSeen={upgradeRequiredSeen}
      />
    </ApiProvider>
  );
}

function Gatekeeper({
  fontsLoaded,
  upgradeRequiredSeen,
}: {
  fontsLoaded: boolean;
  upgradeRequiredSeen: boolean;
}) {
  const { theme, ready, setPreference } = useThemeContext();
  const session = useSession();
  const config = useAppConfig();
  const me = useMe(ENV.ok && session.status === "present");

  const gate: Gate = decideGate({
    envOk: ENV.ok,
    config: toLoadable(config),
    session: session.status,
    me: session.status === "present" ? toLoadable(me) : "idle",
    appVersion: APP_VERSION,
    upgradeRequiredSeen,
  });

  // The account's appearance is authoritative once signed in (RD-10).
  const appearance = me.data?.appearance;
  useEffect(() => {
    if (appearance) setPreference(appearance);
  }, [appearance, setPreference]);

  // The API refused the account itself after a refresh (no profile, deleted
  // identity): the session is unusable, so forget it.
  const meCode = me.error?.code;
  useEffect(() => {
    if (meCode === "unauthorized" || meCode === "signed_out") {
      // A 401 after a successful refresh: the sign-in exists but no account
      // answers — a deletion that removed the data and couldn't close the
      // sign-in. Say where to finish instead of signing out silently
      // (Pitch 21j review #1).
      if (meCode === "unauthorized") setSignedOutNotice(FINISH_ON_WEB_NOTICE);
      void session.forgetSession();
    }
  }, [meCode, session]);

  const show = fontsLoaded && ready;
  useEffect(() => {
    if (show && gate !== "launching") SplashScreen.hideAsync().catch(() => {});
    if (!show) return;
    // Never hold the splash longer than about a second (design G1).
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 1000);
    return () => clearTimeout(t);
  }, [show, gate]);
  if (!show) return null;

  const body = (() => {
    switch (gate) {
      case "misconfigured":
        return <MisconfiguredGate problems={ENV.ok ? [] : ENV.problems} />;
      case "launching":
        return <LaunchingScreen />;
      case "update_required":
        return (
          <UpdateRequiredGate
            minimum={config.data?.minimumAppVersion ?? null}
          />
        );
      case "maintenance":
        return <MaintenanceGate />;
      case "staging_access":
        return <StagingAccessGate />;
      case "unreachable":
        return <UnreachableGate />;
      case "suspended":
        return <SuspendedGate onSignOut={() => void session.signOut()} />;
      default:
        return (
          <RootNavigator
            signedIn={gate === "signed_in"}
            background={theme.colors.background}
            headerOptions={stackScreenOptions(theme)}
          />
        );
    }
  })();

  return (
    <>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      {body}
    </>
  );
}
