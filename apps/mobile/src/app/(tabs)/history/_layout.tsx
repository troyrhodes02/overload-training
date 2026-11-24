import { Stack } from "expo-router";
import { stackScreenOptions } from "../../../ui/stackOptions";
import { useTheme } from "../../../ui/ThemeProvider";

export default function TabStack() {
  const theme = useTheme();
  return <Stack screenOptions={stackScreenOptions(theme)} />;
}
