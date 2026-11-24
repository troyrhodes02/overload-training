import { useState } from "react";
import { View } from "react-native";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { SectionHeader } from "../ui/ScreenHeader";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { trendFootnote, trendSentence, type TrendView } from "./history-model";

/**
 * X2's Trend (Pitch 21i design X2, RD-6, RD-7): the server's points for one
 * series — e1RM for a loaded lift (Pro), reps for a bodyweight lift. Fewer
 * than two points is a sentence, never a chart. "Show values" lists every
 * point as text, so the trend never depends on the picture alone.
 */
export function TrendSection({
  view,
  scopeName,
  noGymScope,
  chart,
}: {
  view: TrendView;
  scopeName: string | null;
  noGymScope: boolean;
  /** The native chart (OVE-245), drawn from the same points. */
  chart?: (series: Extract<TrendView, { kind: "series" }>) => React.ReactNode;
}) {
  const { spacing } = useTheme();
  const [showValues, setShowValues] = useState(false);
  if (view === null) return null;
  if (view.kind === "locked") {
    return (
      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Trend" />
        <Text size="sm" tone="muted">
          The e1RM trend is part of Pro.
        </Text>
      </View>
    );
  }
  const sentence = trendSentence(view);
  const latest = view.trend.latest;
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <SectionHeader title={`Trend · ${view.title}`} />
        {!sentence && latest !== null ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text size="xs" tone="muted">
              {view.latestLabel}
            </Text>
            <Text size="lg" weight="semibold">
              {`${latest} ${view.unit}`}
            </Text>
          </View>
        ) : null}
      </View>
      {sentence ? (
        <Text size="sm" tone="muted">
          {sentence}
        </Text>
      ) : (
        <>
          {chart ? chart(view) : null}
          <Text size="sm" tone="muted">
            {trendFootnote(view, scopeName, noGymScope)}
          </Text>
          <View style={{ alignItems: "flex-start" }}>
            <Button
              label={showValues ? "Hide values" : "Show values"}
              variant="text"
              accessibilityState={{ expanded: showValues }}
              onPress={() => setShowValues((v) => !v)}
            />
          </View>
          {showValues ? (
            <GroupedList>
              {view.trend.points
                .slice()
                .reverse()
                .map((p, i) => (
                  <ListRow
                    key={`${p.dateIso}-${i}`}
                    title={`${p.dateLabel}${p.scheduledDeload ? " · deload week" : ""}`}
                    subtitle={p.setsLabel}
                    value={`${p.value} ${view.unit}`}
                  />
                ))}
            </GroupedList>
          ) : null}
        </>
      )}
    </View>
  );
}
