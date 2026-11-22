import { useRef, useState } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { parseGymInput } from "@overload/shared/gyms/validation";
import { ApiError } from "../api/errors";
import { useIntentKey } from "../api/idempotency";
import { useCreateGym } from "../api/resources";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { setNotice } from "../ui/notice-store";
import { TextField, type TextInputHandle } from "../ui/TextField";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";
import { GYM_LOCATION_HINT } from "./gym-model";

type Errors = { name?: string; address?: string };

/**
 * G3 New gym (Pitch 21h design §6 G3): a name and an optional free-text
 * location, checked by the shared rules, saved once per intent (RD-21). Only
 * the gym is created: no machine weight is copied from another gym.
 */
export function NewGymScreen({
  notify = true,
}: {
  /** Leave "Added X." for the gym list (false when Today opened it). */
  notify?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const close = useModalClose();
  const create = useCreateGym();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const saving = useRef(false);
  const locationRef = useRef<TextInputHandle>(null);
  const body = { name, address };
  const key = useIntentKey(body);
  const pending = create.isPending;

  async function save() {
    if (saving.current) return;
    const parsed = parseGymInput(body);
    if (!parsed.ok) {
      setErrors(parsed.details);
      void haptic.warning();
      return;
    }
    saving.current = true;
    setErrors({});
    setFailure(null);
    try {
      const gym = await create.mutateAsync({ key, body: parsed.value });
      void haptic.light();
      if (notify) setNotice("gyms", { message: `Added ${gym.name}.` });
      close();
    } catch (error) {
      void haptic.warning();
      const details = error instanceof ApiError ? error.details : {};
      if (details.name || details.address) {
        setErrors({ name: details.name, address: details.address });
      } else {
        setFailure(
          changeFailureMessage(
            error,
            "add the gym",
            "Your entries are still here.",
          ),
        );
      }
    } finally {
      saving.current = false;
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "New gym",
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
              accessibilityHint="Adds this gym"
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
          returnKeyType="next"
          editable={!pending}
          error={errors.name ?? null}
          onSubmitEditing={() => locationRef.current?.focus()}
          onChangeText={(t) => {
            setName(t);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
        />
        <TextField
          ref={locationRef}
          label="Location"
          hint={GYM_LOCATION_HINT}
          value={address}
          autoCapitalize="sentences"
          returnKeyType="done"
          editable={!pending}
          error={errors.address ?? null}
          onChangeText={(t) => {
            setAddress(t);
            setErrors((e) => ({ ...e, address: undefined }));
          }}
        />
      </ScrollView>
    </>
  );
}
