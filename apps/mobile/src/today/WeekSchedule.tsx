import { useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type {
  ThisWeekDay,
  ThisWeekDto,
  ThisWeekWorkout,
} from "@overload/shared/contracts/schedule";
import { formatPlanDate } from "@overload/shared/plan/calendar";
import { ApiError } from "../api/errors";
import { useMoveWorkout, useSkipUpcomingWorkout } from "../api/schedule";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { tint } from "../ui/theme";
import { useTheme } from "../ui/ThemeProvider";
import { loggedWorkoutHref, workoutHref } from "../workout/routes";
import {
  afterSwapLines,
  cellLabel,
  dayActions,
  dayLabel,
  previewDateLine,
  skipConfirmation,
  stateWord,
  swapOptions,
  trainTodayConfirmation,
  weekHeading,
  type SwapOption,
} from "./week-model";

/** A change the server refused: its words, and Reload when the week is stale. */
export type ScheduleFailure = { message: string; stale: boolean };

export function failureOf(error: unknown): ScheduleFailure {
  if (error instanceof ApiError) {
    return { message: error.message, stale: error.code === "conflict" };
  }
  return {
    message: "Couldn't change your week. Nothing was changed.",
    stale: false,
  };
}

/**
 * The seven days of this block week (OVE-241; chore spec §3): today marked
 * and selected first; a finished workout checked, a skipped one struck
 * through, rest days quiet. Selecting a day only changes what shows below.
 */
export function WeekStrip({
  week,
  selectedIso,
  onSelect,
}: {
  week: ThisWeekDto;
  selectedIso: string;
  onSelect: (iso: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text size="sm" weight="medium" accessibilityRole="header">
        {weekHeading(week)}
      </Text>
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: "row", gap: spacing.xxs }}
      >
        {week.days.map((day) => {
          const selected = day.dateIso === selectedIso;
          const w = day.workout;
          const skippedOnly = !w && day.skipped.length > 0;
          return (
            <Pressable
              key={day.dateIso}
              testID={`week-day-${day.dateIso}`}
              accessibilityRole="tab"
              accessibilityLabel={dayLabel(day)}
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) void haptic.selection();
                onSelect(day.dateIso);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 68,
                paddingVertical: spacing.xs,
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: selected ? colors.primary : "transparent",
                backgroundColor: selected ? colors.secondary : "transparent",
                opacity: pressed ? 0.7 : day.isPast && !selected ? 0.6 : 1,
              })}
            >
              <Text size="xs" tone="muted">
                {day.weekday}
              </Text>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: day.isToday ? colors.primary : "transparent",
                }}
              >
                <Text
                  size="sm"
                  weight={day.isToday ? "semibold" : "regular"}
                  tone={day.isToday ? "inverse" : "default"}
                >
                  {day.dayOfMonth}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 1,
                  maxWidth: "100%",
                  paddingHorizontal: 1,
                }}
              >
                {w?.state === "complete" ? (
                  <Symbol name="checkmark" size={9} color={colors.primary} />
                ) : null}
                <Text
                  size="xs"
                  tone={w ? "default" : "muted"}
                  numberOfLines={1}
                  style={[
                    { flexShrink: 1, fontSize: 11 },
                    skippedOnly ? { textDecorationLine: "line-through" } : null,
                  ]}
                >
                  {cellLabel(day)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {week.blockedReason ? (
        <Text size="sm" tone="muted">
          {week.blockedReason}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Skip, Train today, and Swap (chore spec §3): each confirmed first, sent
 * once (a ref guards a double tap), and shown as done only after the server
 * answers. A refusal keeps the lifter where they are, in the server's words.
 */
export function useWeekChanges(opts: {
  week: ThisWeekDto;
  onDone: (note: string) => void;
  /** Train today: the usual start (gym choice, unfinished warning) after the move. */
  startMoved: (w: ThisWeekWorkout) => void;
}) {
  const skip = useSkipUpcomingWorkout();
  const move = useMoveWorkout();
  const [failure, setFailure] = useState<ScheduleFailure | null>(null);
  const [swapFrom, setSwapFrom] = useState<{
    day: ThisWeekDay;
    workout: ThisWeekWorkout;
  } | null>(null);
  const busy = useRef(false);
  const pending = skip.isPending || move.isPending;

  async function guarded(run: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    try {
      await run();
    } catch (error) {
      void haptic.warning();
      setFailure(failureOf(error));
    } finally {
      busy.current = false;
    }
  }

  function askSkip(day: ThisWeekDay, w: ThisWeekWorkout) {
    const ask = skipConfirmation(day, w);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip workout",
        style: "destructive",
        onPress: () =>
          void guarded(async () => {
            await skip.mutateAsync({
              mesocycleId: opts.week.mesocycleId,
              body: { sessionId: w.sessionId, scheduledFor: w.scheduledFor },
            });
            void haptic.success();
            opts.onDone(`${w.sessionName} skipped this week.`);
          }),
      },
    ]);
  }

  function askTrainToday(day: ThisWeekDay, w: ThisWeekWorkout) {
    const ask = trainTodayConfirmation(day, w);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to today",
        onPress: () =>
          void guarded(async () => {
            await move.mutateAsync({
              mesocycleId: opts.week.mesocycleId,
              body: {
                sessionId: w.sessionId,
                scheduledFor: w.scheduledFor,
                from: day.dateIso,
                to: opts.week.today,
                occupant: null,
              },
            });
            void haptic.success();
            opts.onDone(
              `${w.sessionName} moved to today. Next week is unchanged.`,
            );
            opts.startMoved(w);
          }),
      },
    ]);
  }

  async function confirmSwap(target: ThisWeekDay) {
    const from = swapFrom;
    if (!from) return;
    await guarded(async () => {
      await move.mutateAsync({
        mesocycleId: opts.week.mesocycleId,
        body: {
          sessionId: from.workout.sessionId,
          scheduledFor: from.workout.scheduledFor,
          from: from.day.dateIso,
          to: target.dateIso,
          occupant: target.workout
            ? {
                sessionId: target.workout.sessionId,
                scheduledFor: target.workout.scheduledFor,
              }
            : null,
        },
      });
      void haptic.success();
      setSwapFrom(null);
      opts.onDone("Week updated. Next week is unchanged.");
    });
  }

  return {
    failure,
    clearFailure: () => setFailure(null),
    pending,
    askSkip,
    askTrainToday,
    swapFrom,
    openSwap: (day: ThisWeekDay, workout: ThisWeekWorkout) => {
      setFailure(null);
      setSwapFrom({ day, workout });
    },
    closeSwap: () => setSwapFrom(null),
    confirmSwap,
  };
}

export type WeekChanges = ReturnType<typeof useWeekChanges>;

/** The refusal banner, with Reload when the week changed under the lifter. */
export function ChangeFailure({
  failure,
  onReload,
}: {
  failure: ScheduleFailure | null;
  onReload: () => void;
}) {
  if (!failure) return null;
  return (
    <Banner
      message={failure.message}
      action={
        failure.stale
          ? {
              label: "Reload",
              hint: "Reads this week again",
              onPress: onReload,
            }
          : undefined
      }
    />
  );
}

/** Today's own workout: Swap day and Skip workout, above Today's block. */
export function TodayChanges({
  week,
  changes,
}: {
  week: ThisWeekDto;
  changes: WeekChanges;
}) {
  const { spacing } = useTheme();
  const day = week.days.find((d) => d.isToday);
  const w = day?.workout;
  if (!day || !w || !dayActions(week, day).swap) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: spacing.xs,
      }}
    >
      <Button
        label="Swap day"
        variant="text"
        disabled={changes.pending}
        accessibilityHint={`Trade today's ${w.sessionName} with another day this week`}
        onPress={() => changes.openSwap(day, w)}
      />
      <Button
        label="Skip workout"
        variant="text"
        disabled={changes.pending}
        accessibilityHint={`Marks today's ${w.sessionName} skipped`}
        onPress={() => changes.askSkip(day, w)}
      />
    </View>
  );
}

/** Another day of the week: what sits on it, and what can change (chore §3). */
export function DayPreview({
  week,
  day,
  changes,
  onBackToToday,
}: {
  week: ThisWeekDto;
  day: ThisWeekDay;
  changes: WeekChanges;
  onBackToToday: () => void;
}) {
  const { spacing } = useTheme();
  const w = day.workout;
  const actions = dayActions(week, day);
  const state = w ? stateWord(w) : null;
  return (
    <Surface testID="week-day-preview" style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text size="sm" tone="muted">
          {previewDateLine(day)}
        </Text>
        {w ? (
          <Text size="lg" weight="semibold" accessibilityRole="header">
            {w.sessionName}
            {state ? <Text size="lg" tone="muted">{` · ${state}`}</Text> : null}
          </Text>
        ) : (
          <Text size="lg" weight="semibold" accessibilityRole="header">
            Rest day
          </Text>
        )}
        {w?.movedFrom ? (
          <Text size="sm" tone="muted">
            {`Moved this week from ${formatPlanDate(w.movedFrom)}.`}
          </Text>
        ) : null}
      </View>
      {w && w.state === "upcoming" && w.exercises.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {w.exercises.map((e, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: spacing.md,
              }}
            >
              <Text size="sm" style={{ flex: 1 }}>
                {e.name}
              </Text>
              <Text size="sm" tone="muted">
                {e.scheme}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {day.skipped.map((s) => (
        <Text key={s.sessionId} size="sm" tone="muted">
          {`${s.sessionName} is skipped this week.`}
        </Text>
      ))}
      <View style={{ gap: spacing.sm }}>
        {w?.loggedSessionId && w.state === "in_progress" ? (
          <Button
            label="Resume workout"
            onPress={() => router.push(workoutHref(w.loggedSessionId!))}
          />
        ) : null}
        {w?.loggedSessionId && w.state === "complete" ? (
          <Button
            label="View workout"
            variant="secondary"
            onPress={() => router.push(loggedWorkoutHref(w.loggedSessionId!))}
          />
        ) : null}
        {w && actions.trainToday ? (
          <Button
            label="Train today"
            disabled={changes.pending}
            onPress={() => changes.askTrainToday(day, w)}
          />
        ) : null}
        {w && actions.swap ? (
          <Button
            label="Swap day"
            variant="secondary"
            disabled={changes.pending}
            onPress={() => changes.openSwap(day, w)}
          />
        ) : null}
        {w && actions.skip ? (
          <Button
            label="Skip workout"
            variant="secondary"
            disabled={changes.pending}
            onPress={() => changes.askSkip(day, w)}
          />
        ) : null}
      </View>
      {actions.takenNote ? (
        <Text size="sm" tone="muted">
          {actions.takenNote}
        </Text>
      ) : null}
      {w?.adjustable && week.blockedReason ? (
        <Text size="sm" tone="muted">
          {week.blockedReason}
        </Text>
      ) : null}
      <View style={{ alignItems: "flex-start" }}>
        <Button label="Back to today" variant="text" onPress={onBackToToday} />
      </View>
    </Surface>
  );
}

/**
 * Swap with… (chore spec §3): a page sheet listing this week's days from
 * today on; a day whose workout can't move is shown, disabled, with why.
 * Choosing one shows the week after the swap; Swap days confirms.
 */
export function SwapSheet({
  week,
  changes,
  onReload,
}: {
  week: ThisWeekDto;
  changes: WeekChanges;
  /** Read the week again (after a stale-week refusal). */
  onReload: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const from = changes.swapFrom;
  const [target, setTarget] = useState<string | null>(null);
  const options: SwapOption[] = from ? swapOptions(week, from.day) : [];
  const chosen = options.find((o) => o.day.dateIso === target) ?? null;
  const close = () => {
    setTarget(null);
    changes.closeSwap();
  };
  return (
    <Modal
      visible={from !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Button label="Cancel" variant="text" onPress={close} />
          <Text
            weight="semibold"
            accessibilityRole="header"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {from ? `Swap ${from.workout.sessionName} with…` : ""}
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        >
          <Text size="sm" tone="muted">
            Pick a day this week. The two days trade places for this week only;
            your plan and next week are unchanged.
          </Text>
          <View
            accessibilityRole="radiogroup"
            style={{
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              overflow: "hidden",
            }}
          >
            {options.map((o, i) => {
              const selected = o.day.dateIso === target;
              return (
                <Pressable
                  key={o.day.dateIso}
                  accessibilityRole="radio"
                  accessibilityLabel={`${o.label}, ${o.holds}${o.blocked ? `, ${o.blocked}` : ""}`}
                  accessibilityState={{
                    checked: selected,
                    disabled: o.blocked !== null,
                  }}
                  disabled={o.blocked !== null}
                  onPress={() => {
                    void haptic.selection();
                    setTarget(o.day.dateIso);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    paddingHorizontal: spacing.lg,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                    opacity: o.blocked ? 0.45 : pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: selected
                        ? colors.primary
                        : colors.mutedForeground,
                      backgroundColor: selected
                        ? colors.primary
                        : "transparent",
                    }}
                  />
                  <Text style={{ flex: 1 }}>{o.label}</Text>
                  <Text tone="muted">
                    {o.holds}
                    {o.blocked ? ` · ${o.blocked}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {from && chosen ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                borderRadius: radius.lg,
                padding: spacing.md,
                gap: spacing.xxs,
                backgroundColor: tint(colors.mutedForeground, 0.1),
              }}
            >
              <Text weight="semibold">This week after the swap</Text>
              {afterSwapLines(from.day, from.workout, chosen.day).map((l) => (
                <Text key={l}>{l}</Text>
              ))}
            </View>
          ) : null}
          <ChangeFailure
            failure={changes.failure}
            onReload={() => {
              close();
              onReload();
            }}
          />
          <Button
            label="Swap days"
            size="lg"
            loading={changes.pending}
            disabled={!chosen}
            onPress={() => {
              if (chosen)
                void changes
                  .confirmSwap(chosen.day)
                  .then(() => setTarget(null));
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
