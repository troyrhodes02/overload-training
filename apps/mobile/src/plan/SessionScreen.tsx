import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { usePlanSession } from "../api/resources";
import { ApiError } from "../api/errors";
import { ExerciseImage } from "../ui/ExerciseImage";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip, Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  cardioLine,
  PLAN_FOOTNOTE,
  plannedRow,
  sessionContextLine,
  type PlannedRow,
} from "./session-model";

/**
 * P2 Session (Pitch 21h design §6, §15): one planned session as authored —
 * its exercises in plan order with the web's prescription text, and its
 * weekday's planned cardio. Read-only: opening it never starts a workout.
 * `exerciseHref` is where a row opens the exercise (null: rows are not
 * buttons).
 */
export function SessionScreen({
  mesocycleId,
  sessionId,
  exerciseHref,
}: {
  mesocycleId: string;
  sessionId: string;
  exerciseHref: ((exerciseId: string) => string) | null;
}) {
  const { colors, spacing } = useTheme();
  // A link without its block can't name a session: not found, no request
  // (review #8).
  const query = usePlanSession(mesocycleId, sessionId, {
    enabled: mesocycleId !== "" && sessionId !== "",
  });
  const s = query.data;
  const notFound =
    mesocycleId === "" ||
    sessionId === "" ||
    (query.error instanceof ApiError && query.error.code === "not_found");

  const body = (() => {
    if (!s) {
      if (notFound) {
        return (
          <StateView
            icon="list.bullet.rectangle"
            title="This session isn't in your plan anymore"
            message="It may have been changed on the web."
            action={{ label: "Back to Plan", onPress: () => router.back() }}
          />
        );
      }
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="This session"
          request="GET /mesocycles/{id}/sessions/{id}"
          byId
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={5} />
      );
    }
    const rows = s.exercises.map(plannedRow);
    const cardio = s.cardio ? cardioLine(s.cardio) : null;
    return (
      <View style={{ gap: spacing.lg }}>
        <Text size="sm" tone="muted">
          {sessionContextLine(s)}
        </Text>
        <Surface padded={false}>
          {rows.length === 0 ? (
            <View style={{ padding: spacing.lg }}>
              <Text tone="muted">No exercises yet. Add them on the web.</Text>
            </View>
          ) : (
            rows.map((row, i) => (
              <PlannedRowView
                key={row.id}
                row={row}
                first={i === 0}
                href={exerciseHref ? exerciseHref(row.exerciseId) : null}
              />
            ))
          )}
          {cardio ? (
            <View
              accessible
              accessibilityLabel={`${cardio.title}, ${cardio.note}`}
              style={{
                padding: spacing.md,
                gap: spacing.xxs,
                borderTopWidth: rows.length === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Text>{cardio.title}</Text>
              <Text size="sm" tone="muted">
                {cardio.note}
              </Text>
            </View>
          ) : null}
        </Surface>
        <Text size="sm" tone="muted" style={{ paddingHorizontal: spacing.xs }}>
          {PLAN_FOOTNOTE}
        </Text>
      </View>
    );
  })();

  return (
    <>
      <Stack.Screen options={{ title: s?.name ?? "Session" }} />
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

function PlannedRowView({
  row,
  first,
  href,
}: {
  row: PlannedRow;
  first: boolean;
  href: string | null;
}) {
  const { colors, spacing } = useTheme();
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Text size="sm" tone="muted" style={{ width: 18, textAlign: "center" }}>
        {String(row.number)}
      </Text>
      <ExerciseImage
        uri={row.imageUrl}
        name={row.name}
        archived={row.archived}
      />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            flexWrap: "wrap",
          }}
        >
          <Text
            weight="medium"
            tone={row.archived ? "muted" : "default"}
            numberOfLines={2}
            style={{ flexShrink: 1 }}
          >
            {row.name}
          </Text>
          {row.chip ? <Chip label={row.chip} /> : null}
        </View>
        <Text size="sm" tone={row.archived ? "muted" : "default"}>
          {row.prescription}
        </Text>
        <Text size="sm" tone="muted">
          {row.detail}
        </Text>
      </View>
      {href ? (
        <Symbol name="chevron.right" size={13} color={colors.mutedForeground} />
      ) : null}
    </View>
  );
  return href ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint="Opens this exercise"
      onPress={() => router.push(href)}
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
