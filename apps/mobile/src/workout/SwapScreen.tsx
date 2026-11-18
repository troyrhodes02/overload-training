import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import type {
  SwapCandidate,
  SwapContextDto,
} from "@overload/shared/contracts/logging";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type MuscleGroupValue,
} from "@overload/shared/exercises/taxonomy";
import { useSwapCandidates, useSwapExercise } from "../api/training";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { fontFamily, textSize } from "../ui/theme";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "./messages";

/**
 * The muscle-group chips: the planned exercise's group first, so the list the
 * picker opens on is always the first chip, then every other group in the
 * library's order (any group can be chosen; Workout Logging Refinements).
 */
export function muscleChips(planned: MuscleGroupValue): MuscleGroupValue[] {
  return [planned, ...MUSCLE_GROUPS.filter((m) => m !== planned)];
}

/** Candidates whose name contains the search text (the web's filter). */
export function filterCandidates(
  candidates: readonly SwapCandidate[],
  search: string,
): SwapCandidate[] {
  const q = search.trim().toLowerCase();
  return q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q))
    : [...candidates];
}

/**
 * X1 Swap exercise (Pitch 21f design §6, §15; RD-6). Opens on the planned
 * exercise's muscle group and can list any group; the server lists what this
 * account can see. Choosing a row changes what is PERFORMED in this workout
 * only: the server never writes the planned exercise or the plan, and the
 * picker closes only on its answer. Cancel sends nothing.
 */
export function SwapScreen({
  loggedSessionId,
  loggedExerciseId,
}: {
  loggedSessionId: string;
  loggedExerciseId: string;
}) {
  const { colors, radius, spacing } = useTheme();
  /** null: the planned exercise's own group (the server's default). */
  const [muscle, setMuscle] = useState<MuscleGroupValue | null>(null);
  const [search, setSearch] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const query = useSwapCandidates(loggedExerciseId, muscle);
  const swap = useSwapExercise();
  const choosing = useRef(false);
  const close = useModalClose();

  const context: SwapContextDto | undefined = query.data;
  const shown = useMemo(
    () => filterCandidates(context?.candidates ?? [], search),
    [context, search],
  );

  async function choose(candidate: SwapCandidate) {
    // A synchronous guard: a second tap before the re-render sends nothing.
    if (choosing.current) return;
    choosing.current = true;
    setFailure(null);
    try {
      await swap.mutateAsync({
        loggedSessionId,
        loggedExerciseId,
        newExerciseId: candidate.id,
      });
      void haptic.light();
      close();
    } catch (error) {
      void haptic.warning();
      setFailure(changeFailureMessage(error, "swap the exercise"));
    } finally {
      choosing.current = false;
    }
  }

  const header = (
    <Stack.Screen
      options={{
        title: "Swap exercise",
        headerLeft: () => (
          <Button
            label="Cancel"
            variant="text"
            accessibilityHint="Closes without changing the workout"
            onPress={close}
          />
        ),
      }}
    />
  );

  if (!context) {
    return (
      <>
        {header}
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          {query.isError ? (
            <LoadErrorState
              error={query.error}
              subject="The exercise list"
              request={`GET /logged-exercises/${loggedExerciseId}/swap-candidates`}
              byId
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : (
            <SkeletonCard rows={6} />
          )}
        </View>
      </>
    );
  }

  const selected = muscle ?? context.selectedMuscle;
  const loadingGroup = query.isPlaceholderData;

  const intro = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={{ gap: spacing.xxs }}>
        <Text weight="medium">Instead of {context.plannedExerciseName}</Text>
        <Text size="sm" tone="muted">
          Planned: {context.primaryMuscleLabel} · today only, your plan stays
          the same
        </Text>
      </View>
      {context.swapLocked ? null : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="tablist"
            accessibilityLabel="Muscle group"
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {muscleChips(context.plannedMuscle).map((m) => {
              const on = m === selected;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="tab"
                  accessibilityLabel={MUSCLE_GROUP_LABELS[m]}
                  accessibilityState={{ selected: on }}
                  disabled={swap.isPending}
                  onPress={() => {
                    setFailure(null);
                    setMuscle(m === context.plannedMuscle ? null : m);
                  }}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primary : colors.card,
                  }}
                >
                  <Text weight="medium" tone={on ? "inverse" : "default"}>
                    {MUSCLE_GROUP_LABELS[m]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {context.candidates.length > 0 ? (
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search exercises"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Search exercises"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={{
                minHeight: 44,
                borderRadius: radius.lg,
                backgroundColor: colors.secondary,
                paddingHorizontal: spacing.md,
                color: colors.foreground,
                fontFamily: fontFamily.regular,
                ...textSize("base"),
              }}
            />
          ) : null}
          {failure ? <Banner message={failure} /> : null}
        </>
      )}
    </View>
  );

  const empty = context.swapLocked ? (
    <StateView
      icon="lock"
      title="Sets are logged — this exercise is locked."
      message="An exercise can be swapped only before its first set."
    />
  ) : context.candidates.length === 0 ? (
    <StateView
      title={`No active exercises for ${context.selectedMuscleLabel}.`}
      message="Pick another muscle group."
    />
  ) : (
    <StateView
      title={`No exercises match “${search.trim()}”.`}
      action={{ label: "Clear search", onPress: () => setSearch("") }}
    />
  );

  return (
    <>
      {header}
      <FlatList
        data={context.swapLocked ? [] : shown}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={intro}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${item.isFavorite ? ", favorite" : ""}`}
            accessibilityHint="Does this exercise instead, for this workout only"
            disabled={swap.isPending || loadingGroup}
            onPress={() => void choose(item)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              minHeight: 56,
              paddingHorizontal: spacing.lg,
              backgroundColor: pressed ? colors.muted : colors.card,
              borderColor: colors.border,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderTopWidth: 1,
              borderBottomWidth: index === shown.length - 1 ? 1 : 0,
              borderTopLeftRadius: index === 0 ? radius.xl : 0,
              borderTopRightRadius: index === 0 ? radius.xl : 0,
              borderBottomLeftRadius:
                index === shown.length - 1 ? radius.xl : 0,
              borderBottomRightRadius:
                index === shown.length - 1 ? radius.xl : 0,
              // The old group's list stays, dimmed, while the new one loads.
              opacity: loadingGroup ? 0.5 : 1,
            })}
          >
            <View style={{ width: 16 }}>
              {item.isFavorite ? (
                <Symbol
                  name="star.fill"
                  size={14}
                  color={colors.mutedForeground}
                />
              ) : null}
            </View>
            <Text style={{ flex: 1 }}>{item.name}</Text>
          </Pressable>
        )}
      />
    </>
  );
}
