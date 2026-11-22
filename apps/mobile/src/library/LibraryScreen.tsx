import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import type { ExerciseListItemDto } from "@overload/shared/contracts/exercises";
import {
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  type MuscleGroupValue,
} from "@overload/shared/exercises/taxonomy";
import {
  LIBRARY_PAGE_SIZE,
  useExercises,
  type LibraryFilters,
} from "../api/resources";
import { Button } from "../ui/Button";
import { ChipGroup } from "../ui/ChipGroup";
import { ExerciseImage } from "../ui/ExerciseImage";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip, Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { useTheme } from "../ui/ThemeProvider";
import {
  classificationLine,
  countLine,
  emptyStateFor,
  nextLimit,
} from "./library-model";

/** How long typing pauses before the search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

const MUSCLE_OPTIONS = [
  { value: "all" as const, label: "All muscles" },
  ...MUSCLE_GROUPS.map((m) => ({ value: m, label: MUSCLE_GROUP_LABELS[m] })),
];

/** `trailing` renders a row's trailing control (the favorite star, OVE-234). */
export type RowTrailing = (exercise: ExerciseListItemDto) => React.ReactNode;

/**
 * L1 Exercises (Pitch 21h design §6, §15): the shared library and the
 * account's own exercises, with the web's filters — every search word, All
 * or Favorites, one primary muscle — and its page size. Browsing never
 * touches a plan or a workout.
 */
export function LibraryScreen({
  detailHref,
  trailing,
  headerRight,
  notice,
  onAddOwn,
}: {
  detailHref: (exerciseId: string) => string;
  trailing?: RowTrailing;
  headerRight?: () => React.ReactNode;
  /** An inline banner at the top (the "Added X." notice, OVE-234). */
  notice?: React.ReactNode;
  /** Offered on an empty search (OVE-234); null hides it. */
  onAddOwn?: ((name: string | null) => void) | null;
}) {
  const { colors, spacing } = useTheme();
  const [text, setText] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>({
    view: "all",
    muscle: null,
    q: "",
    limit: LIBRARY_PAGE_SIZE,
  });
  // The search waits for a pause in typing; a new search starts on page one.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) =>
        f.q === text ? f : { ...f, q: text, limit: LIBRARY_PAGE_SIZE },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);
  const query = useExercises(filters);
  const list = query.data;
  const empty = list ? emptyStateFor(list, filters) : null;
  const more = list ? nextLimit(list, filters.limit) : null;
  const update = (patch: Partial<LibraryFilters>) =>
    setFilters((f) => ({ ...f, ...patch, limit: LIBRARY_PAGE_SIZE }));

  const results = (() => {
    if (!list) {
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="Exercises"
          request="GET /exercises"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={6} />
      );
    }
    if (empty) {
      return (
        <StateView
          icon="magnifyingglass"
          title={empty.title}
          action={
            empty.kind === "no_match" && onAddOwn
              ? {
                  label: "Add your own exercise",
                  onPress: () => onAddOwn(empty.addName),
                }
              : undefined
          }
        />
      );
    }
    return (
      <View style={{ gap: spacing.md }}>
        <Surface padded={false}>
          {list.items.map((e, i) => (
            <ExerciseRow
              key={e.id}
              exercise={e}
              first={i === 0}
              href={detailHref(e.id)}
              trailing={trailing}
            />
          ))}
        </Surface>
        {more !== null ? (
          <Button
            label="Show more"
            variant="secondary"
            loading={query.isFetching}
            onPress={() => setFilters((f) => ({ ...f, limit: more }))}
          />
        ) : null}
      </View>
    );
  })();

  return (
    <>
      <Stack.Screen options={{ title: "Exercises", headerRight }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isPlaceholderData}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {notice}
        <TextField
          label="Search"
          placeholder="Search exercises"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityHint="Every word must appear in the name"
        />
        <SegmentedControl
          label="Show"
          options={[
            { value: "all", label: "All" },
            { value: "favorites", label: "Favorites" },
          ]}
          value={filters.view}
          onChange={(view) => update({ view })}
        />
        <ChipGroup
          label="Primary muscle"
          layout="row"
          options={MUSCLE_OPTIONS}
          selected={[filters.muscle ?? "all"]}
          onToggle={(m) =>
            update({ muscle: m === "all" ? null : (m as MuscleGroupValue) })
          }
        />
        {list && list.total > 0 ? (
          <Text size="sm" tone="muted">
            {countLine(list)}
          </Text>
        ) : null}
        <View style={{ opacity: query.isPlaceholderData ? 0.5 : 1 }}>
          {results}
        </View>
      </ScrollView>
    </>
  );
}

function ExerciseRow({
  exercise: e,
  first,
  href,
  trailing,
}: {
  exercise: ExerciseListItemDto;
  first: boolean;
  href: string;
  trailing?: RowTrailing;
}) {
  const { colors, spacing } = useTheme();
  const line = classificationLine(e);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          e.name,
          e.isCustom ? "your exercise" : null,
          line,
          !trailing && e.isFavorite ? "favorite" : null,
        ]
          .filter(Boolean)
          .join(", ")}
        accessibilityHint="Opens this exercise"
        onPress={() => router.push(href)}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.sm + 2,
          paddingLeft: spacing.md,
          paddingRight: trailing ? 0 : spacing.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <ExerciseImage uri={e.imageUrl} name={e.name} size={44} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <Text weight="medium" numberOfLines={2} style={{ flexShrink: 1 }}>
              {e.name}
            </Text>
            {e.isCustom ? <Chip label="Custom" /> : null}
          </View>
          <Text size="sm" tone="muted">
            {line}
          </Text>
        </View>
        {!trailing && e.isFavorite ? (
          <Symbol name="star.fill" size={16} color={colors.primary} />
        ) : null}
      </Pressable>
      {trailing ? trailing(e) : null}
    </View>
  );
}
