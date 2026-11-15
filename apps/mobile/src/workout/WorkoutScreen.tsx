import { useCallback, useRef, useState } from "react";
import { Alert, ScrollView, View, type ScrollViewInstance } from "react-native";
import { Stack, router } from "expo-router";
import type { WorkoutDto } from "@overload/shared/contracts/logging";
import { ApiError } from "../api/errors";
import { useCompleteWorkout, useWorkout } from "../api/training";
import { longDateLabel } from "../today/date";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { SkeletonCard } from "../ui/Skeleton";
import { LoadErrorState } from "../ui/LoadErrorState";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  canFinish,
  cardActiveSet,
  cardMode,
  initialExerciseIndex,
  unfinishedExercises,
} from "./card-model";
import { ExerciseCard } from "./ExerciseCard";
import { loggedWorkoutHref, summaryHref } from "./routes";

/** The finish confirmation (design F1), with the web runner's rule and copy. */
export function finishConfirmation(workout: WorkoutDto): {
  title: string;
  message: string;
} | null {
  const unfinished = unfinishedExercises(workout);
  if (unfinished.length === 0) return null;
  const lines = unfinished.map(
    (e) =>
      `${e.name} — ${e.done === 0 ? "not done" : `${e.done} of ${e.planned} sets`}`,
  );
  return {
    title: "Finish with unfinished exercises?",
    message: `${lines.join("\n")}\n\nExercises with no sets are recorded as not done. Partly logged ones keep what you logged.`,
  };
}

export function finishFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network") {
      return "Couldn't finish — Overload needs a connection. Your sets are saved.";
    }
    if (error.temporary) {
      return "Couldn't finish — Overload isn't responding. Your sets are saved.";
    }
    return error.message;
  }
  return "Couldn't finish. Your sets are saved.";
}

/**
 * W1 Workout (Pitch 21e design §6, §15; RD-7, RD-13): one exercise card at a
 * time with Previous / Next, opening on the first unfinished exercise. Finish
 * runs the server's completion rule; the alert first lists what is
 * unfinished, exactly as the web runner does.
 */
export function WorkoutScreen({
  loggedSessionId,
}: {
  loggedSessionId: string;
}) {
  const { colors, spacing } = useTheme();
  const query = useWorkout(loggedSessionId);
  const complete = useCompleteWorkout();
  const [index, setIndex] = useState<number | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const workout = query.data?.workout;
  // Open on the first unfinished card once, when the workout first loads
  // (state adjusted during render, so there is no auto-advance afterwards).
  if (workout && index === null) setIndex(initialExerciseIndex(workout));

  const scrollTop = useCallback(
    () => scroll.current?.scrollTo({ y: 0, animated: false }),
    [],
  );

  if (!workout) {
    return (
      <Frame>
        {query.isError ? (
          <LoadErrorState
            error={query.error}
            subject="This workout"
            request={`GET /workouts/${loggedSessionId}`}
            byId
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            secondaryAction={{ label: "Back", onPress: () => router.back() }}
          />
        ) : (
          <SkeletonCard rows={5} />
        )}
      </Frame>
    );
  }

  if (workout.status === "complete") {
    return (
      <Frame title={workout.sessionName}>
        <StateView
          icon="checkmark.circle"
          title="This workout is finished."
          message="Its sets are in History."
          action={{
            label: "View workout",
            onPress: () => router.replace(loggedWorkoutHref(loggedSessionId)),
          }}
        />
      </Frame>
    );
  }

  const exercises = workout.exercises;
  const i = Math.min(index ?? 0, Math.max(0, exercises.length - 1));
  const current = exercises[i];
  const isLast = i >= exercises.length - 1;
  const next = exercises[i + 1];
  const finishable = canFinish(workout);
  const currentDone =
    current !== undefined &&
    (cardMode(current) !== "log" || cardActiveSet(current) === null);

  function go(to: number) {
    setIndex(Math.min(exercises.length - 1, Math.max(0, to)));
    scrollTop();
  }

  async function finish() {
    setFinishError(null);
    try {
      await complete.mutateAsync(loggedSessionId);
      void haptic.success();
      router.replace(summaryHref(loggedSessionId));
    } catch (error) {
      void haptic.warning();
      setFinishError(finishFailureMessage(error));
    }
  }

  function requestFinish() {
    if (!finishable || complete.isPending || !workout) return;
    const confirm = finishConfirmation(workout);
    if (!confirm) return void finish();
    Alert.alert(confirm.title, confirm.message, [
      { text: "Keep logging", style: "cancel" },
      { text: "Finish workout", onPress: () => void finish() },
    ]);
  }

  const dateLine = [
    workout.isHistoricalDate
      ? `${longDateLabel(workout.scheduledFor)} · a past day`
      : longDateLabel(workout.scheduledFor),
    workout.gymName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Stack.Screen
        options={{
          title: workout.sessionName,
          headerRight: () => (
            <Button
              label="Finish"
              variant="text"
              disabled={!finishable || complete.isPending}
              onPress={requestFinish}
            />
          ),
        }}
      />
      <ScrollView
        ref={scroll}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      >
        <Text size="xs" tone="muted">
          {dateLine}
        </Text>
        {current ? (
          <ExerciseCard
            // Keyed by occurrence, so a draft never leaks to another card.
            key={current.loggedExerciseId}
            card={current}
            workout={workout}
            position={{ index: i, total: exercises.length }}
          />
        ) : (
          <StateView
            title="No exercises in this workout."
            message="Add exercises to the session on the web."
          />
        )}
        {finishError ? <Banner message={finishError} /> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            label="Previous"
            variant="secondary"
            disabled={i === 0}
            onPress={() => go(i - 1)}
            style={{ minWidth: 104 }}
          />
          {!isLast && next ? (
            <Button
              label={`Next: ${next.performedExerciseName}`}
              variant={currentDone ? "primary" : "secondary"}
              onPress={() => go(i + 1)}
              style={{ flex: 1 }}
            />
          ) : (
            <Button
              label="Finish workout"
              disabled={!finishable}
              loading={complete.isPending}
              onPress={requestFinish}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

function Frame({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <>
      {title ? <Stack.Screen options={{ title }} /> : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {children}
      </ScrollView>
    </>
  );
}
