import { Stack } from "expo-router";
import type { stackScreenOptions } from "../ui/stackOptions";

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
  headerOptions = {},
}: {
  signedIn: boolean;
  background: string;
  /** The themed native header (the root layout passes stackScreenOptions). */
  headerOptions?: ReturnType<typeof stackScreenOptions>;
}) {
  // The workout and its summary sit on this stack, over the tabs (Pitch 21e
  // RD-6), with the standard native header and back to the opening tab.
  const workoutHeader = { ...headerOptions, headerShown: true };
  // A modal slides up over the screen that opened it, which stays mounted
  // underneath, and carries its own Cancel and confirming action in its
  // header, where the keyboard can never cover them (Pitch 21f RD-13).
  const modalHeader = {
    ...workoutHeader,
    presentation: "modal" as const,
    headerBackVisible: false,
  };
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: background },
      }}
    >
      <Stack.Protected guard={signedIn} redirectTo={SIGNED_OUT_HOME}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="workout/[loggedSessionId]/index"
          options={workoutHeader}
        />
        <Stack.Screen
          name="workout/[loggedSessionId]/summary"
          // Done returns; there is no going back into a finished workout.
          options={{
            ...workoutHeader,
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        {/* Pitch 21f (RD-13): a modal over the workout, with header actions. */}
        <Stack.Screen
          name="workout/[loggedSessionId]/swap"
          options={modalHeader}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo={SIGNED_IN_HOME}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
