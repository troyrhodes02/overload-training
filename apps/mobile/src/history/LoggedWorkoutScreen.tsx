import { Linking, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import type { LoggedWorkoutDetailDto } from "@overload/shared/contracts/logging";
import { useLoggedWorkout, useWorkout } from "../api/training";
import { webOrigin } from "../config/env";
import { longDateLabel } from "../today/date";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { setValueLabel } from "../workout/labels";
import { workoutHref } from "../workout/routes";

/** The section header: the performed name, and what changed about it. */
export function exerciseHeader(
  e: LoggedWorkoutDetailDto["exercises"][number],
): string {
  return [
    e.performedName,
    e.swapped ? `swapped from ${e.plannedName}` : null,
    e.archived ? "archived" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * H2 Logged workout (Pitch 21e design §6, §15; RD-16): exactly what was
 * logged, read-only. Archived exercises and gyms show by name. Correcting a
 * set is 21f, so the web is one tap away.
 */
export function LoggedWorkoutScreen({
  loggedSessionId,
  inProgress,
}: {
  loggedSessionId: string;
  /** From the History row: only whether to ask the server for the status. */
  inProgress: boolean;
}) {
  const { colors, spacing } = useTheme();
  const query = useLoggedWorkout(loggedSessionId);
  // The History row only says to ASK: whether it is still in progress is the
  // server's answer (review #2), so a workout finished since never offers
  // Resume.
  const status = useWorkout(loggedSessionId, { enabled: inProgress });
  const resumable = status.data?.workout.status === "in_progress";
  const detail = query.data?.detail;
  const origin = webOrigin();

  return (
    <>
      <Stack.Screen options={{ title: detail?.sessionName ?? "Workout" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {!detail ? (
          query.isError ? (
            query.error.code === "not_found" ? (
              <StateView
                title="This workout isn't available."
                action={{
                  label: "Back to History",
                  onPress: () => router.back(),
                }}
              />
            ) : (
              <StateView
                icon="wifi.exclamationmark"
                title="Couldn't load this workout"
                message={query.error.message}
                action={{
                  label: "Try again",
                  onPress: () => void query.refetch(),
                  loading: query.isFetching,
                }}
              />
            )
          ) : (
            <SkeletonCard rows={4} />
          )
        ) : (
          <>
            <View style={{ gap: spacing.xxs }}>
              <Text size="sm" tone="muted">
                {[longDateLabel(detail.dateIso), detail.gymName]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {resumable ? (
                <Text size="sm" weight="medium">
                  In progress
                </Text>
              ) : null}
            </View>
            {resumable ? (
              <Button
                label="Resume workout"
                onPress={() => router.push(workoutHref(loggedSessionId))}
              />
            ) : null}
            {detail.exercises.map((e) => (
              <GroupedList key={e.loggedExerciseId} header={exerciseHeader(e)}>
                {e.sets.length === 0 ? (
                  <ListRow title="Not done" />
                ) : (
                  e.sets.map((s) => (
                    <ListRow
                      key={s.loggedSetId}
                      title={`Set ${s.setNumber}`}
                      value={setValueLabel(s)}
                    />
                  ))
                )}
              </GroupedList>
            ))}
            <Text size="xs" tone="muted" align="center">
              Correcting a set comes to the app in a later update.
            </Text>
            {origin ? (
              <Button
                label="Edit on the web"
                variant="text"
                onPress={() =>
                  void Linking.openURL(
                    `${origin}/history/${encodeURIComponent(loggedSessionId)}`,
                  )
                }
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}
