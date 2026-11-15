import { Linking, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { formatWeight } from "@overload/shared/logging/set-entry";
import { rirSuffix } from "@overload/shared/logging/rir";
import type { LoggedWorkoutDetailDto } from "@overload/shared/contracts/logging";
import { useLoggedWorkout } from "../api/training";
import { webOrigin } from "../config/env";
import { longDateLabel } from "../today/date";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { workoutHref } from "../workout/routes";

type DetailSet = LoggedWorkoutDetailDto["exercises"][number]["sets"][number];

/** "255 lbs × 5 · 2 RIR · extra", or "12 reps" for bodyweight. */
export function setValueLabel(s: DetailSet): string {
  const value =
    s.weightLbs === null
      ? `${s.reps} reps`
      : `${formatWeight(s.weightLbs)} lbs × ${s.reps}`;
  const rir = rirSuffix(s.rir);
  return `${value}${rir ? ` ${rir}` : ""}${s.extra ? " · extra" : ""}`;
}

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
  /** From the History row; only decides whether Resume is offered. */
  inProgress: boolean;
}) {
  const { colors, spacing } = useTheme();
  const query = useLoggedWorkout(loggedSessionId);
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
              {inProgress ? (
                <Text size="sm" weight="medium">
                  In progress
                </Text>
              ) : null}
            </View>
            {inProgress ? (
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
