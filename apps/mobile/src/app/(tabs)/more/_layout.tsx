import { Stack } from "expo-router";
import { diagnosticsAvailable } from "../../../diagnostics/availability";
import { stackScreenOptions } from "../../../ui/stackOptions";
import { useTheme } from "../../../ui/ThemeProvider";

export default function TabStack() {
  const theme = useTheme();
  return (
    <Stack screenOptions={stackScreenOptions(theme)}>
      {/* Developer builds only: a deep link elsewhere lands on More. */}
      <Stack.Protected guard={diagnosticsAvailable()} redirectTo="/more">
        <Stack.Screen name="diagnostics" />
      </Stack.Protected>
    </Stack>
  );
}
