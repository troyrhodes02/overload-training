import { View, type DimensionValue } from "react-native";
import { useTheme } from "./ThemeProvider";

/**
 * A muted block that holds a loading layout's shape (Pitch 21e design §10),
 * so nothing jumps under the thumb when the content arrives. Static: no
 * shimmer, which also respects Reduce Motion.
 */
export function Skeleton({
  width = "100%",
  height = 16,
}: {
  width?: DimensionValue;
  height?: number;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: colors.muted,
      }}
    />
  );
}

/** A card-shaped loading block: a title bar and `rows` lines. */
export function SkeletonCard({ rows = 4 }: { rows?: number }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <Skeleton width="45%" height={20} />
      {[...Array(rows).keys()].map((i) => (
        <Skeleton key={i} width={i % 2 ? "70%" : "85%"} />
      ))}
    </View>
  );
}
