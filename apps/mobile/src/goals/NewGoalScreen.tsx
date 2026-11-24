import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { parseGoalInput } from "@overload/shared/goals/validation";
import type { GoalFormContextDto } from "@overload/shared/contracts/goals";
import { ApiError } from "../api/errors";
import { useIntentKey } from "../api/idempotency";
import { useCreateGoal, useGoalForm } from "../api/goals";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { ChipGroup } from "../ui/ChipGroup";
import { ExerciseImage } from "../ui/ExerciseImage";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { setNotice } from "../ui/notice-store";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { TextField, type TextInputHandle } from "../ui/TextField";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";
import { goalHref } from "./GoalsScreen";

type Field = "exerciseId" | "gymId" | "targetWeightLbs" | "targetReps";
type Errors = Partial<Record<Field, string>>;

/** Where the form was opened: G4 in the Goals stack, or an exercise's history. */
export type NewGoalOrigin = "goals" | "history";

/** The words after a goal is set (design G5). */
export function createdNotice(outcome: "active" | "completed"): string {
  return outcome === "completed"
    ? "Already reached. Your history meets this target."
    : "Goal set.";
}

/**
 * G5 Set goal (Pitch 21i design §6, §15), a modal over everything: one
 * weight × reps target for one lift, the gym for a machine. The shared goal
 * parser checks the numbers before anything is sent; the server applies
 * every other rule and its words show under the field. One Save is one
 * intent: a resend after a failure carries the same key, so the server never
 * makes two goals. No date, no suggested weight.
 */
export function NewGoalScreen({
  exerciseId,
  gymId,
  from,
}: {
  exerciseId: string;
  gymId: string | null;
  from: NewGoalOrigin;
}) {
  const { colors, spacing } = useTheme();
  const close = useModalClose();
  const form = useGoalForm(exerciseId, gymId);
  const ctx = form.data;

  const body = (() => {
    if (!ctx) {
      return form.isError ? (
        <LoadErrorState
          error={form.error}
          subject="This exercise"
          request="GET /exercises/{id}/goal-form"
          byId
          onRetry={() => void form.refetch()}
          retrying={form.isFetching}
        />
      ) : (
        <SkeletonCard rows={3} />
      );
    }
    if (ctx.kind === "ok") {
      return <GoalForm ctx={ctx} from={from} close={close} />;
    }
    return <Unavailable ctx={ctx} close={close} />;
  })();

  return (
    <>
      <Stack.Screen
        options={{
          title: "New goal",
          headerLeft: () => (
            <Button
              label="Cancel"
              variant="text"
              accessibilityHint="Closes without setting a goal"
              onPress={close}
            />
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {body}
      </ScrollView>
    </>
  );
}

/** Why this lift can't take a goal now: the server's own reason (the web's words). */
function Unavailable({
  ctx,
  close,
}: {
  ctx: Exclude<GoalFormContextDto, { kind: "ok" }>;
  close: () => void;
}) {
  switch (ctx.kind) {
    case "duplicate":
      return (
        <StateView
          icon="target"
          title={`${ctx.exerciseName} already has an active goal.`}
          message={`${ctx.existing.targetLabel}${ctx.existing.percent !== null ? ` · ${ctx.existing.percent}%` : ""}. Archive it to set a different one.`}
          action={{
            label: "View goal",
            onPress: () => {
              close();
              router.push(goalHref(ctx.existing.goalId));
            },
          }}
        />
      );
    case "no_gyms":
      return (
        <StateView
          icon="building.2"
          title="Add a gym first."
          message={`${ctx.exerciseName} is a machine or cable lift, so its goal is measured at one gym.`}
          action={{
            label: "Gyms",
            onPress: () => {
              close();
              router.push("/more/gyms");
            },
          }}
        />
      );
    case "bodyweight_unsupported":
      return (
        <StateView
          icon="figure.strengthtraining.traditional"
          title={`${ctx.exerciseName} can't have a goal.`}
          message="Goals need an external weight. Bodyweight-only lifts can't have one."
        />
      );
    case "archived_exercise":
      return (
        <StateView
          icon="archivebox"
          title={`${ctx.exerciseName} is archived.`}
          message="Restore it to set a goal."
        />
      );
    default:
      return (
        <StateView
          icon="questionmark.circle"
          title="This exercise isn't available"
          action={{ label: "Close", onPress: close }}
        />
      );
  }
}

function GoalForm({
  ctx,
  from,
  close,
}: {
  ctx: Extract<GoalFormContextDto, { kind: "ok" }>;
  from: NewGoalOrigin;
  close: () => void;
}) {
  const { spacing } = useTheme();
  const create = useCreateGoal();
  // The lifter's choice; until they choose, the server's default (the gym
  // the history showed while active, else the only gym).
  const [chosenGym, setGym] = useState<string | null>(null);
  const gym = chosenGym ?? ctx.defaultGymId;
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const saving = useRef(false);
  const repsRef = useRef<TextInputHandle>(null);
  const raw = {
    exerciseId: ctx.exercise.id,
    gymId: ctx.gymVariable ? gym : null,
    targetWeightLbs: weight,
    targetReps: reps,
  };
  const key = useIntentKey(raw);

  async function save() {
    if (saving.current) return;
    const parsed = parseGoalInput(raw);
    const missingGym = ctx.gymVariable && !gym;
    if (!parsed.ok || missingGym) {
      setErrors({
        ...(parsed.ok ? {} : (parsed.details as Errors)),
        ...(missingGym
          ? { gymId: "Choose the gym this goal is measured at." }
          : {}),
      });
      void haptic.warning();
      return;
    }
    saving.current = true;
    setErrors({});
    setFailure(null);
    setDuplicateId(null);
    try {
      const created = await create.mutateAsync({
        key,
        body: {
          exerciseId: parsed.value.exerciseId,
          gymId: parsed.value.gymId,
          targetWeightLbs: parsed.value.targetWeightLbs,
          targetReps: parsed.value.targetReps,
        },
      });
      void haptic.success();
      const href = goalHref(created.id);
      if (from === "goals") {
        // Close the form and the picker under it, then open the new goal.
        router.dismissTo("/goals");
        router.push(href);
      } else {
        setNotice("exercise-history", {
          message: createdNotice(created.outcome),
          viewHref: href,
        });
        close();
      }
    } catch (error) {
      void haptic.warning();
      if (error instanceof ApiError && error.code === "conflict") {
        const existing = error.details.existingGoalId;
        setFailure(error.message);
        if (existing) {
          setErrors({});
          setDuplicateId(existing);
        }
        return;
      }
      const details = error instanceof ApiError ? error.details : {};
      const fieldErrors: Errors = {
        exerciseId: details.exerciseId,
        gymId: details.gymId,
        targetWeightLbs: details.targetWeightLbs,
        targetReps: details.targetReps,
      };
      if (Object.values(fieldErrors).some(Boolean)) setErrors(fieldErrors);
      else
        setFailure(
          changeFailureMessage(
            error,
            "set the goal",
            "Your numbers are still here.",
          ),
        );
    } finally {
      saving.current = false;
    }
  }
  return (
    <View style={{ gap: spacing.lg }}>
      {failure ? (
        <Banner
          message={failure}
          action={
            duplicateId
              ? {
                  label: "View goal",
                  onPress: () => {
                    close();
                    router.push(goalHref(duplicateId));
                  },
                }
              : undefined
          }
        />
      ) : null}
      <View
        accessible
        accessibilityLabel={`${ctx.exercise.name}, ${ctx.exercise.meta}`}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
      >
        <ExerciseImage
          uri={ctx.exercise.imageUrl}
          name={ctx.exercise.name}
          size={56}
        />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text size="lg" weight="semibold">
            {ctx.exercise.name}
          </Text>
          <Text size="sm" tone="muted">
            {ctx.exercise.meta}
          </Text>
        </View>
      </View>
      {errors.exerciseId ? (
        <Text size="sm" tone="destructive" accessibilityRole="alert">
          {errors.exerciseId}
        </Text>
      ) : null}
      {ctx.gymVariable ? (
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" weight="medium">
            Measured at
          </Text>
          <ChipGroup
            label="Measured at"
            options={ctx.gyms.map((g) => ({ value: g.id, label: g.name }))}
            selected={gym ? [gym] : []}
            disabled={create.isPending}
            onToggle={(id) => {
              void haptic.selection();
              setGym(id);
              setErrors((e) => ({ ...e, gymId: undefined }));
            }}
          />
          {errors.gymId ? (
            <Text size="sm" tone="destructive" accessibilityRole="alert">
              {errors.gymId}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Target weight (lb)"
            value={weight}
            keyboardType="decimal-pad"
            returnKeyType="next"
            editable={!create.isPending}
            error={errors.targetWeightLbs ?? null}
            onSubmitEditing={() => repsRef.current?.focus()}
            onChangeText={(t) => {
              setWeight(t);
              setErrors((e) => ({ ...e, targetWeightLbs: undefined }));
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            ref={repsRef}
            label="Target reps"
            value={reps}
            keyboardType="number-pad"
            returnKeyType="done"
            editable={!create.isPending}
            error={errors.targetReps ?? null}
            onSubmitEditing={() => void save()}
            onChangeText={(t) => {
              setReps(t);
              setErrors((e) => ({ ...e, targetReps: undefined }));
            }}
          />
        </View>
      </View>
      <Text size="sm" tone="muted">
        {"Progress is your best session's e1RM against this target's."}
      </Text>
      <Button
        label="Set goal"
        size="lg"
        loading={create.isPending}
        onPress={() => void save()}
      />
    </View>
  );
}
