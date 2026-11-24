import { View } from "react-native";
import { useTheme } from "../ui/ThemeProvider";

/**
 * The goal's progress bar (design G1, G3): the server's floored percent as a
 * filled share of a quiet track. Decorative: the percent is always printed
 * beside it, so VoiceOver skips the bar.
 */
export function GoalProgressBar({
  percent,
  height = 6,
}: {
  percent: number;
  height?: number;
}) {
  const { colors } = useTheme();
  const width = `${Math.max(0, Math.min(100, percent))}%` as const;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.secondary,
        overflow: "hidden",
      }}
    >
      <View
        testID="goal-progress-fill"
        style={{ width, height, backgroundColor: colors.primary }}
      />
    </View>
  );
}
