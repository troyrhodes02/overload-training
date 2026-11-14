import { Linking, ScrollView } from "react-native";
import type { SymbolViewProps } from "expo-symbols";
import { webOrigin } from "../config/env";
import { StateView } from "../ui/StateView";
import { useTheme } from "../ui/ThemeProvider";

/**
 * An honest placeholder for a tab whose feature arrives in a later slice
 * (design T2–T4, RD-12): one sentence and a way to the web. No mock data and
 * no fake controls.
 */
export function Placeholder({
  icon,
  title,
  message,
  header,
}: {
  icon: SymbolViewProps["name"];
  title: string;
  message: string;
  header?: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const origin = webOrigin();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
    >
      {header}
      <StateView
        icon={icon}
        title={title}
        message={message}
        action={
          origin
            ? {
                label: "Open Overload on the web",
                onPress: () => void Linking.openURL(origin),
              }
            : undefined
        }
      />
    </ScrollView>
  );
}
