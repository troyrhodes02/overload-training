import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { parseIsoDate } from "@overload/shared/plan/calendar";
import { router } from "expo-router";
import type {
  HistoryWeekDto,
  LoggedHistoryDay,
} from "@overload/shared/contracts/history";
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
import type {
  WeekDayDto,
  WeekDayState,
} from "@overload/shared/contracts/logging";
import {
  TRAINING_KEYS,
  useHistoryWeek,
  useRefetchWhenFocused,
} from "../api/training";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { Chip, Surface, type ChipTone } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { SkeletonCard } from "../ui/Skeleton";
import { LoadErrorState } from "../ui/LoadErrorState";
import { StateView } from "../ui/StateView";
import { TabScreen } from "../ui/TabScreen";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { loggedWorkoutHref } from "../workout/routes";

/** The server's day states, worded as on the web's History page. */
export const STATE_LABEL: Record<WeekDayState, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  complete: "Done",
  skipped: "Skipped",
  shifted: "Shifted",
};

const CARDIO_LABEL: Record<CardioOccurrenceDto["state"], string> = {
  complete: "Done",
  pending: "Today",
  upcoming: "Upcoming",
  missed: "Missed",
};

/** One row of the week list: a workout or a read-only cardio line. */
export type HistoryRow =
  | {
      kind: "workout";
      key: string;
      dateIso: string;
      dateLabel: string;
      sessionName: string;
      state: WeekDayState;
      loggedSessionId: string | null;
    }
  | {
      kind: "cardio";
      key: string;
      dateIso: string;
      dateLabel: string;
      label: string;
      state: string | null;
    };

/**
 * The week's rows in date order, lifting before cardio on the same date (the
 * web's grouping). Only what the server sent: nothing is inferred here.
 */
export function historyRows(week: HistoryWeekDto): HistoryRow[] {
  const rows: (HistoryRow & { order: number })[] = [];
  if (week.view.kind === "active") {
    week.view.days.forEach((d: WeekDayDto, i) =>
      rows.push({
        kind: "workout",
        key: `w-${d.dateIso}-${i}`,
        dateIso: d.dateIso,
        order: 0,
        dateLabel: d.dayLabel,
        sessionName: d.sessionName,
        state: d.state,
        loggedSessionId: d.loggedSessionId,
      }),
    );
    week.view.cardio.forEach((c, i) => {
      const shown = c.log ?? c.planned;
      rows.push({
        kind: "cardio",
        key: `c-${c.dateIso}-${i}`,
        dateIso: c.dateIso,
        order: 1,
        dateLabel: c.dateLabel,
        label: `${shown.type} · ${shown.durationMin} min`,
        state: CARDIO_LABEL[c.state] ?? null,
      });
    });
  } else {
    week.view.days.forEach((d: LoggedHistoryDay) => {
      d.workouts.forEach((w, i) =>
        rows.push({
          kind: "workout",
          key: `w-${w.loggedSessionId}-${i}`,
          dateIso: d.dateIso,
          order: 0,
          dateLabel: d.dayLabel,
          sessionName: w.sessionName,
          state: w.state,
          loggedSessionId: w.loggedSessionId,
        }),
      );
      d.cardio.forEach((c, i) =>
        rows.push({
          kind: "cardio",
          key: `c-${c.cardioLogId}-${i}`,
          dateIso: d.dateIso,
          order: 1,
          dateLabel: d.dayLabel,
          label: `${c.type} · ${c.durationMin} min`,
          state: "Done",
        }),
      );
    });
  }
  return rows
    .sort((a, b) =>
      a.dateIso === b.dateIso
        ? a.order - b.order
        : a.dateIso < b.dateIso
          ? -1
          : 1,
    )
    .map(({ order: _o, ...row }) => row as HistoryRow);
}

/** The week header's second line. */
export function weekSubtitle(week: HistoryWeekDto): string {
  if (week.view.kind === "active") {
    return `${week.view.blockName} · Week ${week.view.weekNumber} of ${week.view.lengthWeeks}`;
  }
  return week.view.blocks.map((b) => b.name).join(" · ");
}

const openable = (row: HistoryRow) =>
  row.kind === "workout" &&
  row.loggedSessionId !== null &&
  (row.state === "complete" || row.state === "in_progress");

/**
 * H1 History (Pitch 21e design §6, §15; RD-15): all-time, one week per
 * request, from the server's week (the web's getHistoryWeek). ‹ and › stop
 * where the server says; Earlier blocks jumps to a past block's first week.
 */
export function HistoryScreen() {
  const { spacing } = useTheme();
  const [week, setWeek] = useState<string | null>(null);
  const query = useHistoryWeek(week);
  useRefetchWhenFocused(TRAINING_KEYS.historyWeek(week));
  const data = query.data;
  const failure = query.error;
  const retry = () => void query.refetch();

  const body = (() => {
    if (!data) {
      // A failed week never strands the lifter (review #3): retry it, or go
      // back to this week.
      return query.isError ? (
        <LoadErrorState
          error={failure}
          subject={week ? "That week" : "History"}
          request={week ? `GET /history?week=${week}` : "GET /history"}
          onRetry={retry}
          retrying={query.isFetching}
          secondaryAction={
            week
              ? { label: "Back to this week", onPress: () => setWeek(null) }
              : undefined
          }
        />
      ) : (
        <SkeletonCard rows={5} />
      );
    }
    if (!data.hasAnyHistory) {
      return (
        <StateView
          icon="clock.arrow.circlepath"
          title="No workouts yet."
          message="Finish your first workout and it shows up here, week by week, for as long as you train."
        />
      );
    }
    const rows = historyRows(data);
    // Moving to another week: the shown week stays, dimmed, until the new
    // one arrives (a failure falls through to the state above).
    const moving = query.isPlaceholderData && query.isFetching;
    return (
      <View style={{ gap: spacing.xl }}>
        <WeekHeader
          week={data}
          loading={moving}
          // This week is the plain read, so its cached answer is reused.
          onMove={(to) => setWeek(to === data.thisWeekStart ? null : to)}
        />
        {query.isError ? (
          <Banner message="Couldn't refresh this week. Pull to try again." />
        ) : null}
        <View style={{ opacity: moving ? 0.5 : 1 }}>
          {rows.length === 0 ? (
            <Surface>
              <Text tone="muted" align="center">
                Nothing logged this week.
              </Text>
            </Surface>
          ) : (
            <Surface padded={false}>
              {rows.map((row, i) => (
                <HistoryRowView
                  key={row.key}
                  row={row}
                  first={i === 0}
                  onPress={
                    openable(row) && row.kind === "workout"
                      ? () =>
                          router.push(
                            loggedWorkoutHref(row.loggedSessionId!) +
                              (row.state === "in_progress"
                                ? "?inProgress=1"
                                : ""),
                          )
                      : undefined
                  }
                />
              ))}
            </Surface>
          )}
        </View>
        {data.earlierBlocks.length > 0 ? (
          <GroupedList header="Earlier blocks">
            {data.earlierBlocks.map((b) => (
              <ListRow
                key={b.mesocycleId}
                title={b.name}
                subtitle={b.rangeLabel}
                accessory="chevron"
                accessibilityHint="Opens this block's first week"
                onPress={() => setWeek(b.weekStart)}
              />
            ))}
          </GroupedList>
        ) : null}
      </View>
    );
  })();

  return (
    <TabScreen
      eyebrow="Every workout you've logged"
      title="History"
      refreshing={query.isRefetching && !query.isPlaceholderData}
      onRefresh={() => void query.refetch()}
    >
      {body}
    </TabScreen>
  );
}

function WeekHeader({
  week,
  loading,
  onMove,
}: {
  week: HistoryWeekDto;
  loading: boolean;
  onMove: (weekStart: string) => void;
}) {
  const { colors, radius, spacing, controlHeight } = useTheme();
  const subtitle = weekSubtitle(week);
  const arrow = (direction: "prev" | "next", target: string | null) => {
    const disabled = target === null || loading;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          direction === "prev" ? "Previous week" : "Next week"
        }
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => target && onMove(target)}
        style={({ pressed }) => ({
          width: controlHeight.touchMin,
          height: controlHeight.touchMin,
          borderRadius: radius.lg,
          backgroundColor: colors.secondary,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Symbol
          name={direction === "prev" ? "chevron.left" : "chevron.right"}
          size={16}
          color={colors.foreground}
          weight="semibold"
        />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Surface
        padded={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          padding: spacing.xs + 2,
        }}
      >
        {arrow("prev", week.prevWeekStart)}
        <View style={{ flex: 1, alignItems: "center", gap: spacing.xxs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <Text weight="semibold" accessibilityRole="header">
              {week.rangeLabel}
            </Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : null}
          </View>
          {subtitle ? (
            <Text size="xs" tone="muted" align="center">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {arrow("next", week.nextWeekStart)}
      </Surface>
      {!week.isThisWeek ? (
        <View style={{ alignItems: "flex-end" }}>
          <Button
            label="This week"
            variant="text"
            onPress={() => onMove(week.thisWeekStart)}
          />
        </View>
      ) : null}
    </View>
  );
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});

/** A server date's column: "MON" over "9" (the server's date, UTC-formatted). */
export function dateColumn(iso: string): { weekday: string; day: string } {
  const date = parseIsoDate(iso);
  if (!date) return { weekday: "", day: iso };
  return {
    weekday: SHORT_WEEKDAY.format(date).toUpperCase(),
    day: String(date.getUTCDate()),
  };
}

const STATE_TONE: Record<WeekDayState, ChipTone> = {
  upcoming: "muted",
  in_progress: "primary",
  complete: "progress",
  skipped: "muted",
  shifted: "muted",
};

/** One row of the week: the date column, what it was, and its state as a word. */
function HistoryRowView({
  row,
  first,
  onPress,
}: {
  row: HistoryRow;
  first: boolean;
  onPress?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const col = dateColumn(row.dateIso);
  const title = row.kind === "workout" ? row.sessionName : row.label;
  const state =
    row.kind === "workout" ? STATE_LABEL[row.state] : (row.state ?? null);
  const tone: ChipTone =
    row.kind === "workout"
      ? STATE_TONE[row.state]
      : row.state === "Done"
        ? "progress"
        : "muted";
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 60,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ width: 40, alignItems: "center" }}>
        <Text
          size="xs"
          weight="medium"
          tone="muted"
          style={{ letterSpacing: 0.6 }}
        >
          {col.weekday}
        </Text>
        <Text size="lg" weight="semibold">
          {col.day}
        </Text>
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text weight="medium">{title}</Text>
        {row.kind === "cardio" ? (
          <Text size="sm" tone="muted">
            Cardio
          </Text>
        ) : null}
      </View>
      {state ? <Chip label={state} tone={tone} /> : null}
      {onPress ? (
        <Symbol name="chevron.right" size={13} color={colors.mutedForeground} />
      ) : null}
    </View>
  );
  const label = `${title}, ${row.dateLabel}${state ? `, ${state}` : ""}`;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this workout"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label}>
      {content}
    </View>
  );
}
