import { useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type ScrollViewInstance,
} from "react-native";
import type { TrendPointDto } from "@overload/shared/contracts/exercise-history";
import { haptic } from "../ui/haptics";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  chartGeometry,
  chartSummary,
  PLOT_HEIGHT,
  pointReadout,
  Y_AXIS_WIDTH,
} from "./chart-model";

const LABEL_ROW = 20;
const DOT = 8;

/**
 * The one native line chart (Pitch 21i design X2; RD-5–RD-7): the server's
 * trend points, drawn with plain Views — a line of rotated segments, a dot
 * per finished workout, a hollow square for a scheduled-deload week — so it
 * needs no native module and the installed development build keeps working.
 * Tokens only, so it follows light and dark. Every point is a tap target
 * (44 pt with its slop); the newest is selected first, the readout under the
 * chart says its date, value, and sets, and a long history scrolls sideways,
 * opening at the newest point. VoiceOver reads one summary sentence; "Show
 * values" lists every point as text.
 */
export function TrendChart({
  points,
  unit,
  title,
}: {
  points: readonly TrendPointDto[];
  unit: "lb" | "reps";
  title: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const geometry = useMemo(
    () => (width > 0 ? chartGeometry(points, width) : null),
    [points, width],
  );
  const current = geometry
    ? geometry.points[selected ?? geometry.points.length - 1]
    : null;

  function select(index: number) {
    if (index === selected) return;
    void haptic.selection();
    setSelected(index);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        testID="trend-chart"
        // One element for VoiceOver: the summary sentence. Every value is
        // also listed as text under "Show values" (design X2).
        accessible
        accessibilityRole="image"
        accessibilityLabel={chartSummary(title, unit, points)}
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        style={{
          height: PLOT_HEIGHT + LABEL_ROW + spacing.sm * 2,
          paddingVertical: spacing.sm,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {geometry ? (
          <>
            {/* The y axis stays put while a long history scrolls. */}
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{ width: Y_AXIS_WIDTH, height: PLOT_HEIGHT }}
            >
              {geometry.ticks.map((t) => (
                <Text
                  key={t.value}
                  size="xs"
                  tone="muted"
                  style={{
                    position: "absolute",
                    right: spacing.xs,
                    top: t.y - 8,
                  }}
                >
                  {String(t.value)}
                </Text>
              ))}
            </View>
            <ScrollView
              ref={scroll}
              horizontal
              scrollEnabled={geometry.scrolls}
              showsHorizontalScrollIndicator={geometry.scrolls}
              onContentSizeChange={() =>
                scroll.current?.scrollToEnd({ animated: false })
              }
            >
              <View
                style={{
                  width: geometry.contentWidth,
                  height: PLOT_HEIGHT + LABEL_ROW,
                }}
              >
                {geometry.ticks.map((t) => (
                  <View
                    key={`grid-${t.value}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: t.y,
                      height: 1,
                      backgroundColor: colors.border,
                    }}
                  />
                ))}
                {geometry.segments.map((s, i) => (
                  <View
                    key={`seg-${i}`}
                    testID="trend-segment"
                    style={{
                      position: "absolute",
                      left: s.cx - s.length / 2,
                      top: s.cy - 1,
                      width: s.length,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: colors.primary,
                      transform: [{ rotate: `${s.angle}rad` }],
                    }}
                  />
                ))}
                {geometry.points.map((p) => {
                  const isSelected = current?.index === p.index;
                  return (
                    <Pressable
                      key={`pt-${p.index}`}
                      testID="trend-point"
                      accessibilityRole="button"
                      accessibilityLabel={`${p.dateLabel}, ${p.value} ${unit === "lb" ? "pounds" : "reps"}${p.setsLabel ? `, ${p.setsLabel}` : ""}${p.deload ? ", deload week" : ""}`}
                      accessibilityState={{ selected: isSelected }}
                      hitSlop={8}
                      onPress={() => select(p.index)}
                      style={{
                        position: "absolute",
                        left: p.x - 14,
                        top: p.y - 14,
                        width: 28,
                        height: 28,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isSelected ? (
                        <View
                          style={{
                            position: "absolute",
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 2,
                            borderColor: colors.primary,
                          }}
                        />
                      ) : null}
                      <View
                        style={
                          p.deload
                            ? {
                                width: DOT,
                                height: DOT,
                                borderWidth: 1.5,
                                borderColor: colors.mutedForeground,
                                backgroundColor: colors.card,
                              }
                            : {
                                width: DOT,
                                height: DOT,
                                borderRadius: DOT / 2,
                                backgroundColor: colors.primary,
                              }
                        }
                      />
                    </Pressable>
                  );
                })}
                {geometry.xLabels.map((l) => (
                  <Text
                    key={`x-${l.index}`}
                    size="xs"
                    tone="muted"
                    numberOfLines={1}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={{
                      position: "absolute",
                      top: PLOT_HEIGHT + 2,
                      left: l.x - 32,
                      width: 64,
                      textAlign: "center",
                    }}
                  >
                    {l.label}
                  </Text>
                ))}
              </View>
            </ScrollView>
          </>
        ) : null}
      </View>
      {current ? (
        <Text size="sm" accessibilityLiveRegion="polite">
          {pointReadout(current, unit)}
        </Text>
      ) : null}
    </View>
  );
}
