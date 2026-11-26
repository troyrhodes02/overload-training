import { RefreshControl, ScrollView } from "react-native";
import { useTourScroll } from "../tour/anchors";
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
  tourAnchor,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** The tour points at this screen's title (Pitch 21k). */
  tourAnchor?: string;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  // The tour can bring an anchor on this screen into view (Pitch 21k RD-14).
  const tour = useTourScroll();
  return (
    <ScrollView
      {...tour.scrollProps}
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
      <tour.Provider>
        <ScreenHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          tourAnchor={tourAnchor}
        />
        {children}
      </tour.Provider>
    </ScrollView>
  );
}
