import { Stack } from "expo-router";
import { stackScreenOptions } from "../../ui/stackOptions";
import { useTheme } from "../../ui/ThemeProvider";

/** The signed-out stack: native headers and the system back gesture. */
export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={stackScreenOptions(theme)}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
