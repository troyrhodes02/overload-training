import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import type {
  AddExerciseCandidateDto,
  AddExerciseContextDto,
} from "@overload/shared/contracts/logging";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type MuscleGroupValue,
} from "@overload/shared/exercises/taxonomy";
import {
  WING_IT_COPY,
  filterAddCandidates,
} from "@overload/shared/logging/wing-it";
import {
  useAddExerciseCandidates,
  useAddWingItExercise,
} from "../api/training";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { fontFamily, inputTextSize } from "../ui/theme";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "./messages";

/** The chips: every group first ("All"), then each group in library order. */
export const ADD_CHIPS: readonly (MuscleGroupValue | null)[] = [
  null,
  ...MUSCLE_GROUPS,
];

/**
 * Add an exercise to a Wing-It workout (Pitch 25 design §6.8, §15). Lists
 * every active exercise the account can see, all groups by default, with a
 * search; favorites first. Choosing one the workout already has opens its card
 * and adds nothing (the server's natural key, RD-22). The picker closes only
 * on the server's answer; Cancel sends nothing.
 */
export function AddExerciseScreen({
  loggedSessionId,
}: {
  loggedSessionId: string;
}) {
  const { colors, radius, spacing } = useTheme();
  /** null: every muscle group (the default). */
  const [muscle, setMuscle] = useState<MuscleGroupValue | null>(null);
  const [search, setSearch] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const query = useAddExerciseCandidates(loggedSessionId, muscle);
  const add = useAddWingItExercise();
  const choosing = useRef(false);
  const close = useModalClose();

  const context: AddExerciseContextDto | undefined = query.data;
  const shown = useMemo(
    () => filterAddCandidates(context?.candidates ?? [], search),
    [context, search],
  );

  async function choose(candidate: AddExerciseCandidateDto) {
    // A synchronous guard: a second tap before the re-render sends nothing.
    if (choosing.current) return;
    choosing.current = true;
    setFailure(null);
    try {
      await add.mutateAsync({ loggedSessionId, exerciseId: candidate.id });
      void haptic.light();
      close();
    } catch (error) {
      void haptic.warning();
      setFailure(changeFailureMessage(error, "add the exercise"));
    } finally {
      choosing.current = false;
    }
  }

  const header = (
    <Stack.Screen
      options={{
        title: WING_IT_COPY.pickerTitle,
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
              request={`GET /workouts/${loggedSessionId}/exercise-candidates`}
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

  const loadingGroup = query.isPlaceholderData;

  const intro = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="tablist"
        accessibilityLabel="Muscle group"
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {ADD_CHIPS.map((m) => {
          const on = m === muscle;
          const label = m ? MUSCLE_GROUP_LABELS[m] : "All";
          return (
            <Pressable
              key={m ?? "all"}
              accessibilityRole="tab"
              accessibilityLabel={m ? label : WING_IT_COPY.allMuscles}
              accessibilityState={{ selected: on }}
              disabled={add.isPending}
              onPress={() => {
                setFailure(null);
                setMuscle(m);
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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
          ...inputTextSize("base"),
        }}
      />
      {failure ? <Banner message={failure} /> : null}
    </View>
  );

  const empty =
    context.candidates.length === 0 ? (
      <StateView
        title={`No active exercises for ${context.selectedMuscleLabel}.`}
        message="Pick another muscle group."
      />
    ) : (
      <StateView
        title={WING_IT_COPY.noMatch}
        action={{ label: "Clear search", onPress: () => setSearch("") }}
      />
    );

  return (
    <>
      {header}
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={intro}
        ListEmptyComponent={empty}
        initialNumToRender={20}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${item.isFavorite ? ", favorite" : ""}${item.inWorkout ? `, ${WING_IT_COPY.inWorkout.toLowerCase()}` : ""}`}
            accessibilityHint={
              item.inWorkout
                ? "Opens it in this workout"
                : "Adds it to this workout"
            }
            disabled={add.isPending || loadingGroup}
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
            {item.inWorkout ? (
              <Text size="xs" tone="muted">
                {WING_IT_COPY.inWorkout}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </>
  );
}
