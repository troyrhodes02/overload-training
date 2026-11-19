import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import type { LoggedWorkoutDetailDto } from "@overload/shared/contracts/logging";
import {
  useEditPlannedSets,
  useLoggedWorkout,
  useWorkout,
} from "../api/training";
import { longDateLabel } from "../today/date";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { SkeletonCard } from "../ui/Skeleton";
import { LoadErrorState } from "../ui/LoadErrorState";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { fewerSetsConfirmation } from "../workout/exercise-actions";
import { haptic } from "../ui/haptics";
import { setValueLabel } from "../workout/labels";
import { changeFailureMessage } from "../workout/messages";
import { editSetHref, workoutHref } from "../workout/routes";

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

/** A short exercise: fewer working (not extra) sets logged than planned. */
export function shortOfPlan(
  e: LoggedWorkoutDetailDto["exercises"][number],
): { workingSets: number; plannedSets: number } | null {
  const workingSets = e.sets.filter((s) => !s.extra).length;
  return e.sets.length > 0 && workingSets < e.plannedSets
    ? { workingSets, plannedSets: e.plannedSets }
    : null;
}

/** The short-of-plan sentence, shared with the summary (Pitch 21g). */
export function shortOfPlanText(short: {
  workingSets: number;
  plannedSets: number;
}): string {
  return `${short.workingSets} of ${short.plannedSets} planned sets — counts toward your strength trend, not your progress check.`;
}

/**
 * H2 Logged workout (Pitch 21e design §6, §15; Pitch 21f RD-10, RD-12, RD-21):
 * exactly what was logged, and where it is corrected. A set row opens Edit
 * set, in a finished workout too. A short exercise can be counted as planned.
 * Archived exercises and gyms show by name. Nothing here can delete a set or
 * change its exercise, gym, or date.
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
  // Only a successful answer fetched since this screen opened counts. A
  // disabled, still-pending, or failed query still returns whatever is
  // cached, and a cached "in progress" from before a finish must never offer
  // Resume (Checkpoint A round 2, owner finding 1).
  const resumable =
    inProgress &&
    status.isSuccess &&
    status.isFetchedAfterMount &&
    status.data.workout.status === "in_progress";
  const detail = query.data?.detail;
  const editPlanned = useEditPlannedSets();
  const [plannedError, setPlannedError] = useState<{
    loggedExerciseId: string;
    message: string;
  } | null>(null);

  /** Design P1: the one change that can't be undone, so it asks first. */
  function askFewerSets(e: LoggedWorkoutDetailDto["exercises"][number]) {
    const short = shortOfPlan(e);
    const ask = short
      ? fewerSetsConfirmation({
          name: e.performedName,
          plannedSets: short.plannedSets,
          savedWorkingSets: short.workingSets,
        })
      : null;
    if (!ask) return;
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: ask.confirm,
        onPress: () => {
          setPlannedError(null);
          editPlanned
            .mutateAsync({
              loggedSessionId,
              loggedExerciseId: e.loggedExerciseId,
              plannedSets: ask.plannedSets,
            })
            .then(() => void haptic.light())
            .catch((error: unknown) => {
              void haptic.warning();
              setPlannedError({
                loggedExerciseId: e.loggedExerciseId,
                message: changeFailureMessage(error, "change the planned sets"),
              });
            });
        },
      },
    ]);
  }

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
            <LoadErrorState
              error={query.error}
              subject="This workout"
              request={`GET /history/${loggedSessionId}`}
              byId
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              secondaryAction={{
                label: "Back to History",
                onPress: () => router.back(),
              }}
            />
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
            {detail.exercises.map((e) => {
              const short = shortOfPlan(e);
              return (
                <View key={e.loggedExerciseId} style={{ gap: spacing.sm }}>
                  <GroupedList header={exerciseHeader(e)}>
                    {e.sets.length === 0 ? (
                      <ListRow title="Not done" />
                    ) : (
                      e.sets.map((s) => (
                        <ListRow
                          key={s.loggedSetId}
                          title={`Set ${s.setNumber}`}
                          value={setValueLabel(s)}
                          accessory="chevron"
                          accessibilityHint="Opens this set to correct it"
                          onPress={() =>
                            router.push(
                              editSetHref(
                                loggedSessionId,
                                s.loggedSetId,
                                "history",
                              ),
                            )
                          }
                        />
                      ))
                    )}
                  </GroupedList>
                  {short ? (
                    <View
                      style={{
                        gap: spacing.xxs,
                        paddingHorizontal: spacing.xs,
                        alignItems: "flex-start",
                      }}
                    >
                      <Text size="xs" tone="muted">
                        {shortOfPlanText(short)}
                      </Text>
                      <Button
                        label="I meant to do fewer"
                        variant="text"
                        loading={
                          editPlanned.isPending &&
                          editPlanned.variables?.loggedExerciseId ===
                            e.loggedExerciseId
                        }
                        disabled={editPlanned.isPending}
                        accessibilityLabel={`I meant to do fewer sets of ${e.performedName}`}
                        onPress={() => askFewerSets(e)}
                      />
                    </View>
                  ) : null}
                  {plannedError?.loggedExerciseId === e.loggedExerciseId ? (
                    <Banner message={plannedError.message} />
                  ) : null}
                </View>
              );
            })}
            <Text size="xs" tone="muted" align="center">
              Corrections change this record only. Exercise, gym, and date
              can&apos;t be changed.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}
