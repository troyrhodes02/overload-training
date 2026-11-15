import { Stack } from "expo-router";

/** Where a signed-in lifter lands: the Today tab. */
export const SIGNED_IN_HOME = "/today";
/** Where a signed-out lifter lands: Welcome, `(auth)/index`. */
export const SIGNED_OUT_HOME = "/";

/**
 * The root navigator once the gate machine has decided "signed in" or
 * "signed out" (spec §5). Stack.Protected keeps the two groups apart, and each
 * group names where a guarded-out URL goes.
 *
 * The redirect targets are explicit because Expo Router's default is the
 * first unguarded group's own path. For `(tabs)` that is `/(tabs)`, which has
 * no index route, so after sign-in (or a cold launch at `/` with a saved
 * session) the app showed "Unmatched Route" at `/`.
 */
export function RootNavigator({
  signedIn,
  background,
}: {
  signedIn: boolean;
  background: string;
}) {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: background },
      }}
    >
      <Stack.Protected guard={signedIn} redirectTo={SIGNED_OUT_HOME}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo={SIGNED_IN_HOME}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
