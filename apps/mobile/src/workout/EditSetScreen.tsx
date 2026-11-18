import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { checkLoggedReps } from "@overload/shared/logging/reps";
import { formatWeight } from "@overload/shared/logging/set-entry";
import { checkWeightLbs } from "@overload/shared/logging/weight";
import { ApiError } from "../api/errors";
import { useEditSet, useLoggedWorkout, useWorkout } from "../api/training";
import { longDateLabel } from "../today/date";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { TextField, type TextInputHandle } from "../ui/TextField";
import { fontFamily, textSize } from "../ui/theme";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import { parseRepsText, parseWeightText } from "./card-model";
import {
  editSetBody,
  editSetChanged,
  findEditableSet,
  type EditableSet,
} from "./edit-set-model";
import { changeFailureMessage } from "./messages";
import { RirPicker } from "./RirPicker";

/**
 * E1 Edit set (Pitch 21f design §6, §15; RD-9, RD-10, RD-13): correct one
 * saved set's weight, reps, and RIR. It opens on the server's stored values
 * and becomes real only on the server's answer. The set's exercise, gym,
 * number, and date can't be changed here, and no set is created or removed.
 *
 * Cancel and Save are in the header, so the keyboard can never cover them.
 */
export function EditSetScreen({
  loggedSessionId,
  loggedSetId,
  from,
}: {
  loggedSessionId: string;
  loggedSetId: string;
  /** Which read holds the stored values: the workout, or its History record. */
  from: "workout" | "history";
}) {
  const { spacing } = useTheme();
  // The opening screen already holds the stored values: read its cache, and
  // fetch only when there is nothing cached (a cold deep link).
  const workout = useWorkout(loggedSessionId, {
    enabled: from === "workout",
    refetchOnMount: false,
  });
  const record = useLoggedWorkout(loggedSessionId, {
    enabled: from === "history",
    refetchOnMount: false,
  });
  const close = useModalClose();
  const query = from === "workout" ? workout : record;
  const source =
    from === "workout" ? workout.data?.workout : record.data?.detail;
  // The stored values the sheet opened on: taken from the first answer that
  // holds the set (state adjusted during render), so a refetch behind the
  // sheet never rewrites what the lifter is typing over.
  const [original, setOriginal] = useState<EditableSet | null>(null);
  if (original === null && source) {
    const found = findEditableSet(source, loggedSetId);
    if (found) setOriginal(found);
  }

  const cancel = (
    <Button
      label="Cancel"
      variant="text"
      accessibilityHint="Closes without changing the set"
      onPress={close}
    />
  );

  if (!original) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Edit set", headerLeft: () => cancel }}
        />
        <View style={{ padding: spacing.lg }}>
          {!source ? (
            query.isError ? (
              <LoadErrorState
                error={query.error}
                subject="This set"
                request={
                  from === "workout"
                    ? `GET /workouts/${loggedSessionId}`
                    : `GET /history/${loggedSessionId}`
                }
                byId
                onRetry={() => void query.refetch()}
                retrying={query.isFetching}
              />
            ) : (
              <SkeletonCard rows={3} />
            )
          ) : (
            <StateView
              title="This set isn't available."
              message="It may have changed on another device. Go back and open it again."
              action={{ label: "Close", onPress: close }}
            />
          )}
        </View>
      </>
    );
  }
  return (
    <EditSetForm
      loggedSessionId={loggedSessionId}
      original={original}
      cancel={cancel}
      close={close}
    />
  );
}

type Field = "weight" | "reps";

function EditSetForm({
  loggedSessionId,
  original,
  cancel,
  close,
}: {
  loggedSessionId: string;
  original: EditableSet;
  cancel: React.ReactNode;
  /** Goes back once, and only while this modal is still open. */
  close: () => void;
}) {
  const { colors, spacing } = useTheme();
  const editSet = useEditSet();
  const needsWeight = original.requiresExternalWeight;
  const [weight, setWeight] = useState(
    original.weightLbs === null ? "" : formatWeight(original.weightLbs),
  );
  const [reps, setReps] = useState(String(original.reps));
  const [rir, setRir] = useState<number | null>(original.rir);
  const [fieldError, setFieldError] = useState<{
    field: Field;
    message: string;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const weightRef = useRef<TextInputHandle>(null);
  const repsRef = useRef<TextInputHandle>(null);
  const saving = useRef(false);

  const changed = editSetChanged(original, {
    weightLbs: parseWeightText(weight),
    reps: parseRepsText(reps),
    rir,
  });

  function fail(field: Field, message: string) {
    setFieldError({ field, message });
    void haptic.warning();
    (field === "weight" ? weightRef : repsRef).current?.focus();
  }

  async function save() {
    // A synchronous guard: a second tap before the re-render sends nothing.
    if (saving.current) return;
    let weightLbs: number | null = null;
    if (needsWeight) {
      // The server's own rules, run first so nothing invalid is sent.
      const checked = checkWeightLbs(parseWeightText(weight));
      if (!checked.ok) return fail("weight", checked.message);
      weightLbs = checked.value;
    }
    const checkedReps = checkLoggedReps(parseRepsText(reps));
    if (!checkedReps.ok) return fail("reps", checkedReps.message);
    saving.current = true;
    setFieldError(null);
    setFailure(null);
    try {
      await editSet.mutateAsync({
        loggedSessionId,
        loggedSetId: original.loggedSetId,
        body: editSetBody(original, {
          weightLbs,
          reps: checkedReps.value,
          rir,
        }),
      });
      void haptic.light();
      close();
    } catch (error) {
      void haptic.warning();
      const details = error instanceof ApiError ? error.details : {};
      if (details.weightLbs) fail("weight", details.weightLbs);
      else if (details.reps) fail("reps", details.reps);
      else {
        setFailure(
          details.rir ??
            changeFailureMessage(
              error,
              "save",
              "Your correction is still here.",
            ),
        );
      }
    } finally {
      saving.current = false;
    }
  }

  const number = {
    ...textSize("xl"),
    fontFamily: fontFamily.semibold,
    fontVariant: ["tabular-nums" as const],
    minHeight: 52,
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: `Edit set ${original.setNumber}`,
          headerLeft: () => cancel,
          headerRight: () => (
            <Button
              label="Save"
              variant="text"
              loading={editSet.isPending}
              disabled={!changed}
              accessibilityHint="Saves this correction"
              onPress={() => void save()}
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
        <View style={{ gap: spacing.xxs }}>
          <Text weight="medium" accessibilityRole="header">
            {original.exerciseName}
          </Text>
          {original.dateIso ? (
            <Text size="sm" tone="muted">
              {longDateLabel(original.dateIso)}
            </Text>
          ) : null}
        </View>

        {failure ? <Banner message={failure} /> : null}

        {needsWeight ? (
          <TextField
            ref={weightRef}
            label="Weight (lbs)"
            value={weight}
            keyboardType="decimal-pad"
            selectTextOnFocus
            editable={!editSet.isPending}
            error={fieldError?.field === "weight" ? fieldError.message : null}
            onChangeText={(t) => {
              setWeight(t);
              if (fieldError?.field === "weight") setFieldError(null);
            }}
            style={number}
          />
        ) : (
          <Text size="sm" tone="muted">
            Bodyweight — reps only.
          </Text>
        )}

        <TextField
          ref={repsRef}
          label="Reps"
          value={reps}
          keyboardType="number-pad"
          selectTextOnFocus
          editable={!editSet.isPending}
          error={fieldError?.field === "reps" ? fieldError.message : null}
          onChangeText={(t) => {
            setReps(t);
            if (fieldError?.field === "reps") setFieldError(null);
          }}
          style={number}
        />

        <View style={{ gap: spacing.sm }}>
          <Text size="sm" weight="medium">
            RIR (optional)
          </Text>
          <RirPicker
            setNumber={original.setNumber}
            value={rir}
            showLabel={false}
            disabled={editSet.isPending}
            onChange={setRir}
          />
          <Text size="xs" tone="muted">
            {rir === null
              ? "Not recorded."
              : "Tap the selected value to clear."}
          </Text>
        </View>

        <Text size="xs" tone="muted">
          This corrects the record. It doesn&apos;t move the set to another
          exercise, gym, or day.
        </Text>
      </ScrollView>
    </>
  );
}
