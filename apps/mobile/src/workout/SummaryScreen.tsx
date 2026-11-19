import { ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import type { SessionGoalRowDto } from "@overload/shared/contracts/goals";
import {
  TRAINING_KEYS,
  useHistoryInsights,
  useInsightReadState,
  useLoggedWorkout,
} from "../api/training";
import {
  exerciseHeader,
  shortOfPlan,
  shortOfPlanText,
} from "../history/LoggedWorkoutScreen";
import { DeloadWeekBanner } from "../insights/DeloadWeekBanner";
import { ProNote } from "../insights/ProNote";
import { ProgressChip } from "../insights/ProgressChip";
import { longDateLabel } from "../today/date";
import { Button } from "../ui/Button";
import { SectionHeader } from "../ui/ScreenHeader";
import { Skeleton, SkeletonCard } from "../ui/Skeleton";
import { LoadErrorState } from "../ui/LoadErrorState";
import { Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { summaryCounts, summaryCountsLabel } from "./card-model";
import { SUMMARY_PRO_NOTE } from "./insight-model";
import { setValueLabel } from "./labels";
import { loggedWorkoutHref } from "./routes";
import {
  SUMMARY_CALLS_ERROR,
  SUMMARY_DELOAD_LINE,
  goalProgressLabel,
  setLine,
  summaryRows,
  type SummaryRow,
} from "./summary-model";

/**
 * S1 Summary (Pitch 21g design §6, §15; spec RD-10): what was saved, exactly
 * as History records it, and, for Pro, what each lift means for next time.
 *
 * Two reads (RD-2): the record (core fields) drives everything a lifter
 * entered and shows on its own; the gated summary and goals load separately,
 * so a slow or failed call never hides the saved sets. Opening this screen
 * only reads: it never finishes the workout again or writes anything.
 */
export function SummaryScreen({
  loggedSessionId,
}: {
  loggedSessionId: string;
}) {
  const { colors, spacing } = useTheme();
  const query = useLoggedWorkout(loggedSessionId);
  const insights = useHistoryInsights(loggedSessionId);
  const read = useInsightReadState(
    insights,
    TRAINING_KEYS.historyInsights(loggedSessionId),
  );
  const detail = query.data?.detail;
  const summary = insights.data?.summary ?? null;
  const goals = insights.data?.goals ?? [];
  // The same rule as the card (insightFor): a read waiting for the
  // connection or one that failed is never shown as current (RD-6); an
  // ordinary re-check keeps the answer shown until the new one lands (review
  // #2); a write that changed the evidence shows loading.
  const callsLoading =
    !read.isPaused && read.isFetching && (!read.hasData || read.isInvalidated);
  const callsFailed = read.isPaused || (!read.isFetching && read.isError);
  const callsReady = read.hasData && !callsLoading && !callsFailed;

  const done = () => {
    router.dismissAll();
    router.navigate("/today");
  };
  const viewInHistory = () => {
    router.dismissAll();
    router.push(loggedWorkoutHref(loggedSessionId));
  };

  return (
    <>
      <Stack.Screen options={{ title: "Workout complete" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <Symbol name="checkmark.circle" size={44} color={colors.primary} />
          {detail ? (
            <>
              <Text
                size="xl"
                weight="semibold"
                align="center"
                accessibilityRole="header"
              >
                {detail.sessionName} complete
              </Text>
              <Text size="sm" tone="muted" align="center">
                {[longDateLabel(detail.dateIso), detail.gymName]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text size="sm" align="center">
                {summaryCountsLabel(summaryCounts(detail))}
              </Text>
            </>
          ) : (
            <Text size="xl" weight="semibold" accessibilityRole="header">
              Workout complete
            </Text>
          )}
        </View>

        {detail ? (
          <>
            {callsReady && summary?.scheduledDeloadWeek ? (
              <DeloadWeekBanner message={SUMMARY_DELOAD_LINE} />
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <SectionHeader title="Exercises" />
              <Surface padded={false}>
                {summaryRows(detail, callsReady ? summary : null).map(
                  (row, i) => (
                    <ExerciseRow
                      key={row.exercise.loggedExerciseId}
                      row={row}
                      first={i === 0}
                      callsLoading={
                        callsLoading && row.exercise.sets.length > 0
                      }
                    />
                  ),
                )}
              </Surface>
              {callsFailed ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    columnGap: spacing.sm,
                  }}
                >
                  <Text size="sm" tone="muted">
                    {SUMMARY_CALLS_ERROR}
                  </Text>
                  <Button
                    label="Retry"
                    variant="text"
                    onPress={() => void insights.refetch()}
                  />
                </View>
              ) : null}
            </View>

            {callsReady && goals.length > 0 ? <GoalRows rows={goals} /> : null}

            {callsReady && summary?.locked ? (
              <ProNote surface="summary" message={SUMMARY_PRO_NOTE} />
            ) : null}
          </>
        ) : query.isError ? (
          <LoadErrorState
            error={query.error}
            subject="The details"
            request={`GET /history/${loggedSessionId}`}
            byId
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <SkeletonCard rows={4} />
        )}

        <Button label="Done" onPress={done} />
        <Button
          label="View in History"
          variant="text"
          onPress={viewInHistory}
        />
      </ScrollView>
    </>
  );
}

/** One exercise: its name line, saved sets, short-of-plan note, and call. */
function ExerciseRow({
  row,
  first,
  callsLoading,
}: {
  row: SummaryRow;
  first: boolean;
  callsLoading: boolean;
}) {
  const { colors, spacing } = useTheme();
  const e = row.exercise;
  const short = shortOfPlan(e);
  return (
    <View
      style={{
        padding: spacing.lg,
        gap: spacing.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text weight="semibold">{exerciseHeader(e)}</Text>
        {row.call ? <ProgressChip chip={row.call.chip} /> : null}
      </View>
      {e.sets.length === 0 ? (
        <Text size="sm" tone="muted">
          Not done
        </Text>
      ) : (
        <View style={{ gap: spacing.xxs }}>
          {e.sets.map((s) => (
            <Text key={s.loggedSetId} size="sm">
              {setLine(s, setValueLabel(s))}
            </Text>
          ))}
        </View>
      )}
      {short ? (
        <Text size="xs" tone="muted">
          {shortOfPlanText(short)}
        </Text>
      ) : null}
      {callsLoading ? (
        <View accessibilityLabel="Loading the call for this lift">
          <Skeleton width="60%" height={16} />
        </View>
      ) : row.call ? (
        <View
          accessible
          accessibilityLabel={`${row.call.spokenWord}: ${row.call.action}. ${row.call.evidence}`}
          style={{ gap: spacing.xxs }}
        >
          <Text
            size="sm"
            weight={row.call.strong ? "semibold" : "regular"}
            tone={row.call.strong ? "default" : "muted"}
          >
            {row.call.action}
          </Text>
          {row.call.evidence ? (
            <Text size="xs" tone="muted">
              {row.call.evidence}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The goals this workout moved (RD-10): a percentage view, no chart. */
function GoalRows({ rows }: { rows: SessionGoalRowDto[] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Goals" />
      <Surface style={{ gap: spacing.sm }}>
        {rows.map((r) => {
          const right = goalProgressLabel(r);
          return (
            <View
              key={r.goalId}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: spacing.sm,
              }}
            >
              <Text size="sm" style={{ flexShrink: 1 }}>
                {r.exerciseName}
                <Text size="sm" tone="muted">
                  {" "}
                  · {r.targetLabel}
                </Text>
              </Text>
              {right ? (
                <Text size="sm" weight="medium">
                  {right}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Surface>
    </View>
  );
}
