import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import {
  CARDIO_TYPE_SUGGESTIONS,
  parseCardioEntry,
} from "@overload/shared/cardio/validation";
import { ApiError } from "../api/errors";
import { useEditCardio, useLogCardio } from "../api/training";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { fontFamily, textSize } from "../ui/theme";
import { useTheme } from "../ui/ThemeProvider";
import { cardioContextLine, type CardioTarget } from "./cardio-model";

/** The message for a cardio save that never reached a server answer. */
export function cardioFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network") {
      return "Couldn't save — Overload needs a connection. Your entries are still here.";
    }
    if (error.temporary) {
      return "Couldn't save — Overload isn't responding. Your entries are still here.";
    }
    return error.message;
  }
  return "Couldn't save. Your entries are still here.";
}

type Errors = { type?: string; durationMin?: string };

/**
 * C1 Cardio (Pitch 21f design §6, §15; RD-16): the activity and whole
 * minutes for one planned cardio day, prefilled from the plan when logging
 * and from the record when correcting. Nothing else: no timer, total, chart,
 * or tag. It is saved only on the server's answer, and a day that was already
 * recorded is never overwritten.
 */
export function CardioScreen({ target }: { target: CardioTarget | null }) {
  const { spacing } = useTheme();
  const cancel = (
    <Button
      label="Cancel"
      variant="text"
      accessibilityHint="Closes without saving"
      onPress={() => router.back()}
    />
  );
  if (!target) {
    return (
      <>
        <Stack.Screen options={{ title: "Cardio", headerLeft: () => cancel }} />
        <View style={{ padding: spacing.lg }}>
          <StateView
            title="This cardio isn't available."
            message="Go back and open it again."
            action={{ label: "Close", onPress: () => router.back() }}
          />
        </View>
      </>
    );
  }
  return <CardioForm target={target} cancel={cancel} />;
}

function CardioForm({
  target,
  cancel,
}: {
  target: CardioTarget;
  cancel: React.ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const logCardio = useLogCardio();
  const editCardio = useEditCardio();
  const start = target.mode === "edit" ? target.logged : target.planned;
  const [type, setType] = useState(start.type);
  const [minutes, setMinutes] = useState(String(start.durationMin));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const saving = useRef(false);
  const pending = logCardio.isPending || editCardio.isPending;

  async function save() {
    // A synchronous guard: a second tap before the re-render sends nothing.
    if (saving.current) return;
    // The server's own rules, run first so nothing invalid is sent.
    const parsed = parseCardioEntry({ type, durationMin: minutes });
    if (!parsed.ok) {
      setErrors(parsed.details);
      void haptic.warning();
      return;
    }
    saving.current = true;
    setErrors({});
    setFailure(null);
    try {
      if (target.mode === "edit") {
        await editCardio.mutateAsync({
          cardioLogId: target.cardioLogId,
          body: parsed.value,
        });
      } else {
        const answer = await logCardio.mutateAsync({
          mesocycleId: target.mesocycleId,
          scheduledFor: target.scheduledFor,
          body: parsed.value,
        });
        if (answer.alreadyLogged) {
          // Recorded earlier (another device, or a repeat): the stored record
          // stands, and what was typed here was not applied. Say so.
          Alert.alert(
            "Already logged",
            "This cardio was recorded earlier. Tap it to correct it.",
            [{ text: "OK", onPress: () => router.back() }],
          );
          return;
        }
      }
      void haptic.light();
      router.back();
    } catch (error) {
      void haptic.warning();
      const details = error instanceof ApiError ? error.details : {};
      if (details.type || details.durationMin) {
        setErrors({ type: details.type, durationMin: details.durationMin });
      } else {
        setFailure(cardioFailureMessage(error));
      }
    } finally {
      saving.current = false;
    }
  }

  const context = cardioContextLine(target);
  return (
    <>
      <Stack.Screen
        options={{
          title: target.mode === "edit" ? "Edit cardio" : "Log cardio",
          headerLeft: () => cancel,
          headerRight: () => (
            <Button
              label="Save"
              variant="text"
              loading={pending}
              accessibilityHint={
                target.mode === "edit"
                  ? "Saves this correction"
                  : "Records this cardio"
              }
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
        {context ? (
          <Text size="sm" tone="muted">
            {context}
          </Text>
        ) : null}

        {failure ? <Banner message={failure} /> : null}

        <View style={{ gap: spacing.sm }}>
          <TextField
            label="Activity"
            value={type}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            editable={!pending}
            error={errors.type ?? null}
            onChangeText={(t) => {
              setType(t);
              setErrors((e) => ({ ...e, type: undefined }));
            }}
          />
          {/* Shortcuts only: any activity can be typed. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {CARDIO_TYPE_SUGGESTIONS.map((suggestion) => {
              const on = type.trim() === suggestion;
              return (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${suggestion}`}
                  accessibilityState={{ selected: on, disabled: pending }}
                  disabled={pending}
                  onPress={() => {
                    setType(suggestion);
                    setErrors((e) => ({ ...e, type: undefined }));
                  }}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? colors.foreground : colors.border,
                    backgroundColor: on ? colors.accent : colors.card,
                  }}
                >
                  <Text
                    size="sm"
                    weight="medium"
                    tone={on ? "default" : "muted"}
                  >
                    {suggestion}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <TextField
          label="Minutes"
          value={minutes}
          keyboardType="number-pad"
          selectTextOnFocus
          editable={!pending}
          error={errors.durationMin ?? null}
          onChangeText={(t) => {
            setMinutes(t);
            setErrors((e) => ({ ...e, durationMin: undefined }));
          }}
          style={{
            ...textSize("xl"),
            fontFamily: fontFamily.semibold,
            fontVariant: ["tabular-nums"],
            minHeight: 52,
          }}
        />
      </ScrollView>
    </>
  );
}
