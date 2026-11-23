import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { useExercise } from "../api/resources";
import { ApiError } from "../api/errors";
import { webOrigin } from "../config/env";
import { ExerciseImage } from "../ui/ExerciseImage";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip } from "../ui/Surface";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { ExerciseDetailActions } from "./ExerciseDetailActions";
import { classificationLine } from "./library-model";

/**
 * Where the detail was opened: browsing (Plan or More) or over a workout.
 * From a workout it never offers Archive, and nothing on it touches the
 * workout (RD-13).
 */
export type ExerciseContext = "browse" | "workout";

/**
 * The standard inline header (design §15: "‹ Exercises  Exercise"). X1 is
 * pushed onto the Plan and More stacks, whose roots use the large title; a
 * pushed detail turns it off, as Diagnostics and Appearance do. Inheriting it
 * left an empty large-title band above the exercise name (OVE-237).
 */
export const EXERCISE_SCREEN_OPTIONS = {
  title: "Exercise",
  headerLargeTitle: false,
} as const;

/**
 * X1 Exercise (Pitch 21h design §6, §15): what the exercise is — image (when
 * the library has one), name, primary muscle and equipment, secondary muscles,
 * and whether it is the lifter's own. Archived exercises still resolve
 * (history and plans name them). History and records stay on the web (21i).
 */
export function ExerciseScreen({
  exerciseId,
  context,
}: {
  exerciseId: string;
  context: ExerciseContext;
}) {
  const { colors, radius, spacing } = useTheme();
  const query = useExercise(exerciseId);
  const e = query.data;
  const notFound =
    query.error instanceof ApiError && query.error.code === "not_found";

  const body = (() => {
    if (!e) {
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
          subject="This exercise"
          request="GET /exercises/{id}"
          byId
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={4} />
      );
    }
    const secondary =
      e.secondaryMuscleLabels.length > 0
        ? e.secondaryMuscleLabels.join(", ")
        : "None";
    const origin = webOrigin();
    return (
      <View style={{ gap: spacing.lg }}>
        {e.imageUrl ? (
          <View
            testID="exercise-hero"
            style={{
              height: 220,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            <ExerciseImage uri={e.imageUrl} name={e.name} size="fill" />
          </View>
        ) : null}
        <View style={{ gap: spacing.xs }}>
          <Text
            size="xl"
            weight="semibold"
            tone={e.isArchived ? "muted" : "default"}
            accessibilityRole="header"
          >
            {e.name}
          </Text>
          <Text tone="muted">{classificationLine(e)}</Text>
          {e.isCustom || e.isArchived ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {e.isCustom ? <Chip label="Custom" /> : null}
              {e.isArchived ? <Chip label="Archived" /> : null}
            </View>
          ) : null}
        </View>
        <GroupedList>
          <ListRow title="Primary muscle" value={e.primaryMuscleLabel} />
          <ListRow
            title="Secondary muscles"
            value={secondary}
            // A list of two or more wraps as a paragraph under its label
            // (OVE-237); "None" or one muscle reads like the other rows.
            valuePlacement={
              e.secondaryMuscleLabels.length > 1 ? "below" : "trailing"
            }
          />
          <ListRow title="Equipment" value={e.equipmentLabel} />
          <ListRow
            title="Type"
            value={e.isCustom ? "Your exercise" : "Library exercise"}
          />
        </GroupedList>
        <ExerciseDetailActions exercise={e} context={context} />
        {origin ? (
          <GroupedList>
            <ListRow
              title="History and records"
              value="On the web"
              accessory="external"
              accessibilityHint="Opens this exercise's history on the web"
              onPress={() =>
                void Linking.openURL(
                  `${origin}/exercises/${encodeURIComponent(e.id)}`,
                )
              }
            />
          </GroupedList>
        ) : null}
      </View>
    );
  })();

  return (
    <>
      <Stack.Screen options={EXERCISE_SCREEN_OPTIONS} />
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
