import { Fragment, useCallback } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { ActiveGoalDto } from "@overload/shared/contracts/goals";
import { GOAL_KEYS, useGoals } from "../api/goals";
import { useRefetchWhenFocused } from "../api/training";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { clearNotice, useNotice } from "../ui/notice-store";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip, Surface } from "../ui/Surface";
import { TabScreen } from "../ui/TabScreen";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalReachedCard } from "./GoalReachedCard";
import { activeGoalLabel, goalTitle, progressText } from "./goal-model";

export const goalHref = (goalId: string) =>
  `/goals/${encodeURIComponent(goalId)}`;

/**
 * G1 Goals, the Goals tab root (Pitch 21i design §6, §15): the one-time
 * "Goal reached" cards, the active goals with the web's percent, the goal
 * history, and New goal. The server ran the web's completion check before
 * answering, so a met target is a card here, never an active 100%.
 */
export function GoalsScreen() {
  const { spacing } = useTheme();
  const query = useGoals();
  useRefetchWhenFocused(GOAL_KEYS.overview);
  const notice = useNotice("goals");
  // The notice ("Goal set.", "Goal archived.") is for this visit only.
  useFocusEffect(useCallback(() => () => clearNotice("goals"), []));
  const data = query.data;

  const body = (() => {
    if (!data) {
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="Goals"
          request="GET /goals"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={3} />
      );
    }
    const empty = data.active.length === 0 && data.reached.length === 0;
    return (
      <View style={{ gap: spacing.lg }}>
        {query.isError ? (
          <Banner
            tone="info"
            message="Can't reach Overload. Showing what was last loaded."
          />
        ) : null}
        {notice ? (
          <Banner
            tone="info"
            message={notice.message}
            action={
              notice.viewHref
                ? {
                    label: "View",
                    onPress: () => {
                      const href = notice.viewHref!;
                      clearNotice("goals");
                      router.push(href);
                    },
                  }
                : undefined
            }
          />
        ) : null}
        {data.reached.map((g) => (
          <GoalReachedCard key={g.goalId} goal={g} />
        ))}
        {empty ? (
          <StateView
            icon="target"
            title="No goals yet."
            message="Set a weight × reps target for a lift to track it here."
          />
        ) : data.active.length > 0 ? (
          <ActiveGoals goals={data.active} />
        ) : null}
        {data.historyCount > 0 ? (
          <GroupedList>
            <ListRow
              title="Goal history"
              value={String(data.historyCount)}
              accessory="chevron"
              accessibilityHint="Reached and archived goals"
              onPress={() => router.push("/goals/history")}
            />
          </GroupedList>
        ) : null}
        <Button
          label="New goal"
          size="lg"
          onPress={() => router.push("/goals/new")}
        />
      </View>
    );
  })();

  return (
    <TabScreen
      eyebrow="Strength targets"
      title="Goals"
      tourAnchor="goals-header"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {body}
    </TabScreen>
  );
}

function ActiveGoals({ goals }: { goals: ActiveGoalDto[] }) {
  const { colors, spacing } = useTheme();
  return (
    <Surface padded={false} style={{ overflow: "hidden" }}>
      {goals.map((g, i) => (
        <Fragment key={g.goalId}>
          {i > 0 ? (
            <View
              style={{
                height: 1,
                marginLeft: spacing.lg,
                backgroundColor: colors.border,
              }}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeGoalLabel(g)}
            accessibilityHint="Opens this goal"
            onPress={() => router.push(goalHref(g.goalId))}
            style={({ pressed }) => ({
              padding: spacing.lg,
              gap: spacing.sm,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: spacing.md,
              }}
            >
              <Text weight="medium" style={{ flex: 1 }} numberOfLines={2}>
                {goalTitle(g)}
              </Text>
              {g.percent !== null ? (
                <Text size="xl" weight="semibold">
                  {progressText(g)}
                </Text>
              ) : null}
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <Text size="sm" tone="muted">
                {g.targetLabel}
              </Text>
              {g.exerciseArchived || g.gymArchived ? (
                <Chip label="Archived" tone="muted" />
              ) : null}
            </View>
            {g.percent !== null ? (
              <GoalProgressBar percent={g.percent} />
            ) : (
              <Text size="sm" tone="muted">
                {progressText(g)}
              </Text>
            )}
          </Pressable>
        </Fragment>
      ))}
    </Surface>
  );
}
