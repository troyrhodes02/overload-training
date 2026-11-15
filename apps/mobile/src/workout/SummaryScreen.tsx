import { ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { formatSetSummary } from "@overload/shared/logging/set-entry";
import { useLoggedWorkout } from "../api/training";
import { longDateLabel } from "../today/date";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { SkeletonCard } from "../ui/Skeleton";
import { LoadErrorState } from "../ui/LoadErrorState";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { summaryCounts, summaryCountsLabel } from "./card-model";
import { loggedWorkoutHref } from "./routes";

/**
 * S1 Summary (Pitch 21e design §6, §15; RD-14): a calm confirmation from the
 * server's record of the finished workout. No progression call, goal, chart,
 * or duration — the full summary is 21g, and a misleading call is worse than
 * none.
 */
export function SummaryScreen({
  loggedSessionId,
}: {
  loggedSessionId: string;
}) {
  const { colors, spacing } = useTheme();
  const query = useLoggedWorkout(loggedSessionId);
  const detail = query.data?.detail;

  const done = () => {
    router.dismissAll();
    router.navigate("/today");
  };
  const viewInHistory = () => {
    router.dismissAll();
    router.push(loggedWorkoutHref(loggedSessionId));
  };

  return (
    <>
      <Stack.Screen options={{ title: "Workout complete" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <Symbol name="checkmark.circle" size={44} color={colors.primary} />
          {detail ? (
            <>
              <Text
                size="xl"
                weight="semibold"
                align="center"
                accessibilityRole="header"
              >
                {detail.sessionName} complete
              </Text>
              <Text size="sm" tone="muted" align="center">
                {[longDateLabel(detail.dateIso), detail.gymName]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text size="sm" align="center">
                {summaryCountsLabel(summaryCounts(detail))}
              </Text>
            </>
          ) : (
            <Text size="xl" weight="semibold" accessibilityRole="header">
              Workout complete
            </Text>
          )}
        </View>

        {detail ? (
          <GroupedList>
            {detail.exercises.map((e) => (
              <ListRow
                key={e.loggedExerciseId}
                title={e.performedName}
                value={
                  e.sets.length > 0 ? formatSetSummary(e.sets) : "Not done"
                }
              />
            ))}
          </GroupedList>
        ) : query.isError ? (
          <LoadErrorState
            error={query.error}
            subject="The details"
            request={`GET /history/${loggedSessionId}`}
            byId
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <SkeletonCard rows={4} />
        )}

        <Button label="Done" onPress={done} />
        <Button
          label="View in History"
          variant="text"
          onPress={viewInHistory}
        />
      </ScrollView>
    </>
  );
}
