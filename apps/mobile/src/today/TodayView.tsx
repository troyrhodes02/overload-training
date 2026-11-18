import { Fragment, useRef, useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import type {
  DashboardDto,
  DashboardTodayDto,
  MissedDayInfo,
} from "@overload/shared/contracts/logging";
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
import {
  cardioHref,
  cardioLabel,
  cardioTarget,
  plannedComparison,
} from "../cardio/cardio-model";
import type { TodayDto } from "@overload/shared/contracts/views";
import {
  TRAINING_KEYS,
  useRefetchWhenFocused,
  useResolveMissedDay,
  useToday,
} from "../api/training";
import { ApiError } from "../api/errors";
import { webOrigin } from "../config/env";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { Eyebrow, SectionHeader } from "../ui/ScreenHeader";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip, Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { TabScreen } from "../ui/TabScreen";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { loggedWorkoutHref } from "../workout/routes";
import { longDateLabel, weekdayLabel } from "./date";
import { useStartOrResume, type StartState } from "./useStartWorkout";

/**
 * T1 Today (Pitch 21e design §6, §15; Checkpoint A RD-23, RD-24): the
 * server's dashboard, rendered. Every state comes from the dashboard's
 * `kind`; nothing about the schedule is derived here. A missed day is settled
 * here with the web's three choices, through the server's own resolver. No
 * progression calls, goals, or Pro note (21g/21i).
 */
export function TodayView() {
  const today = useToday();
  useRefetchWhenFocused(TRAINING_KEYS.today);
  const starter = useStartOrResume();
  // What a resolution did, for the day it was made on (RD-23).
  const [resolved, setResolved] = useState<{
    note: string;
    on: string;
  } | null>(null);

  const body = (() => {
    if (today.data) {
      return (
        <TodayContent
          view={today.data}
          stale={today.isError}
          starter={starter}
          resolvedNote={
            resolved?.on === today.data.today ? resolved.note : null
          }
          onResolved={(note) => setResolved({ note, on: today.data!.today })}
        />
      );
    }
    if (today.isError) {
      return (
        <LoadErrorState
          error={today.error}
          subject="Today"
          request="GET /today"
          onRetry={() => void today.refetch()}
          retrying={today.isFetching}
        />
      );
    }
    return <SkeletonCard />;
  })();

  const view = today.data;
  return (
    <TabScreen
      eyebrow={view ? longDateLabel(view.today) : undefined}
      title="Today"
      subtitle={view?.greeting}
      refreshing={today.isRefetching}
      onRefresh={() => void today.refetch()}
    >
      {body}
    </TabScreen>
  );
}

function openWeb(path = "/") {
  const origin = webOrigin();
  if (origin) void Linking.openURL(`${origin}${path}`);
}

type Starter = ReturnType<typeof useStartOrResume>;

function TodayContent({
  view,
  stale,
  starter,
  resolvedNote,
  onResolved,
}: {
  view: TodayDto;
  stale: boolean;
  starter: Starter;
  resolvedNote: string | null;
  onResolved: (note: string) => void;
}) {
  const { spacing } = useTheme();
  // The note belongs to the moment just after a resolution: once Today
  // shows another missed day it would describe the wrong one.
  const showNote = resolvedNote && view.dashboard.kind !== "missed_day";
  return (
    <View style={{ gap: spacing.xl }}>
      {stale ? (
        <Banner
          tone="info"
          message="Can't reach Overload. Showing what was last loaded."
        />
      ) : null}
      {showNote ? <Banner tone="info" message={resolvedNote} /> : null}
      <DashboardBlock
        dashboard={view.dashboard}
        stale={stale}
        starter={starter}
        onResolved={onResolved}
      />
    </View>
  );
}

function DashboardBlock({
  dashboard,
  stale,
  starter,
  onResolved,
}: {
  dashboard: DashboardDto;
  stale: boolean;
  starter: Starter;
  onResolved: (note: string) => void;
}) {
  const { colors, spacing } = useTheme();
  switch (dashboard.kind) {
    case "no_plan":
      return (
        <StateView
          icon="list.bullet.rectangle"
          title="No active plan."
          message="Build and activate a plan on the web. Its workouts show up here."
          action={{
            label: "Open Plan on the web",
            onPress: () => openWeb("/plan"),
          }}
        />
      );
    case "rest":
      // A cardio-only day: the cardio is the day's training, so it is the
      // focal block with the primary action (Pitch 21f; the web's layout).
      if (dashboard.cardio.length > 0) {
        return <CardioDay entries={dashboard.cardio} week={dashboard.week} />;
      }
      return (
        <Surface style={{ gap: spacing.md }}>
          <Eyebrow>{`Week ${dashboard.week}`}</Eyebrow>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Symbol name="moon.zzz" size={24} color={colors.mutedForeground} />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text size="lg" weight="semibold" accessibilityRole="header">
                Rest day
              </Text>
              <Text size="sm" tone="muted">
                No lifting planned today.
              </Text>
            </View>
          </View>
        </Surface>
      );
    case "missed_day":
      return (
        <View style={{ gap: spacing.xl }}>
          <MissedDayCard
            missed={dashboard.missed}
            stale={stale}
            starter={starter}
            onResolved={onResolved}
          />
          {dashboard.below ? (
            // Dimmed and inert until the missed day is settled, as on the
            // web (RD-5).
            <View
              pointerEvents="none"
              style={{ opacity: 0.55 }}
              accessibilityState={{ disabled: true }}
            >
              <WorkoutCard
                day={dashboard.below}
                waitingOn={missedDayLabel(dashboard.missed)}
              />
            </View>
          ) : null}
          <CardioSection entries={dashboard.cardio} />
        </View>
      );
    default:
      return (
        <View style={{ gap: spacing.xl }}>
          <WorkoutCard day={dashboard}>
            <DayActions day={dashboard} stale={stale} starter={starter} />
          </WorkoutCard>
          <CardioSection entries={dashboard.cardio} />
        </View>
      );
  }
}

function DayActions({
  day,
  stale,
  starter,
}: {
  day: DashboardTodayDto;
  stale: boolean;
  starter: Starter;
}) {
  const { spacing } = useTheme();
  if (day.kind === "complete") {
    return day.loggedSessionId ? (
      <Button
        label="View workout"
        variant="secondary"
        onPress={() => router.push(loggedWorkoutHref(day.loggedSessionId!))}
      />
    ) : null;
  }
  return (
    <View style={{ gap: spacing.md }}>
      <StartNote state={starter.state} />
      <Button
        label={day.kind === "in_progress" ? "Resume workout" : "Start workout"}
        loading={starter.state.kind === "busy"}
        // A start needs the server; Resume only opens what it already has.
        disabled={stale && day.kind === "pending"}
        onPress={() => void starter.run(day)}
      />
    </View>
  );
}

function StartNote({ state }: { state: StartState }) {
  const { spacing } = useTheme();
  if (state.kind === "no_gym") {
    return (
      <View style={{ gap: spacing.sm }}>
        <Banner
          tone="info"
          message="Add the gym you train at on the web first."
        />
        <Button
          label="Open Overload on the web"
          variant="text"
          onPress={() => openWeb("/gyms")}
        />
      </View>
    );
  }
  if (state.kind === "error") return <Banner message={state.message} />;
  return null;
}

const STATUS: Record<
  DashboardTodayDto["kind"],
  { label: string; tone: "primary" | "progress" }
> = {
  pending: { label: "Ready", tone: "primary" },
  in_progress: { label: "In progress", tone: "primary" },
  complete: { label: "Done", tone: "progress" },
};

/** The size of a day: "2 exercises", or "1 of 2 exercises logged". */
export function dayMeta(day: DashboardTodayDto): string {
  const total = day.exercises.length;
  const noun = total === 1 ? "exercise" : "exercises";
  if (day.kind === "pending") return `${total} ${noun}`;
  const done = day.exercises.filter((e) => e.done).length;
  return `${done} of ${total} ${noun} logged`;
}

/**
 * The day's workout (design §15 T1; Checkpoint A): the week and status, the
 * session, its size, the planned list, then its one action. `waitingOn` shows
 * it held behind a missed day, with no action.
 */
export function WorkoutCard({
  day,
  waitingOn,
  children,
}: {
  day: DashboardTodayDto;
  waitingOn?: string;
  children?: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const status = STATUS[day.kind];
  const week = `Week ${day.week}${day.scheduledDeloadWeek ? " · Deload week" : ""}`;
  return (
    <Surface style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          <Eyebrow>{week}</Eyebrow>
          {waitingOn ? (
            <Chip label="Waiting" />
          ) : (
            <Chip label={status.label} tone={status.tone} />
          )}
        </View>
        <View style={{ gap: spacing.xxs }}>
          <Text size="2xl" weight="semibold" accessibilityRole="header">
            {day.sessionName}
          </Text>
          <Text size="sm" tone="muted">
            {waitingOn
              ? `${dayMeta(day)} · opens once ${waitingOn} is settled`
              : dayMeta(day)}
          </Text>
        </View>
      </View>
      {waitingOn ? null : (
        <View>
          {day.exercises.map((e, i) => (
            <View
              key={`${e.exerciseId}-${i}`}
              accessible
              accessibilityLabel={`${e.name}, ${e.scheme}${e.done ? ", logged" : ""}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                minHeight: 44,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              {e.done ? (
                <Symbol
                  name="checkmark"
                  size={14}
                  color={colors.primary}
                  weight="semibold"
                />
              ) : null}
              <Text tone={e.done ? "muted" : "default"} style={{ flex: 1 }}>
                {e.name}
              </Text>
              <Text size="sm" tone="muted">
                {e.scheme}
              </Text>
            </View>
          ))}
        </View>
      )}
      {children}
    </Surface>
  );
}

/** "Wednesday" within the week, else "Wednesday, November 4". */
export function missedDayLabel(missed: MissedDayInfo): string {
  return missed.daysAgo < 7
    ? weekdayLabel(missed.missedOn)
    : longDateLabel(missed.missedOn);
}

/** A failed resolution, worded for a write that may not have reached the server. */
export function resolveFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network") {
      return "Couldn't save — Overload needs a connection. Nothing was changed.";
    }
    if (error.temporary) {
      return "Couldn't save — Overload isn't responding. Try again.";
    }
    return error.message;
  }
  return "Couldn't save. Nothing was changed.";
}

type Choice = "late" | "shift" | "skip";

/**
 * The missed-day card (Checkpoint A, RD-23): the web's three choices with
 * the web's wording. Log it late starts the missed date's workout like
 * Start; Shift and Skip ask once, then go to the server's resolver. Only the
 * server's answer changes Today: the card stays until the refetch moves on.
 */
function MissedDayCard({
  missed,
  stale,
  starter,
  onResolved,
}: {
  missed: MissedDayInfo;
  stale: boolean;
  starter: Starter;
  onResolved: (note: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const resolve = useResolveMissedDay();
  const [failure, setFailure] = useState<string | null>(null);
  // A second tap before the re-render can't send twice.
  const busy = useRef(false);
  const day = missedDayLabel(missed);
  const working = resolve.isPending || starter.state.kind === "busy";
  const disabled = stale || working;

  async function send(outcome: "shifted" | "skipped") {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    try {
      await resolve.mutateAsync({
        mesocycleId: missed.mesocycleId,
        missedOn: missed.missedOn,
        outcome,
      });
      void haptic.success();
      onResolved(
        outcome === "skipped"
          ? `Skipped ${missed.sessionName}. Past weeks stay as planned.`
          : "This week shifted forward a day.",
      );
    } catch (error) {
      void haptic.warning();
      setFailure(resolveFailureMessage(error));
    } finally {
      busy.current = false;
    }
  }

  function confirmShift() {
    Alert.alert(
      "Shift the rest of this week?",
      "Remaining days this week each move forward one day. Next week is unchanged. A day pushed past the end of the week is dropped. You can't undo this.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Shift the week", onPress: () => void send("shifted") },
      ],
    );
  }

  function confirmSkip() {
    Alert.alert(
      `Skip ${missed.sessionName}?`,
      `${day}'s ${missed.sessionName} is marked skipped and won't come back. The rest of your plan stays as it is. You can't undo this.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip it",
          style: "destructive",
          onPress: () => void send("skipped"),
        },
      ],
    );
  }

  function choose(kind: Choice) {
    if (kind === "shift") return confirmShift();
    if (kind === "skip") return confirmSkip();
    setFailure(null);
    void starter.run({
      sessionId: missed.sessionId,
      scheduledFor: missed.missedOn,
      loggedSessionId: null,
    });
  }

  const choices: { kind: Choice; title: string; detail: string }[] = [
    {
      kind: "late",
      title: "Log it late",
      detail: `Record the sets you did on ${day}`,
    },
    {
      kind: "shift",
      title: "Shift the week",
      detail: "Move the rest of this week forward one day",
    },
    { kind: "skip", title: "Skip it", detail: "Mark it missed and move on" },
  ];

  return (
    <Surface tone="attention" style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Symbol
          name="calendar.badge.exclamationmark"
          size={24}
          color={colors.attention}
        />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text size="lg" weight="semibold" accessibilityRole="header">
            {`${missed.sessionName} was missed on ${day}`}
          </Text>
          <Text size="sm" tone="muted">
            {"Choose what happens to it. Today's workout opens after."}
          </Text>
        </View>
      </View>
      <View
        style={{
          backgroundColor: colors.secondary,
          borderRadius: radius.lg,
          overflow: "hidden",
        }}
      >
        {choices.map((c, i) => (
          <Fragment key={c.title}>
            {i > 0 ? (
              <View
                style={{
                  height: 1,
                  marginLeft: spacing.md,
                  backgroundColor: colors.border,
                }}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c.title}
              accessibilityHint={c.detail}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => choose(c.kind)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                minHeight: 60,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text weight="medium">{c.title}</Text>
                <Text size="sm" tone="muted">
                  {c.detail}
                </Text>
              </View>
              <Symbol
                name="chevron.right"
                size={14}
                color={colors.mutedForeground}
              />
            </Pressable>
          </Fragment>
        ))}
      </View>
      <StartNote state={starter.state} />
      {failure ? <Banner message={failure} /> : null}
      <Text size="xs" tone="muted">
        Shift and Skip ask once more before they change your week.
      </Text>
    </Surface>
  );
}

const openCardio = (entry: CardioOccurrenceDto) => {
  const target = cardioTarget(entry);
  if (target) router.push(cardioHref(target));
};

/**
 * One cardio line (Pitch 21f design T1): the plan with a Log action, or the
 * record (and the plan, when it differs) which opens for correction. Type and
 * minutes only: no tag, total, or timer.
 */
function CardioRow({
  entry,
  first,
  showLog,
}: {
  entry: CardioOccurrenceDto;
  first: boolean;
  /** False on a cardio-only day, where the primary button logs it. */
  showLog: boolean;
}) {
  const { colors, spacing } = useTheme();
  const shown = entry.log ?? entry.planned;
  const comparison = plannedComparison(entry);
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 60,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Symbol
        name={entry.log ? "checkmark" : "figure.run"}
        size={18}
        color={entry.log ? colors.progress : colors.mutedForeground}
      />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text>{cardioLabel(shown)}</Text>
        <Text size="sm" tone="muted">
          {entry.log ? (comparison ?? "Cardio · logged") : "Planned cardio"}
        </Text>
      </View>
      {entry.log ? (
        <Symbol name="chevron.right" size={13} color={colors.mutedForeground} />
      ) : showLog ? (
        <Button
          label="Log"
          variant="secondary"
          size="md"
          accessibilityLabel={`Log cardio: ${entry.planned.type}, ${entry.dateLabel}`}
          onPress={() => openCardio(entry)}
        />
      ) : null}
    </View>
  );
  if (!entry.log) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cardio logged: ${entry.log.type}, ${entry.log.durationMin} minutes, ${entry.dateLabel}`}
      accessibilityHint="Opens this cardio to correct it"
      onPress={() => openCardio(entry)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/** Cardio beside the day's lifting: lifting keeps the primary action. */
function CardioSection({ entries }: { entries: CardioOccurrenceDto[] }) {
  const { spacing } = useTheme();
  if (entries.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Also today" />
      <Surface padded={false}>
        {entries.map((c, i) => (
          <CardioRow
            key={`${c.mesocycleId}-${c.scheduledFor}`}
            entry={c}
            first={i === 0}
            showLog
          />
        ))}
      </Surface>
    </View>
  );
}

/** A cardio-only day: the cardio is the day, with the primary action. */
function CardioDay({
  entries,
  week,
}: {
  entries: CardioOccurrenceDto[];
  week: number;
}) {
  const { spacing } = useTheme();
  const pending = entries.filter((e) => !e.log);
  return (
    <View style={{ gap: spacing.lg }}>
      <Surface padded={false}>
        <View
          style={{
            gap: spacing.xxs,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.sm,
          }}
        >
          <Eyebrow>{`Week ${week}`}</Eyebrow>
          <Text size="lg" weight="semibold" accessibilityRole="header">
            {pending.length === 0 ? "Cardio complete" : "Cardio"}
          </Text>
          <Text size="sm" tone="muted">
            No lifting planned today.
          </Text>
        </View>
        {entries.map((c, i) => (
          <CardioRow
            key={`${c.mesocycleId}-${c.scheduledFor}`}
            entry={c}
            first={i === 0}
            showLog={false}
          />
        ))}
      </Surface>
      {pending.map((c) => (
        <Button
          key={`${c.mesocycleId}-${c.scheduledFor}`}
          label={pending.length > 1 ? `Log ${c.planned.type}` : "Log cardio"}
          accessibilityLabel={`Log cardio: ${c.planned.type}, ${c.dateLabel}`}
          onPress={() => openCardio(c)}
        />
      ))}
    </View>
  );
}
