import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type {
  DashboardDto,
  DashboardTodayDto,
} from "@overload/shared/contracts/logging";
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
import type { TodayDto } from "@overload/shared/contracts/views";
import { useToday } from "../api/training";
import { webOrigin } from "../config/env";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { loggedWorkoutHref } from "../workout/routes";
import { longDateLabel, weekdayLabel } from "./date";
import { useStartOrResume, type StartState } from "./useStartWorkout";

/**
 * T1 Today (Pitch 21e design §6, §15): the server's dashboard, rendered.
 * Every state comes from the dashboard's `kind`; nothing about the schedule
 * is derived here. No progression calls, goals, or Pro note (21g/21i).
 */
export function TodayView() {
  const { colors, spacing } = useTheme();
  const today = useToday();
  const starter = useStartOrResume();

  const body = (() => {
    if (today.data) {
      return (
        <TodayContent
          view={today.data}
          stale={today.isError}
          starter={starter}
        />
      );
    }
    if (today.isError) {
      return (
        <StateView
          icon="wifi.exclamationmark"
          title="Couldn't load today"
          message={today.error.message}
          action={{
            label: "Try again",
            onPress: () => void today.refetch(),
            loading: today.isFetching,
          }}
        />
      );
    }
    return <SkeletonCard />;
  })();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={today.isRefetching}
          onRefresh={() => void today.refetch()}
          tintColor={colors.mutedForeground}
        />
      }
    >
      {body}
    </ScrollView>
  );
}

function openWeb(path = "/") {
  const origin = webOrigin();
  if (origin) void Linking.openURL(`${origin}${path}`);
}

function TodayContent({
  view,
  stale,
  starter,
}: {
  view: TodayDto;
  stale: boolean;
  starter: ReturnType<typeof useStartOrResume>;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        <Text accessibilityRole="header">{view.greeting}</Text>
        <Text size="sm" tone="muted">
          {longDateLabel(view.today)}
        </Text>
      </View>
      {stale ? (
        <Banner
          tone="info"
          message="Can't reach Overload. Showing what was last loaded."
        />
      ) : null}
      <DashboardBlock
        dashboard={view.dashboard}
        stale={stale}
        starter={starter}
      />
    </View>
  );
}

function DashboardBlock({
  dashboard,
  stale,
  starter,
}: {
  dashboard: DashboardDto;
  stale: boolean;
  starter: ReturnType<typeof useStartOrResume>;
}) {
  const { spacing } = useTheme();
  switch (dashboard.kind) {
    case "no_plan":
      return (
        <StateView
          icon="list.bullet.rectangle"
          title="No active plan."
          message="Build and activate a plan on the web to start training."
          action={{
            label: "Open Overload on the web",
            onPress: () => openWeb("/plan"),
          }}
        />
      );
    case "rest":
      return (
        <View style={{ gap: spacing.lg }}>
          <StateView
            icon="moon.zzz"
            title="No lifting planned today."
            message="Rest up."
          />
          <CardioLines entries={dashboard.cardio} />
        </View>
      );
    case "missed_day":
      return (
        <View style={{ gap: spacing.lg }}>
          <StateView
            icon="calendar.badge.exclamationmark"
            title={`You missed ${dashboard.missed.sessionName} on ${weekdayLabel(dashboard.missed.missedOn)}.`}
            message="Choose log it late, shift, or skip on the web, then today's workout opens here."
            action={{
              label: "Open Overload on the web",
              onPress: () => openWeb("/"),
            }}
          />
          {dashboard.below ? (
            // Dimmed and inert until the missed day is resolved, as on the
            // web (RD-5).
            <View
              pointerEvents="none"
              style={{ opacity: 0.5 }}
              accessibilityState={{ disabled: true }}
            >
              <WorkoutCard day={dashboard.below} />
            </View>
          ) : (
            <CardioLines entries={dashboard.cardio} />
          )}
        </View>
      );
    default:
      return <DayBlock day={dashboard} stale={stale} starter={starter} />;
  }
}

function DayBlock({
  day,
  stale,
  starter,
}: {
  day: DashboardTodayDto;
  stale: boolean;
  starter: ReturnType<typeof useStartOrResume>;
}) {
  const { spacing } = useTheme();
  const done = day.kind === "complete";
  return (
    <View style={{ gap: spacing.md }}>
      <WorkoutCard day={day} />
      {done && day.loggedSessionId ? (
        <Button
          label="View workout"
          variant="secondary"
          size="md"
          onPress={() => router.push(loggedWorkoutHref(day.loggedSessionId!))}
        />
      ) : null}
      {!done ? (
        <>
          <StartNote state={starter.state} />
          <Button
            label={
              day.kind === "in_progress" ? "Resume workout" : "Start workout"
            }
            loading={starter.state.kind === "busy"}
            // A start needs the server; Resume only opens what it already has.
            disabled={stale && day.kind === "pending"}
            onPress={() => void starter.run(day)}
          />
        </>
      ) : null}
      <CardioLines entries={day.cardio} />
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

/** The day's workout: name, week, and the planned list (design §15 T1). */
export function WorkoutCard({ day }: { day: DashboardTodayDto }) {
  const { colors, radius, spacing } = useTheme();
  const doneCount = day.exercises.filter((e) => e.done).length;
  const total = day.exercises.length;
  const done = day.kind === "complete";
  const subtitle =
    day.kind === "pending"
      ? `Week ${day.week} · ${total} ${total === 1 ? "exercise" : "exercises"}`
      : `Week ${day.week} · ${doneCount} of ${total} exercises logged`;
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ gap: spacing.xxs }}>
        <Text size="lg" weight="semibold" accessibilityRole="header">
          {done ? `${day.sessionName} · Done` : day.sessionName}
        </Text>
        <Text size="sm" tone="muted">
          {day.kind === "in_progress" ? "In progress · " : ""}
          {subtitle}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        {day.exercises.map((e, i) => (
          <View
            key={`${e.exerciseId}-${i}`}
            accessible
            accessibilityLabel={`${e.name}, ${e.scheme}${e.done ? ", logged" : ""}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            {e.done ? (
              <Symbol name="checkmark" size={14} color={colors.primary} />
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
    </View>
  );
}

/** Planned cardio, read-only: logging it is 21f. */
function CardioLines({ entries }: { entries: CardioOccurrenceDto[] }) {
  const { colors, radius, spacing } = useTheme();
  if (entries.length === 0) return null;
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      {entries.map((c) => {
        const shown = c.log ?? c.planned;
        return (
          <View
            key={`${c.mesocycleId}-${c.scheduledFor}`}
            style={{ flexDirection: "row", gap: spacing.sm }}
          >
            <Symbol
              name="figure.run"
              size={16}
              color={colors.mutedForeground}
            />
            <Text style={{ flex: 1 }}>
              {shown.type} · {shown.durationMin} min
              {c.log ? " · logged" : ""}
            </Text>
          </View>
        );
      })}
      <Text size="xs" tone="muted">
        Cardio logging comes to the app in a later update.
      </Text>
    </View>
  );
}
