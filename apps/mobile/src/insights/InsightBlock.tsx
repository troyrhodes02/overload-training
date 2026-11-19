import { Pressable, View } from "react-native";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  CARD_INSIGHT_ERROR,
  CARD_PRO_NOTE,
  callLabel,
  type InsightView,
} from "../workout/insight-model";
import { ProNote } from "./ProNote";
import { ProgressChip } from "./ProgressChip";

/**
 * The logging card's call (Pitch 21g design §6, §15): the server's chip and
 * action line, its evidence one tap away, the server's not-enough-history
 * line, the quiet Pro note, or a one-line loading or retry state.
 *
 * It sits ABOVE the set rows and never touches the keyboard: no focus, no
 * dismiss, no scroll, on load or on tap (RD-7). Expanding only changes its own
 * height; the active row's layout handler keeps that row above the keyboard.
 */
export function InsightBlock({
  view,
  expanded,
  onToggle,
  onRetry,
}: {
  view: InsightView;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const { colors, spacing } = useTheme();

  switch (view.kind) {
    case "none":
      return null;
    case "loading":
      return (
        <View
          testID="insight-loading"
          accessibilityLabel="Loading the call for this lift"
          style={{ paddingVertical: spacing.xs }}
        >
          <Skeleton width="60%" height={18} />
        </View>
      );
    case "error":
      return (
        <View
          testID="insight-error"
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: spacing.sm,
          }}
        >
          <Text size="sm" tone="muted" style={{ flexShrink: 1 }}>
            {CARD_INSIGHT_ERROR}
          </Text>
          <Button label="Retry" variant="text" onPress={onRetry} />
        </View>
      );
    case "locked":
      return <ProNote surface="exercise-card" message={CARD_PRO_NOTE} />;
    case "insufficient":
      return (
        <Text testID="insight-insufficient" size="sm" tone="muted">
          {view.note}
        </Text>
      );
    case "call":
      return (
        <Pressable
          testID="insight-call"
          accessibilityRole="button"
          accessibilityLabel={callLabel(view, expanded)}
          accessibilityHint={expanded ? "Hides why" : "Shows why"}
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={({ pressed }) => ({
            gap: spacing.xs,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <ProgressChip chip={view.chip} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.sm,
            }}
          >
            <Text
              weight={view.strong ? "semibold" : "regular"}
              tone={view.strong ? "default" : "muted"}
              style={{ flex: 1 }}
            >
              {view.action}
            </Text>
            <View style={{ paddingTop: 4 }}>
              <Symbol
                name={expanded ? "chevron.up" : "chevron.down"}
                size={13}
                color={colors.mutedForeground}
              />
            </View>
          </View>
          {expanded && view.evidence ? (
            <Text testID="insight-evidence" size="sm" tone="muted">
              {view.evidence}
            </Text>
          ) : null}
        </Pressable>
      );
  }
}
