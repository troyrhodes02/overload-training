import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
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
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
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
      dateLabel: string;
      sessionName: string;
      state: WeekDayState;
      loggedSessionId: string | null;
    }
  | {
      kind: "cardio";
      key: string;
      dateLabel: string;
      label: string;
      state: string | null;
    };

/**
 * The week's rows in date order, lifting before cardio on the same date (the
 * web's grouping). Only what the server sent: nothing is inferred here.
 */
export function historyRows(week: HistoryWeekDto): HistoryRow[] {
  const rows: (HistoryRow & { dateIso: string; order: number })[] = [];
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
    .map(({ dateIso: _d, order: _o, ...row }) => row as HistoryRow);
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
  const { colors, spacing } = useTheme();
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
        <StateView
          icon="wifi.exclamationmark"
          title={week ? "Couldn't load that week." : "Couldn't load History"}
          message={failure?.message}
          action={{
            label: "Try again",
            onPress: retry,
            loading: query.isFetching,
          }}
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
          message="Your logged workouts appear here."
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
            <Text tone="muted" align="center">
              Nothing logged this week.
            </Text>
          ) : (
            <GroupedList>
              {rows.map((row) =>
                row.kind === "workout" ? (
                  <ListRow
                    key={row.key}
                    title={row.sessionName}
                    subtitle={row.dateLabel}
                    value={STATE_LABEL[row.state]}
                    accessory={openable(row) ? "chevron" : "none"}
                    onPress={
                      openable(row)
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
                ) : (
                  <ListRow
                    key={row.key}
                    title={row.label}
                    subtitle={row.dateLabel}
                    value={row.state ?? undefined}
                  />
                ),
              )}
            </GroupedList>
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isPlaceholderData}
          onRefresh={() => void query.refetch()}
          tintColor={colors.mutedForeground}
        />
      }
    >
      {body}
    </ScrollView>
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
  const arrow = (direction: "prev" | "next", target: string | null) => (
    <Button
      label={direction === "prev" ? "‹" : "›"}
      accessibilityLabel={direction === "prev" ? "Previous week" : "Next week"}
      variant="secondary"
      size="md"
      disabled={target === null || loading}
      onPress={() => target && onMove(target)}
      style={{
        width: controlHeight.touchMin,
        paddingHorizontal: 0,
        borderRadius: radius.lg,
      }}
    />
  );
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
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
            <Text size="sm" tone="muted" align="center">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {arrow("next", week.nextWeekStart)}
      </View>
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
