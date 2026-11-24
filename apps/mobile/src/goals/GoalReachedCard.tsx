import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { GoalContextDto } from "@overload/shared/contracts/goals";
import { useAcknowledgeGoal } from "../api/goals";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  firstSightOfReached,
  newGoalHref,
  newGoalTarget,
  reachedCopy,
} from "./goal-model";

/**
 * The one-time "Goal reached" card (design G1, G3; Goals R34, R58): calm, no
 * animation beyond the system's, a success haptic the first time it is seen
 * in this app session. "Set a new goal" and "Done" both acknowledge it on the
 * server, so it never returns. `canSetNew` is the server's word on whether a
 * new goal is allowed (the exercise isn't archived, no other active goal).
 */
export function GoalReachedCard({
  goal,
  canSetNew = true,
}: {
  goal: GoalContextDto & { alreadyReached: boolean };
  canSetNew?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const acknowledge = useAcknowledgeGoal();
  const copy = reachedCopy(goal);
  useEffect(() => {
    if (firstSightOfReached(goal.goalId)) void haptic.success();
  }, [goal.goalId]);

  const done = (then?: () => void) => {
    acknowledge.mutate({ goalId: goal.goalId });
    then?.();
  };

  return (
    <Surface style={{ gap: spacing.md }}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${copy.title}. ${copy.line}.${copy.note ? ` ${copy.note}` : ""}`}
        style={{ gap: spacing.xs }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Symbol name="checkmark.circle" size={20} color={colors.primary} />
          <Text size="lg" weight="semibold">
            {copy.title}
          </Text>
        </View>
        <Text tone="muted">{copy.line}</Text>
        {copy.note ? (
          <Text size="sm" tone="muted">
            {copy.note}
          </Text>
        ) : null}
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
      >
        {canSetNew ? (
          <Button
            label="Set a new goal"
            style={{ flex: 1 }}
            disabled={acknowledge.isPending}
            onPress={() =>
              done(() => router.push(newGoalHref(newGoalTarget(goal))))
            }
          />
        ) : null}
        <Button
          label="Done"
          variant="text"
          disabled={acknowledge.isPending}
          accessibilityHint="Dismisses this card. The goal stays in your goal history."
          onPress={() => done()}
        />
      </View>
    </Surface>
  );
}
