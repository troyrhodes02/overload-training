import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import type {
  ExerciseHistoryViewDto,
  ExerciseRecordsDto,
} from "@overload/shared/contracts/exercise-history";
import type { ExerciseGoalsDto } from "@overload/shared/contracts/goals";
import { formatLoad } from "@overload/shared/progression/history-format";
import { useExerciseHistory } from "../api/goals";
import { ApiError } from "../api/errors";
import { useExercise } from "../api/resources";
import { useRefetchWhenFocused } from "../api/training";
import { goalHref } from "../goals/GoalsScreen";
import { newGoalHref } from "../goals/goal-model";
import { InsightBlock } from "../insights/InsightBlock";
import { ProNote } from "../insights/ProNote";
import { ProgressChip } from "../insights/ProgressChip";
import { classificationLine } from "../library/library-model";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { ChipGroup } from "../ui/ChipGroup";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { clearNotice, useNotice } from "../ui/notice-store";
import { SectionHeader } from "../ui/ScreenHeader";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip, Surface } from "../ui/Surface";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { callView } from "../workout/insight-model";
import { TrendSection } from "./TrendSection";
import {
  exerciseDetailHrefIn,
  historySections,
  isNoGymScope,
  loggedWorkoutHrefIn,
  scopeName,
  scopeOptions,
  sessionCall,
  sessionLines,
  type HistoryStack,
} from "./history-model";

/** The Pro note's sentence (the web page's upgrade note, without a link). */
export const HISTORY_PRO_NOTE =
  "Strength insights are part of Pro: estimated strength trends, personal-record insights, and progression calls from your history.";

/**
 * X2 Exercise history (Pitch 21i design §6, §15): what this lift has done,
 * in the web page's order — Next time, the Pro note, Records, Trend,
 * Sessions, Goals. Everything is the server's gated answer; a Free account
 * gets the plain history and one quiet note. Read-only: nothing here starts,
 * changes, or reorders a workout. `stack` keeps every link in the stack the
 * lifter is in (RD-12); over a workout (`root`) session dates aren't links.
 */
export function ExerciseHistoryScreen({
  exerciseId,
  initialScope,
  stack,
}: {
  exerciseId: string;
  initialScope: string | null;
  stack: HistoryStack;
}) {
  const { colors, spacing } = useTheme();
  const [scope, setScope] = useState<string | null>(initialScope);
  const [all, setAll] = useState(false);
  const query = useExerciseHistory(exerciseId, { scope, all });
  const exercise = useExercise(exerciseId);
  useRefetchWhenFocused(["exercise-history", exerciseId]);
  const notice = useNotice("exercise-history");
  useFocusEffect(useCallback(() => () => clearNotice("exercise-history"), []));
  const data = query.data;
  const notFound =
    query.error instanceof ApiError && query.error.code === "not_found";

  const body = (() => {
    if (!data) {
      if (notFound) {
        return (
          <StateView
            icon="questionmark.circle"
            title="This exercise isn't available"
            action={{ label: "Go back", onPress: () => router.back() }}
          />
        );
      }
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="This exercise's history"
          request="GET /exercises/{id}/history"
          byId
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={5} />
      );
    }
    return (
      <HistoryBody
        view={data}
        stack={stack}
        stale={query.isError}
        changing={query.isPlaceholderData}
        onScope={(key) => {
          void haptic.selection();
          setScope(key);
        }}
        showAll={() => setAll(true)}
        showRecent={() => setAll(false)}
      />
    );
  })();

  const e = exercise.data;
  return (
    <>
      <Stack.Screen options={{ title: "History" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isPlaceholderData}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {notice ? (
          <Banner
            tone="info"
            message={notice.message}
            action={
              notice.viewHref
                ? {
                    label: "View",
                    onPress: () => {
                      const href = notice.viewHref!;
                      clearNotice("exercise-history");
                      router.push(href);
                    },
                  }
                : undefined
            }
          />
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text
              size="xl"
              weight="semibold"
              tone={e?.isArchived ? "muted" : "default"}
              accessibilityRole="header"
            >
              {e?.name ?? " "}
            </Text>
            {e ? <Text tone="muted">{classificationLine(e)}</Text> : null}
            {e && (e.isCustom || e.isArchived) ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {e.isCustom ? <Chip label="Custom" /> : null}
                {e.isArchived ? <Chip label="Archived" /> : null}
              </View>
            ) : null}
          </View>
          <GroupedList>
            <ListRow
              title="About this exercise"
              accessory="chevron"
              onPress={() =>
                router.push(exerciseDetailHrefIn(stack, exerciseId))
              }
            />
          </GroupedList>
        </View>
        {body}
      </ScrollView>
    </>
  );
}

function HistoryBody({
  view,
  stack,
  stale,
  changing,
  onScope,
  showAll,
  showRecent,
}: {
  view: ExerciseHistoryViewDto;
  stack: HistoryStack;
  stale: boolean;
  changing: boolean;
  onScope: (key: string) => void;
  showAll: () => void;
  showRecent: () => void;
}) {
  const { spacing } = useTheme();
  const h = view.history;
  const s = historySections(view);
  const gymName = scopeName(h);
  const noGym = isNoGymScope(h);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <View style={{ gap: spacing.xl, opacity: changing ? 0.5 : 1 }}>
      {stale ? (
        <Banner
          tone="info"
          message="Can't reach Overload. Showing what was last loaded."
        />
      ) : null}
      {h.gymVariable && h.selectedScope ? (
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" tone="muted">
            History at
          </Text>
          {h.scopes.length > 1 ? (
            <ChipGroup
              label="History at"
              layout="row"
              options={scopeOptions(h)}
              selected={[h.selectedScope.key]}
              onToggle={onScope}
            />
          ) : (
            <Text weight="medium">{h.selectedScope.label}</Text>
          )}
          <Text size="sm" tone="muted">
            Machines differ between gyms, so each gym keeps its own records.
          </Text>
        </View>
      ) : null}

      {s.empty ? (
        <StateView
          icon="clock"
          title="No sets logged yet."
          message="Log it in a workout and its sessions, records, and trend show up here."
        />
      ) : s.next.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Next time" />
          {s.next.map((line, i) => (
            <View key={i} style={{ gap: spacing.xs }}>
              {line.label ? (
                <Text size="sm" weight="medium">
                  {line.label}
                </Text>
              ) : null}
              {line.kind === "no_gym" ? (
                <Text size="sm" tone="muted">
                  Calls for machines are made per gym.
                </Text>
              ) : line.next.recommendation ? (
                <InsightBlock
                  view={{
                    kind: "call",
                    ...callView(line.next.recommendation, line.next.tag),
                  }}
                  expanded={expanded === i}
                  onToggle={() => setExpanded((x) => (x === i ? null : i))}
                  onRetry={() => {}}
                />
              ) : line.next.insufficientNote ? (
                <Text size="sm" tone="muted">
                  {line.next.insufficientNote}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {s.locked ? (
        <ProNote surface="exercise-history" message={HISTORY_PRO_NOTE} />
      ) : null}

      {s.records ? <Records records={s.records} scopeName={gymName} /> : null}

      {!s.empty ? (
        <TrendSection view={s.trend} scopeName={gymName} noGymScope={noGym} />
      ) : null}

      {!s.empty ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            title={gymName ? `Sessions · ${gymName}` : "Sessions"}
          />
          <Text size="sm" tone="muted">
            {noGym
              ? "Machine calls are made per gym, so these sessions have none."
              : "The call each session led to, from your sets as they are now."}
          </Text>
          <Surface padded={false}>
            {s.sessions.rows.map((row, i) => (
              <SessionRow
                key={row.loggedExerciseId}
                row={row}
                first={i === 0}
                externalLoad={h.externalLoad}
                href={loggedWorkoutHrefIn(stack, row.loggedSessionId)}
              />
            ))}
          </Surface>
          {s.sessions.total > s.sessions.rows.length ? (
            <Button
              label={`View all ${s.sessions.total} sessions`}
              variant="text"
              onPress={showAll}
            />
          ) : s.sessions.showingAll && s.sessions.total > 10 ? (
            <Button
              label="Show recent only"
              variant="text"
              onPress={showRecent}
            />
          ) : null}
        </View>
      ) : null}

      <Goals
        goals={s.goals}
        exerciseId={h.exerciseId}
        gym={
          h.gymVariable && h.selectedScope && h.selectedScope.key !== "none"
            ? { id: h.selectedScope.key, archived: h.selectedScope.archived }
            : null
        }
      />
    </View>
  );
}

function SessionRow({
  row,
  first,
  externalLoad,
  href,
}: {
  row: ExerciseHistoryViewDto["history"]["sessions"]["rows"][number];
  first: boolean;
  externalLoad: boolean;
  href: string | null;
}) {
  const { colors, spacing } = useTheme();
  const lines = sessionLines(row, externalLoad);
  const call = sessionCall(row.call);
  const content = (
    <View style={{ gap: spacing.xxs }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <Text
          size="sm"
          tone={href ? "primary" : "default"}
          style={{ flexShrink: 1 }}
        >
          {lines.head}
        </Text>
        {call?.kind === "chip" ? (
          <ProgressChip chip={call.chip} />
        ) : call?.kind === "word" ? (
          <Text size="xs" tone="muted">
            {call.word}
          </Text>
        ) : null}
      </View>
      <Text>{lines.sets}</Text>
      {lines.rir ? (
        <Text size="sm" tone="muted">
          {lines.rir}
        </Text>
      ) : null}
      {lines.notCounted ? (
        <Text size="sm" tone="muted">
          {lines.notCounted}
        </Text>
      ) : null}
      {lines.swap ? (
        <Text size="sm" tone="muted">
          {lines.swap}
        </Text>
      ) : null}
    </View>
  );
  const frame = {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: colors.border,
  };
  if (!href) {
    return (
      <View accessible accessibilityLabel={lines.label} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lines.label}
      accessibilityHint="Opens this workout"
      onPress={() => router.push(href)}
      style={({ pressed }) => [frame, { opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

function Records({
  records,
  scopeName: gym,
}: {
  records: ExerciseRecordsDto;
  scopeName: string | null;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={gym ? `Records · ${gym}` : "Records"} />
      {records.kind === "bodyweight" ? (
        <GroupedList>
          <ListRow
            title="Most reps in a set"
            value={`${records.mostReps.reps} reps`}
            subtitle={records.mostReps.dateLabel}
          />
        </GroupedList>
      ) : (
        <GroupedList>
          <ListRow
            title="Best set"
            value={`${formatLoad(records.bestSet.weightLbs)} × ${records.bestSet.reps} lb`}
            subtitle={records.bestSet.dateLabel}
          />
          <ListRow
            title="Best e1RM · estimate"
            value={
              records.bestE1rm === null
                ? "— Part of Pro"
                : `${records.bestE1rm} lb`
            }
            subtitle={
              records.bestE1rm === null
                ? undefined
                : `from ${formatLoad(records.bestSet.weightLbs)} × ${records.bestSet.reps}`
            }
          />
          <ListRow
            title="Heaviest weight"
            value={`${formatLoad(records.heaviest.weightLbs)} × ${records.heaviest.reps}`}
            subtitle={records.heaviest.dateLabel}
          />
          {records.repRecords !== null && records.repRecords.length > 0 ? (
            <ListRow
              title="Rep records"
              subtitle="Most reps at this weight or heavier"
              value={records.repRecords
                .map((r) => `${formatLoad(r.weightLbs)} lb × ${r.reps}`)
                .join("\n")}
              valuePlacement="below"
            />
          ) : null}
        </GroupedList>
      )}
      <Text size="sm" tone="muted">
        {"Working sets of finished workouts. Deload weeks don't count."}
      </Text>
    </View>
  );
}

function Goals({
  goals,
  exerciseId,
  gym,
}: {
  goals: ExerciseGoalsDto;
  exerciseId: string;
  gym: { id: string; archived: boolean } | null;
}) {
  const { spacing } = useTheme();
  if (goals.bodyweight && !goals.active && goals.past.length === 0) {
    return (
      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Goals" />
        <Text size="sm" tone="muted">
          {"Bodyweight lifts don't take weight × reps goals."}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Goals" />
      <GroupedList>
        {goals.active ? (
          <ListRow
            title={goals.active.targetLabel}
            subtitle={goals.active.gymName ?? undefined}
            value={
              goals.active.percent === null
                ? "No performance yet"
                : `${goals.active.percent}%`
            }
            accessory="chevron"
            onPress={() => router.push(goalHref(goals.active!.goalId))}
          />
        ) : null}
        {goals.newGoalEligible ? (
          <ListRow
            title="Set a goal"
            accessory="chevron"
            onPress={() =>
              router.push(
                newGoalHref(
                  {
                    kind: "exercise",
                    exerciseId,
                    gymId: gym && !gym.archived ? gym.id : null,
                  },
                  "history",
                ),
              )
            }
          />
        ) : null}
        {goals.past.map((g) => (
          <ListRow
            key={g.goalId}
            title={g.targetLabel}
            subtitle={`${g.outcome === "completed" ? "Reached" : "Archived"} ${g.archivedLabel}`}
            accessory="chevron"
            onPress={() => router.push(goalHref(g.goalId))}
          />
        ))}
        {!goals.active && !goals.newGoalEligible && goals.past.length === 0 ? (
          <ListRow title="No goals on this lift." />
        ) : null}
      </GroupedList>
    </View>
  );
}
