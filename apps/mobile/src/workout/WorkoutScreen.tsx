import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  ScrollView,
  View,
  type ScrollViewInstance,
} from "react-native";
import { Stack, router } from "expo-router";
import type { WorkoutDto } from "@overload/shared/contracts/logging";
import { ApiError } from "../api/errors";
import {
  useChangeGym,
  useCompleteWorkout,
  useFetchGyms,
  useWorkout,
  useWorkoutInsights,
} from "../api/training";
import { longDateLabel } from "../today/date";
import { pickGymFromSheet } from "../today/useStartWorkout";
import { DeloadWeekBanner } from "../insights/DeloadWeekBanner";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { SkeletonCard } from "../ui/Skeleton";
import { LoadErrorState } from "../ui/LoadErrorState";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { tint } from "../ui/theme";
import { useTheme } from "../ui/ThemeProvider";
import {
  canFinish,
  cardActiveSet,
  cardMode,
  initialExerciseIndex,
  unfinishedExercises,
} from "./card-model";
import { ExerciseCard } from "./ExerciseCard";
import { callForCard, insightFor } from "./insight-model";
import { useKeepAboveKeyboard } from "./keep-above-keyboard";
import { changeFailureMessage } from "./messages";
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
  const changeGym = useChangeGym();
  const fetchGyms = useFetchGyms();
  const [gymNote, setGymNote] = useState<{
    tone: "error" | "info";
    message: string;
  } | null>(null);
  const choosingGym = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const finishing = useRef(false);
  // The active set stays above the keyboard and its keypad bar (OVE-213).
  const {
    row: activeRowRef,
    content: contentRef,
    reveal: revealActiveRow,
  } = useKeepAboveKeyboard(scroll, spacing.md);

  const workout = query.data?.workout;
  // The cards' calls (Pitch 21g RD-1, RD-2): a separate read of the gated
  // workout, only while it's in progress. Logging never waits for it.
  const insights = useWorkoutInsights(loggedSessionId, {
    enabled: workout?.status === "in_progress",
  });
  /** Which cards show their evidence, by occurrence; kept across Next/Previous. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  // Finished by THIS screen: it is already on its way to the summary, so it
  // keeps showing the workout instead of flashing "finished" as it leaves.
  if (workout.status === "complete" && !complete.isSuccess) {
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
    // A synchronous guard: a second tap before the re-render sends nothing.
    if (finishing.current) return;
    finishing.current = true;
    setFinishError(null);
    try {
      await complete.mutateAsync(loggedSessionId);
      void haptic.success();
      router.replace(summaryHref(loggedSessionId));
    } catch (error) {
      void haptic.warning();
      setFinishError(finishFailureMessage(error));
    } finally {
      finishing.current = false;
    }
  }

  /**
   * Change where this workout is logged (Pitch 21f RD-5): the same sheet Start
   * uses, only while the server says the gym isn't locked. The workout is read
   * again afterwards, so every machine and cable card shows that gym's history.
   */
  async function chooseGym() {
    if (choosingGym.current || !workout) return;
    choosingGym.current = true;
    Keyboard.dismiss();
    setGymNote(null);
    try {
      const { gyms } = await fetchGyms();
      if (gyms.length <= 1) {
        setGymNote({
          tone: "info",
          message: "This is your only gym. Add another on the web.",
        });
        return;
      }
      const index = await pickGymFromSheet(
        gyms.map((g) =>
          g.name === workout.gymName ? `${g.name} (current)` : g.name,
        ),
      );
      const gym = index === null ? null : gyms[index];
      if (!gym) return;
      await changeGym.mutateAsync({ loggedSessionId, gymId: gym.id });
      void haptic.light();
    } catch (error) {
      void haptic.warning();
      setGymNote({
        tone: "error",
        message: changeFailureMessage(error, "change the gym"),
      });
      // Refused (a set was logged meanwhile): show the workout as it is.
      void query.refetch();
    } finally {
      choosingGym.current = false;
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
      >
        {/* Measured to find the scroll offset (OVE-213). */}
        <View ref={contentRef} style={{ padding: spacing.lg, gap: spacing.md }}>
          {/* The server says this workout's date is in a scheduled-deload
              week (Pitch 21g RD-11); every plan sees it. */}
          {workout.scheduledDeloadWeek ? <DeloadWeekBanner /> : null}
          <ExerciseProgress
            exercises={exercises}
            index={i}
            line={
              exercises.length > 0
                ? `Exercise ${i + 1} of ${exercises.length} · ${dateLine}`
                : dateLine
            }
          />
          {!workout.gymLocked && workout.gymName ? (
            // Before the first set only: after it the server locks the gym,
            // and the gym stays in the line above.
            <View style={{ alignItems: "flex-start" }}>
              <Button
                label="Change gym"
                variant="text"
                loading={changeGym.isPending}
                accessibilityHint={`This workout is at ${workout.gymName}. You can change it until the first set is logged.`}
                onPress={() => void chooseGym()}
              />
            </View>
          ) : null}
          {gymNote ? (
            <Banner tone={gymNote.tone} message={gymNote.message} />
          ) : null}
          {current ? (
            <ExerciseCard
              // Keyed by occurrence, so a draft never leaks to another card.
              key={current.loggedExerciseId}
              card={current}
              workout={workout}
              position={{ index: i, total: exercises.length }}
              activeRowRef={activeRowRef}
              onActiveRowLayout={revealActiveRow}
              insight={{
                view: insightFor(
                  {
                    isFetching: insights.isFetching,
                    isError: insights.isError,
                    isPaused: insights.isPaused,
                    hasData: insights.data !== undefined,
                  },
                  callForCard(
                    insights.data?.progression,
                    current.loggedExerciseId,
                  ),
                ),
                expanded: expanded[current.loggedExerciseId] === true,
                onToggle: () =>
                  setExpanded((e) => ({
                    ...e,
                    [current.loggedExerciseId]: !e[current.loggedExerciseId],
                  })),
                onRetry: () => void insights.refetch(),
              }}
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
                // One line at any length or text size: the name truncates and
                // VoiceOver still reads it whole (OVE-213).
                label={`Next: ${next.performedExerciseName}`}
                numberOfLines={1}
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
        </View>
      </ScrollView>
    </>
  );
}

/**
 * Where the lifter is in the workout (Checkpoint A, RD-24): one segment per
 * exercise, filled once it has nothing left to log or while it's the open
 * card, then "Exercise n of N · date · gym". The words carry the meaning; the
 * segments are decoration for sighted users.
 */
function ExerciseProgress({
  exercises,
  index,
  line,
}: {
  exercises: WorkoutDto["exercises"];
  index: number;
  line: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {exercises.length > 1 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", gap: spacing.xs }}
        >
          {exercises.map((e, n) => {
            const finished = cardMode(e) !== "log" || cardActiveSet(e) === null;
            return (
              <View
                key={e.loggedExerciseId}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: finished
                    ? colors.primary
                    : n === index
                      ? tint(colors.primary, 0.45)
                      : colors.border,
                }}
              />
            );
          })}
        </View>
      ) : null}
      <Text size="sm" tone="muted">
        {line}
      </Text>
    </View>
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
