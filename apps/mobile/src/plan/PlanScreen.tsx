import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import type {
  PlanBlockDto,
  PlanOverviewDto,
} from "@overload/shared/contracts/plan";
import { RESOURCE_KEYS, usePlan } from "../api/resources";
import { useRefetchWhenFocused } from "../api/training";
import { webOrigin } from "../config/env";
import { dateColumn } from "../history/HistoryScreen";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SectionHeader } from "../ui/ScreenHeader";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip, Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { TabScreen } from "../ui/TabScreen";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  attentionLine,
  cadenceLine,
  dateRangeLine,
  dayRow,
  exerciseCountLabel,
  noPlanMessage,
  otherBlocksLine,
  positionLine,
  sessionHref,
  sessionRows,
  splitLine,
  stepper,
  type DayRow,
} from "./plan-model";

/**
 * P1 Plan (Pitch 21h design §6, §15): the active block, one dated week of the
 * effective schedule (the server's: account time zone, shifts applied), and
 * the block's sessions. Read-only: nothing here writes, starts, or skips.
 */
export function PlanScreen() {
  const { spacing } = useTheme();
  const [week, setWeek] = useState<number | null>(null);
  const query = usePlan(week);
  useRefetchWhenFocused(RESOURCE_KEYS.plan(week));
  const data = query.data;

  const body = (() => {
    if (!data) {
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject={week ? "That week" : "Your plan"}
          request={week ? `GET /plan?week=${week}` : "GET /plan"}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          secondaryAction={
            week
              ? { label: "Back to this week", onPress: () => setWeek(null) }
              : undefined
          }
        />
      ) : (
        <View style={{ gap: spacing.xl }}>
          <SkeletonCard rows={4} />
          <SkeletonCard rows={7} />
        </View>
      );
    }
    if (!data.block) return <NoPlan data={data} />;
    const moving = query.isPlaceholderData && query.isFetching;
    return (
      <ActivePlan
        data={data}
        block={data.block}
        moving={moving}
        refreshFailed={query.isError}
        onWeek={(to) => setWeek(to)}
      />
    );
  })();

  return (
    <TabScreen
      eyebrow="Your training block"
      title="Plan"
      refreshing={query.isRefetching && !query.isPlaceholderData}
      onRefresh={() => void query.refetch()}
    >
      {body}
    </TabScreen>
  );
}

function openWebPlan() {
  const origin = webOrigin();
  if (origin) void Linking.openURL(`${origin}/plan`);
}

function NoPlan({ data }: { data: PlanOverviewDto }) {
  return (
    <StateView
      icon="list.bullet.rectangle"
      title="No active plan"
      message={noPlanMessage(data.otherBlocks)}
      action={
        webOrigin()
          ? { label: "Open Plan on the web", onPress: openWebPlan }
          : undefined
      }
    />
  );
}

function ActivePlan({
  data,
  block,
  moving,
  refreshFailed,
  onWeek,
}: {
  data: PlanOverviewDto;
  block: PlanBlockDto;
  moving: boolean;
  refreshFailed: boolean;
  onWeek: (week: number) => void;
}) {
  const { spacing } = useTheme();
  const { summary } = block;
  const range = dateRangeLine(summary);
  const attention = attentionLine(summary);
  const sessions = sessionRows(block);
  const other = otherBlocksLine(data.otherBlocks);
  const open = (sessionId: string) =>
    router.push(sessionHref(summary.id, sessionId));

  return (
    <View style={{ gap: spacing.xl }}>
      <Surface
        accessible
        accessibilityLabel={[
          summary.name,
          "active",
          range,
          positionLine(block),
          cadenceLine(block),
          splitLine(summary),
          attention,
        ]
          .filter(Boolean)
          .join(", ")}
        style={{ gap: spacing.xs }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <Text size="lg" weight="semibold" style={{ flex: 1 }}>
            {summary.name}
          </Text>
          <Chip label="Active" tone="primary" />
        </View>
        {range ? (
          <Text size="sm" tone="muted">
            {range}
          </Text>
        ) : null}
        <Text weight="medium">{positionLine(block)}</Text>
        <Text size="sm" tone="muted">
          {cadenceLine(block)}
        </Text>
        <Text size="sm" tone="muted">
          {splitLine(summary)}
        </Text>
        {attention ? (
          <Text size="sm" tone="muted">
            {attention}
          </Text>
        ) : null}
      </Surface>

      <View style={{ gap: spacing.sm }}>
        <WeekHeader block={block} loading={moving} onWeek={onWeek} />
        {refreshFailed ? (
          <Banner message="Couldn't load that week. Pull to try again." />
        ) : null}
        <View style={{ opacity: moving ? 0.5 : 1 }}>
          <Surface padded={false}>
            {block.week.days.map((day, i) => (
              <DayRowView
                key={day.dateIso}
                row={dayRow(day)}
                first={i === 0}
                onOpen={open}
              />
            ))}
          </Surface>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        {sessions.scheduled.length > 0 ? (
          <GroupedList header="Sessions">
            {sessions.scheduled.map(({ day, session }) => (
              <ListRow
                key={session.id}
                title={`${day} · ${session.name}`}
                value={String(session.exerciseCount)}
                accessory="chevron"
                accessibilityHint={`Opens ${session.name}, ${exerciseCountLabel(session.exerciseCount)}`}
                onPress={() => open(session.id)}
              />
            ))}
          </GroupedList>
        ) : null}
        {sessions.unscheduled.length > 0 ? (
          <GroupedList header="Not on the schedule">
            {sessions.unscheduled.map((session) => (
              <ListRow
                key={session.id}
                title={session.name}
                value={String(session.exerciseCount)}
                accessory="chevron"
                onPress={() => open(session.id)}
              />
            ))}
          </GroupedList>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
        <Text size="sm" tone="muted">
          {other
            ? `Edit this plan on the web. ${other}`
            : "Edit this plan on the web."}
        </Text>
        {webOrigin() ? (
          <View style={{ alignItems: "flex-start" }}>
            <Button
              label="Open Plan on the web"
              variant="text"
              onPress={openWebPlan}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function WeekHeader({
  block,
  loading,
  onWeek,
}: {
  block: PlanBlockDto;
  loading: boolean;
  onWeek: (week: number) => void;
}) {
  const { colors, radius, spacing, controlHeight } = useTheme();
  const { prev, next } = stepper(block);
  const arrow = (direction: "prev" | "next", target: number | null) => {
    const disabled = target === null || loading;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          target === null
            ? direction === "prev"
              ? "Previous week"
              : "Next week"
            : `${direction === "prev" ? "Previous" : "Next"} week, week ${target}`
        }
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => target !== null && onWeek(target)}
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
  const w = block.week;
  return (
    <View style={{ gap: spacing.xs }}>
      <SectionHeader title={w.isCurrentWeek ? "This week" : "Week"} />
      <Surface
        padded={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          padding: spacing.xs + 2,
        }}
      >
        {arrow("prev", prev)}
        <View style={{ flex: 1, alignItems: "center", gap: spacing.xxs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <Text weight="semibold" accessibilityRole="header">
              {`Week ${w.weekNumber}`}
            </Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : null}
          </View>
          <Text size="xs" tone="muted" align="center">
            {w.scheduledDeloadWeek
              ? `${w.rangeLabel} · Deload week`
              : w.rangeLabel}
          </Text>
        </View>
        {arrow("next", next)}
      </Surface>
    </View>
  );
}

/** One calendar day: date column, its sessions and cardio, or Rest. */
function DayRowView({
  row,
  first,
  onOpen,
}: {
  row: DayRow;
  first: boolean;
  onOpen: (sessionId: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const col = dateColumn(row.dateIso);
  const target = row.lines.find((l) => l.sessionId !== null)?.sessionId ?? null;
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 56,
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
          tone={row.isToday ? "primary" : "muted"}
          style={{ letterSpacing: 0.6 }}
        >
          {col.weekday}
        </Text>
        <Text
          size="lg"
          weight="semibold"
          tone={row.isToday ? "primary" : "default"}
        >
          {col.day}
        </Text>
        {row.isToday ? (
          <Text size="xs" weight="medium" tone="primary">
            Today
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        {row.rest ? <Text tone="muted">Rest</Text> : null}
        {row.lines.map((line) => (
          <View
            key={line.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <Text
              weight={line.kind === "session" ? "medium" : "regular"}
              size={line.kind === "session" ? "base" : "sm"}
              tone={line.kind === "session" ? "default" : "muted"}
              style={{ flexShrink: 1 }}
            >
              {line.title}
            </Text>
            {line.chip ? (
              <Chip label={line.chip.label} tone={line.chip.tone} />
            ) : null}
          </View>
        ))}
      </View>
      {target ? (
        <Symbol name="chevron.right" size={13} color={colors.mutedForeground} />
      ) : null}
    </View>
  );
  return target ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint="Opens this session"
      onPress={() => onOpen(target)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={row.accessibilityLabel}>
      {content}
    </View>
  );
}
