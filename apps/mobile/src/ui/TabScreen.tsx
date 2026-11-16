import { RefreshControl, ScrollView } from "react-native";
import { ScreenHeader } from "./ScreenHeader";
import { useTheme } from "./ThemeProvider";

/**
 * A tab's root screen (Pitch 21e Checkpoint A, RD-24): the scroll view under
 * the system status bar and above the tab bar, the shared header, then the
 * content. The route hides its stack header (`headerShown: false`), so the
 * title is always visible and never doubled.
 */
export function TabScreen({
  eyebrow,
  title,
  subtitle,
  refreshing,
  onRefresh,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xxl,
        gap: spacing.xl,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        ) : undefined
      }
    >
      <ScreenHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      {children}
    </ScrollView>
  );
}
