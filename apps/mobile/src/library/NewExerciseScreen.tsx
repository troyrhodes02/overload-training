import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TYPES,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  type EquipmentValue,
  type MuscleGroupValue,
} from "@overload/shared/exercises/taxonomy";
import { parseCustomExerciseInput } from "@overload/shared/exercises/validation";
import { ApiError } from "../api/errors";
import { useIntentKey } from "../api/idempotency";
import { useCreateExercise } from "../api/resources";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { ChipGroup } from "../ui/ChipGroup";
import { haptic } from "../ui/haptics";
import { setNotice } from "../ui/notice-store";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";

type Errors = Partial<
  Record<
    "name" | "primaryMuscle" | "equipmentType" | "secondaryMuscles",
    string
  >
>;

const MUSCLES = MUSCLE_GROUPS.map((m) => ({
  value: m,
  label: MUSCLE_GROUP_LABELS[m],
}));
const EQUIPMENT = EQUIPMENT_TYPES.map((e) => ({
  value: e,
  label: EQUIPMENT_LABELS[e],
}));

export const OWN_EXERCISE_NOTE =
  "Your own exercises have no image. Machines and cables keep their own working weights at each gym.";

/** Where the library's "View" opens a just-added exercise. */
export const libraryExerciseHref = (id: string) =>
  `/more/exercises/${encodeURIComponent(id)}`;

/**
 * L2 New exercise (Pitch 21h design §6 L2, §15): the web's fields and rules —
 * a name, one primary muscle, the equipment, any secondary muscles — checked
 * by the shared parser before anything is sent, and saved once: a retried
 * Save resends the same request identity (RD-21).
 */
export function NewExerciseScreen({ initialName }: { initialName: string }) {
  const { colors, spacing } = useTheme();
  const close = useModalClose();
  const create = useCreateExercise();
  const [name, setName] = useState(initialName);
  const [primary, setPrimary] = useState<MuscleGroupValue | null>(null);
  const [equipment, setEquipment] = useState<EquipmentValue | null>(null);
  const [secondary, setSecondary] = useState<MuscleGroupValue[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const saving = useRef(false);
  const pending = create.isPending;
  const body = {
    name,
    primaryMuscle: primary,
    equipmentType: equipment,
    secondaryMuscles: secondary,
  };
  const key = useIntentKey(body);

  async function save() {
    if (saving.current) return;
    const parsed = parseCustomExerciseInput(body);
    if (!parsed.ok) {
      setErrors(parsed.details);
      void haptic.warning();
      return;
    }
    saving.current = true;
    setErrors({});
    setFailure(null);
    try {
      const created = await create.mutateAsync({ key, body: parsed.value });
      void haptic.light();
      setNotice("exercises", {
        message: `Added ${created.name}.`,
        viewHref: libraryExerciseHref(created.id),
      });
      close();
    } catch (error) {
      void haptic.warning();
      const details = error instanceof ApiError ? error.details : {};
      const fieldErrors: Errors = {
        name: details.name,
        primaryMuscle: details.primaryMuscle,
        equipmentType: details.equipmentType,
        secondaryMuscles: details.secondaryMuscles,
      };
      if (Object.values(fieldErrors).some(Boolean)) setErrors(fieldErrors);
      else
        setFailure(
          changeFailureMessage(
            error,
            "add the exercise",
            "Your entries are still here.",
          ),
        );
    } finally {
      saving.current = false;
    }
  }

  const fieldError = (text: string | undefined) =>
    text ? (
      <Text size="sm" tone="destructive" accessibilityRole="alert">
        {text}
      </Text>
    ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: "New exercise",
          headerLeft: () => (
            <Button
              label="Cancel"
              variant="text"
              accessibilityHint="Closes without saving"
              onPress={close}
            />
          ),
          headerRight: () => (
            <Button
              label="Save"
              variant="text"
              loading={pending}
              accessibilityHint="Adds this exercise to your library"
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
        {failure ? <Banner message={failure} /> : null}
        <TextField
          label="Name"
          value={name}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          editable={!pending}
          error={errors.name ?? null}
          onChangeText={(t) => {
            setName(t);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
        />
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" weight="medium">
            Primary muscle
          </Text>
          <ChipGroup
            label="Primary muscle"
            options={MUSCLES}
            selected={primary ? [primary] : []}
            disabled={pending}
            onToggle={(m) => {
              setPrimary(m);
              // A muscle can't be both primary and secondary.
              setSecondary((s) => s.filter((x) => x !== m));
              setErrors((e) => ({
                ...e,
                primaryMuscle: undefined,
                secondaryMuscles: undefined,
              }));
            }}
          />
          {fieldError(errors.primaryMuscle)}
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" weight="medium">
            Equipment
          </Text>
          <ChipGroup
            label="Equipment"
            options={EQUIPMENT}
            selected={equipment ? [equipment] : []}
            disabled={pending}
            onToggle={(eq) => {
              setEquipment(eq);
              setErrors((e) => ({ ...e, equipmentType: undefined }));
            }}
          />
          {fieldError(errors.equipmentType)}
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" weight="medium">
            Secondary muscles{" "}
            <Text size="sm" tone="muted">
              (optional)
            </Text>
          </Text>
          <ChipGroup
            label="Secondary muscles"
            options={MUSCLES.filter((m) => m.value !== primary)}
            selected={secondary}
            disabled={pending}
            onToggle={(m) => {
              setSecondary((s) =>
                s.includes(m) ? s.filter((x) => x !== m) : [...s, m],
              );
              setErrors((e) => ({ ...e, secondaryMuscles: undefined }));
            }}
          />
          {fieldError(errors.secondaryMuscles)}
        </View>
        <Text size="sm" tone="muted">
          {OWN_EXERCISE_NOTE}
        </Text>
      </ScrollView>
    </>
  );
}
