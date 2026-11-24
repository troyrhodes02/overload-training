import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import type { GoalDetailDto } from "@overload/shared/contracts/goals";
import { GOAL_KEYS, useArchiveGoal, useGoal } from "../api/goals";
import { ApiError } from "../api/errors";
import { useRefetchWhenFocused } from "../api/training";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { setNotice } from "../ui/notice-store";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalReachedCard } from "./GoalReachedCard";
import {
  archiveGoalConfirmation,
  archivedNote,
  newGoalHref,
  newGoalTarget,
  outcomeLine,
  scopeFootnote,
} from "./goal-model";

/**
 * Where "Exercise history" leads from a goal (Pitch 21i RD-12): X2 in the
 * Goals stack, with the goal's gym for a machine.
 */
export function goalExerciseHistoryHref(g: {
  exerciseId: string;
  gymId: string | null;
}): string {
  const base = `/goals/exercise-history/${encodeURIComponent(g.exerciseId)}`;
  return g.gymId ? `${base}?scope=${encodeURIComponent(g.gymId)}` : base;
}

/**
 * G3 Goal (Pitch 21i design §6, §15): an active goal with the server's
 * percent, best session, and target e1RM, and Archive goal; or a reached or
 * archived one with its outcome, its one-time card, and Set a new goal when
 * the server allows one.
 */
export function GoalScreen({ goalId }: { goalId: string }) {
  const { colors, spacing } = useTheme();
  const query = useGoal(goalId);
  useRefetchWhenFocused(GOAL_KEYS.goal(goalId));
  const g = query.data;
  const notFound =
    query.error instanceof ApiError && query.error.code === "not_found";

  const body = (() => {
    if (!g) {
      if (notFound) {
        return (
          <StateView
            icon="questionmark.circle"
            title="This goal isn't available"
            action={{ label: "Go back", onPress: () => router.back() }}
          />
        );
      }
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="This goal"
          request="GET /goals/{id}"
          byId
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={4} />
      );
    }
    return (
      <View style={{ gap: spacing.lg }}>
        {query.isError ? (
          <Banner
            tone="info"
            message="Can't reach Overload. Showing what was last loaded."
          />
        ) : null}
        {g.kind === "archived" && g.unacknowledged ? (
          <GoalReachedCard goal={g} canSetNew={g.newGoalHref !== null} />
        ) : null}
        <Heading goal={g} />
        {g.kind === "active" ? (
          <ActiveBody goal={g} />
        ) : (
          <ArchivedBody goal={g} />
        )}
      </View>
    );
  })();

  return (
    <>
      <Stack.Screen options={{ title: "Goal" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {body}
      </ScrollView>
    </>
  );
}

function Heading({ goal: g }: { goal: GoalDetailDto }) {
  const { spacing } = useTheme();
  const sub =
    g.kind === "archived"
      ? [
          g.gymName
            ? `${g.gymName}${g.gymArchived ? " (archived)" : ""}`
            : null,
          outcomeLine(g),
        ]
          .filter(Boolean)
          .join(" · ")
      : g.gymName
        ? `${g.gymName} · set ${g.createdLabel}`
        : `Goal · set ${g.createdLabel}`;
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          flexWrap: "wrap",
        }}
      >
        <Text size="xl" weight="semibold" accessibilityRole="header">
          {g.exerciseName}
        </Text>
        {g.exerciseArchived ? (
          <Chip label="Exercise archived" tone="muted" />
        ) : null}
        {g.kind === "active" && g.gymArchived ? (
          <Chip label="Gym archived" tone="muted" />
        ) : null}
      </View>
      <Text size="sm" tone="muted">
        {sub}
      </Text>
    </View>
  );
}

function ActiveBody({
  goal: g,
}: {
  goal: Extract<GoalDetailDto, { kind: "active" }>;
}) {
  const { spacing } = useTheme();
  const archive = useArchiveGoal();
  const note = archivedNote(g);

  function confirmArchive() {
    const ask = archiveGoalConfirmation(g);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: () =>
          archive.mutate(
            { goalId: g.goalId },
            {
              onSuccess: () => {
                void haptic.success();
                setNotice("goals", { message: "Goal archived." });
                router.back();
              },
              onError: () => void haptic.warning(),
            },
          ),
      },
    ]);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.md }}>
        <View
          accessible
          accessibilityLabel={`Target ${g.targetLabel}${g.percent !== null ? `, ${g.percent} percent` : ""}`}
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <Text size="2xl" weight="semibold">
            {g.targetLabel}
          </Text>
          {g.percent !== null ? (
            <Text weight="semibold" style={{ fontSize: 36, lineHeight: 40 }}>
              {`${g.percent}%`}
            </Text>
          ) : null}
        </View>
        {g.percent !== null ? (
          <GoalProgressBar percent={g.percent} height={8} />
        ) : (
          <Text size="sm" tone="muted">
            {`No performance recorded yet${g.gymName ? ` at ${g.gymName}` : ""}.`}
          </Text>
        )}
      </View>
      <GroupedList>
        {g.best ? (
          <ListRow
            title="Best"
            value={`${g.best.e1rm} lb e1RM`}
            subtitle={`from ${g.best.weightLbs} × ${g.best.reps} · ${g.best.dateLabel}`}
          />
        ) : null}
        <ListRow title="Target" value={`${g.targetE1rm} lb e1RM`} />
      </GroupedList>
      <Text size="sm" tone="muted">
        {scopeFootnote(g)}
      </Text>
      {note ? <Banner tone="info" message={note} /> : null}
      <GroupedList>
        <ListRow
          title="Exercise history"
          accessory="chevron"
          onPress={() => router.push(goalExerciseHistoryHref(g))}
        />
      </GroupedList>
      {archive.isError ? (
        <Banner
          message={changeFailureMessage(
            archive.error,
            "archive the goal",
            "Nothing changed.",
          )}
        />
      ) : null}
      <View style={{ alignItems: "flex-start" }}>
        <Button
          label="Archive goal"
          variant="destructive-text"
          loading={archive.isPending}
          onPress={confirmArchive}
        />
      </View>
    </View>
  );
}

function ArchivedBody({
  goal: g,
}: {
  goal: Extract<GoalDetailDto, { kind: "archived" }>;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Symbol
            name={g.outcome === "completed" ? "checkmark.circle" : "archivebox"}
            size={16}
            color={colors.mutedForeground}
          />
          <Text size="sm" tone="muted">
            {outcomeLine(g)}
          </Text>
        </View>
        <Text size="2xl" weight="semibold">
          {g.targetLabel}
        </Text>
        <Text size="sm" tone="muted">
          {`Set ${g.createdLabel}`}
        </Text>
      </View>
      <GroupedList>
        <ListRow
          title="Exercise history"
          accessory="chevron"
          onPress={() => router.push(goalExerciseHistoryHref(g))}
        />
      </GroupedList>
      {g.newGoalHref && !g.unacknowledged ? (
        <Button
          label="Set a new goal"
          size="lg"
          onPress={() => router.push(newGoalHref(newGoalTarget(g)))}
        />
      ) : null}
    </View>
  );
}
