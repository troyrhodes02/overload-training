import { RefreshControl, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { GOAL_KEYS, useGoalHistory } from "../api/goals";
import { useRefetchWhenFocused } from "../api/training";
import { Banner } from "../ui/Banner";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { useTheme } from "../ui/ThemeProvider";
import { goalHref } from "./GoalsScreen";
import { goalTitle, outcomeLine } from "./goal-model";

/**
 * G2 Goal history (Pitch 21i design §6): reached and archived goals, most
 * recent first, archived exercises and gyms named and marked.
 */
export function GoalHistoryScreen() {
  const { colors, spacing } = useTheme();
  const query = useGoalHistory();
  useRefetchWhenFocused(GOAL_KEYS.history);
  const goals = query.data?.goals;

  const body = (() => {
    if (!goals) {
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="Goal history"
          request="GET /goals/history"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={4} />
      );
    }
    if (goals.length === 0) {
      return <StateView icon="clock" title="No goals in your history yet." />;
    }
    return (
      <View style={{ gap: spacing.lg }}>
        {query.isError ? (
          <Banner
            tone="info"
            message="Can't reach Overload. Showing what was last loaded."
          />
        ) : null}
        <GroupedList>
          {goals.map((g) => (
            <ListRow
              key={g.goalId}
              title={`${goalTitle(g)}${g.exerciseArchived || g.gymArchived ? " (archived)" : ""}`}
              subtitle={`${g.targetLabel} · ${outcomeLine(g)}`}
              accessory="chevron"
              onPress={() => router.push(goalHref(g.goalId))}
            />
          ))}
        </GroupedList>
      </View>
    );
  })();

  return (
    <>
      <Stack.Screen options={{ title: "Goal history" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {body}
      </ScrollView>
    </>
  );
}
