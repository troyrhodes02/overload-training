import { View } from "react-native";
import { SCHEDULED_DELOAD_FACTOR } from "@overload/shared/progression/config";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/** The web banner's words, with the shared factor (never a literal 90). */
export const DELOAD_WEEK_BANNER = `Deload week · ${Math.round(
  SCHEDULED_DELOAD_FACTOR * 100,
)}% load across the split`;

/**
 * The scheduled-deload week (Pitch 21g design §6, RD-11): planned recovery
 * across the whole split, shown on the workout and on Today for every plan.
 * Deliberately quiet and unlike a reactive Deload chip ("two deloads, two
 * voices"). It shows only when the SERVER's workout or day says the date is
 * in a deload week; the phone never works the calendar out itself.
 */
export function DeloadWeekBanner() {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      testID="deload-week-banner"
      style={{
        backgroundColor: colors.muted,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text size="sm" weight="medium" tone="muted">
        {DELOAD_WEEK_BANNER}
      </Text>
    </View>
  );
}
