import { View } from "react-native";
import { router } from "expo-router";
import type { UnfinishedWorkoutDto } from "@overload/shared/contracts/views";
import { formatPlanDate } from "@overload/shared/plan/calendar";
import {
  UNFINISHED_SHOWN,
  unfinishedExplanation,
  unfinishedHeading,
  unfinishedLine,
  unfinishedMore,
} from "@overload/shared/logging/unfinished";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { workoutHref } from "../workout/routes";

/**
 * Workouts started on an earlier day and never finished (Pitch 21g
 * OVE-228; the web's Today shows the same words): above the day, in every
 * Today state, outlined in the attention token because it needs the lifter.
 * Not dismissible — it shows exactly while the server says the workout is in
 * progress. Resume opens the ORIGINAL workout, with its own date, gym, and
 * sets.
 */
export function UnfinishedWorkouts({
  workouts,
}: {
  workouts: readonly UnfinishedWorkoutDto[];
}) {
  const { spacing } = useTheme();
  if (workouts.length === 0) return null;
  return (
    <Surface
      tone="attention"
      style={{ gap: spacing.md }}
      testID="unfinished-workouts"
    >
      <View style={{ gap: spacing.xxs }}>
        <Text weight="semibold" accessibilityRole="header">
          {unfinishedHeading(workouts.length)}
        </Text>
        <Text size="sm" tone="muted">
          {unfinishedExplanation(workouts.length)}
        </Text>
      </View>
      {workouts.slice(0, UNFINISHED_SHOWN).map((w) => (
        <View
          key={w.loggedSessionId}
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1, minWidth: 180, gap: spacing.xxs }}>
            <Text size="sm">{unfinishedLine(w)}</Text>
            <Text size="xs" tone="muted">
              {[w.gymName, "In progress"].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Button
            label="Resume"
            variant="secondary"
            accessibilityLabel={`Resume ${w.sessionName} from ${formatPlanDate(w.scheduledFor)}`}
            onPress={() => router.push(workoutHref(w.loggedSessionId))}
          />
        </View>
      ))}
      {unfinishedMore(workouts.length) ? (
        <Text size="sm" tone="muted">
          {unfinishedMore(workouts.length)}
        </Text>
      ) : null}
    </Surface>
  );
}
