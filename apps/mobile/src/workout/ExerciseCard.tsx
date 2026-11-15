import { useEffect, useRef, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Pressable,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ExerciseCardDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";
import { formatRepTarget } from "@overload/shared/plan/rep-target";
import { checkLoggedReps } from "@overload/shared/logging/reps";
import { rirSuffix } from "@overload/shared/logging/rir";
import { formatWeight, offerCaption } from "@overload/shared/logging/set-entry";
import { checkWeightLbs } from "@overload/shared/logging/weight";
import { ApiError } from "../api/errors";
import { invalidateTraining, useLogSet } from "../api/training";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { fontFamily, textSize } from "../ui/theme";
import { useTheme } from "../ui/ThemeProvider";
import {
  cardActiveSet,
  cardContext,
  cardMode,
  cardOffer,
  parseRepsText,
  parseWeightText,
} from "./card-model";

/** The keypad bar's id (one bar, shared by the active row's two inputs). */
export const KEYPAD_BAR_ID = "overload-set-entry";

type Draft = { weight: string | null; reps: string };
const EMPTY: Draft = { weight: null, reps: "" };
type FieldError = { field: "weight" | "reps"; message: string };

/** The message for a save that never reached a server answer (RD-9). */
export function saveFailureMessage(error: ApiError): string {
  if (error.code === "network") {
    return "Couldn't save — Overload needs a connection. Your numbers are still here.";
  }
  if (error.temporary) {
    return "Couldn't save — Overload isn't responding. Your numbers are still here.";
  }
  return error.message;
}

/**
 * W1's logging card (Pitch 21e design §6, §15). All planned sets together; the
 * lowest unlogged one has inputs. A row turns logged only when the server's
 * 200 puts it in the workout (the cache merge in useLogSet), so a failed save
 * can never look saved. The weight box holds the offer (cardOffer) until the
 * lifter types; reps are never offered. Drafts live only in this component.
 */
export function ExerciseCard({
  card,
  workout,
  position,
  onPlannedSetsDone,
}: {
  card: ExerciseCardDto;
  workout: WorkoutDto;
  position: { index: number; total: number };
  /** Called when a saved set leaves nothing to log on this card. */
  onPlannedSetsDone?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const client = useQueryClient();
  const logSet = useLogSet();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState<"weight" | "reps" | null>(null);
  const weightRef = useRef<TextInputInstance>(null);
  const repsRef = useRef<TextInputInstance>(null);
  const focusNext = useRef(false);

  const mode = cardMode(card);
  const needsWeight = card.requiresExternalWeight;
  const active = mode === "log" ? cardActiveSet(card) : null;
  const offer = cardOffer(card);
  const draft = active !== null ? (drafts[active] ?? EMPTY) : EMPTY;
  const weightText =
    draft.weight ?? (offer ? formatWeight(offer.weightLbs) : "");
  const showCaption = needsWeight && draft.weight === null && offer !== null;
  const saving = logSet.isPending;
  const context = cardContext(card, workout);

  // Focus follows the lifter's own save (never on open): the next set's reps
  // when its weight is offered, else its weight.
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    if (active === null) {
      Keyboard.dismiss();
      onPlannedSetsDone?.();
      return;
    }
    const target = needsWeight && weightText === "" ? weightRef : repsRef;
    target.current?.focus();
  }, [active, needsWeight, weightText, onPlannedSetsDone]);

  function setDraft(n: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [n]: { ...(d[n] ?? EMPTY), ...patch } }));
  }

  function fail(error: FieldError) {
    setFieldError(error);
    void haptic.warning();
    (error.field === "weight" ? weightRef : repsRef).current?.focus();
  }

  async function confirm() {
    if (active === null || saving) return;
    const n = active;
    let weightLbs: number | null = null;
    if (needsWeight) {
      // The server's own rule, run first so nothing invalid is sent (RD-10).
      const checked = checkWeightLbs(parseWeightText(weightText));
      if (!checked.ok)
        return fail({ field: "weight", message: checked.message });
      weightLbs = checked.value;
    }
    const reps = checkLoggedReps(parseRepsText(draft.reps));
    if (!reps.ok) return fail({ field: "reps", message: reps.message });
    setFieldError(null);
    setNotice(null);
    try {
      await logSet.mutateAsync({
        loggedSessionId: workout.loggedSessionId,
        loggedExerciseId: card.loggedExerciseId,
        setNumber: n,
        // No RIR in 21e (RD-12): omitted is stored as "not recorded".
        body: needsWeight
          ? { weightLbs, reps: reps.value }
          : { reps: reps.value },
      });
      setDrafts((d) => {
        const rest = { ...d };
        delete rest[n];
        return rest;
      });
      void haptic.light();
      focusNext.current = true;
    } catch (error) {
      void haptic.warning();
      const e =
        error instanceof ApiError
          ? error
          : new ApiError("unavailable", "Couldn't save.");
      const details = e.details;
      if (e.code === "conflict") {
        setNotice(`Set ${n} was already logged.`);
        void invalidateTraining(client, workout.loggedSessionId);
      } else if (
        e.code === "invalid_state_transition" ||
        e.code === "not_found"
      ) {
        setNotice(e.message);
        void invalidateTraining(client, workout.loggedSessionId);
      } else if (details.weightLbs) {
        fail({ field: "weight", message: details.weightLbs });
      } else if (details.reps) {
        fail({ field: "reps", message: details.reps });
      } else {
        setNotice(saveFailureMessage(e));
      }
    }
  }

  const gymLine =
    card.isGymVariable && card.gymName ? ` · ${card.gymName}` : "";
  const scheme = `${card.plannedSets} × ${formatRepTarget(
    card.plannedRepRange.min,
    card.plannedRepRange.max,
  )}${needsWeight ? "" : " · bodyweight, reps only"}${gymLine}`;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ gap: spacing.xxs }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: spacing.sm,
          }}
        >
          <Text
            size="lg"
            weight="semibold"
            accessibilityRole="header"
            style={{ flex: 1 }}
          >
            {card.performedExerciseName}
          </Text>
          <Text
            size="xs"
            tone="muted"
            accessibilityLabel={`Exercise ${position.index + 1} of ${position.total}`}
          >
            {position.index + 1} / {position.total}
          </Text>
        </View>
        <Text size="sm" tone="muted">
          {scheme}
        </Text>
        {card.swapped ? (
          <Text size="xs" tone="muted">
            Swapped from {card.plannedExerciseName}
          </Text>
        ) : null}
      </View>

      {mode === "not_done" ? (
        <EdgeNote
          title="Not done today."
          message="To log it, undo that on the web."
        />
      ) : mode === "unavailable" ? (
        <EdgeNote
          title="Unavailable — this exercise was archived."
          message="Swap it on the web, or finish without it."
        />
      ) : (
        <>
          <View style={{ gap: spacing.xxs }}>
            <Text size="sm" tone="muted">
              {context.line}
            </Text>
            {context.reference ? (
              <Text
                size="xs"
                tone="muted"
                accessibilityLabel={context.reference.replace(
                  "For reference:",
                  "For reference,",
                )}
              >
                {context.reference}
              </Text>
            ) : null}
          </View>

          <View
            style={{ height: 1, backgroundColor: colors.border }}
            accessible={false}
          />

          <View style={{ gap: spacing.sm }}>
            {card.sets.map((s) =>
              s.saved ? (
                <LoggedRow key={s.setNumber} set={s} />
              ) : s.setNumber === active ? (
                <View key={s.setNumber} style={{ gap: spacing.xs }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text weight="medium" style={{ width: 48 }}>
                      Set {s.setNumber}
                    </Text>
                    {needsWeight ? (
                      <NumberField
                        ref={weightRef}
                        value={weightText}
                        unit="lbs"
                        keyboardType="decimal-pad"
                        label={`Set ${s.setNumber} weight in pounds`}
                        hint={
                          showCaption && offer ? offerCaption(offer) : undefined
                        }
                        invalid={fieldError?.field === "weight"}
                        editable={!saving}
                        onFocus={() => setFocused("weight")}
                        onBlur={() => setFocused(null)}
                        onChangeText={(t) => {
                          setDraft(s.setNumber, { weight: t });
                          if (fieldError?.field === "weight")
                            setFieldError(null);
                        }}
                      />
                    ) : null}
                    <NumberField
                      ref={repsRef}
                      value={draft.reps}
                      unit="reps"
                      keyboardType="number-pad"
                      label={`Set ${s.setNumber} reps`}
                      invalid={fieldError?.field === "reps"}
                      editable={!saving}
                      onFocus={() => setFocused("reps")}
                      onBlur={() => setFocused(null)}
                      onChangeText={(t) => {
                        setDraft(s.setNumber, { reps: t });
                        if (fieldError?.field === "reps") setFieldError(null);
                      }}
                    />
                  </View>
                  {showCaption && offer ? (
                    <Text size="xs" tone="muted" style={{ marginLeft: 56 }}>
                      {offerCaption(offer)}
                    </Text>
                  ) : null}
                  {fieldError ? (
                    <Text
                      size="sm"
                      tone="destructive"
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={{ marginLeft: 56 }}
                    >
                      {fieldError.message}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View
                  key={s.setNumber}
                  accessible
                  accessibilityLabel={`Set ${s.setNumber}${s.extra ? ", extra" : ""}, not logged yet`}
                  style={{ flexDirection: "row", gap: spacing.sm }}
                >
                  <Text tone="muted" style={{ width: 48 }}>
                    Set {s.setNumber}
                  </Text>
                  <Text tone="muted">—</Text>
                </View>
              ),
            )}
          </View>

          {notice ? (
            <Text
              size="sm"
              tone="destructive"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {notice}
            </Text>
          ) : null}

          {active !== null ? (
            <Button
              label={saving ? "Saving…" : `Log set ${active}`}
              accessibilityLabel={
                saving ? `Saving set ${active}` : `Log set ${active}`
              }
              loading={saving}
              onPress={() => void confirm()}
            />
          ) : (
            <Text size="sm" tone="muted" accessibilityLiveRegion="polite">
              All {card.plannedSets} sets logged.
            </Text>
          )}

          <InputAccessoryView nativeID={KEYPAD_BAR_ID}>
            <KeypadBar
              action={
                focused === "weight"
                  ? { label: "Next", onPress: () => repsRef.current?.focus() }
                  : active !== null
                    ? {
                        label: saving ? "Saving…" : `Log set ${active}`,
                        onPress: () => void confirm(),
                        disabled: saving,
                      }
                    : null
              }
            />
          </InputAccessoryView>
        </>
      )}
    </View>
  );
}

function EdgeNote({ title, message }: { title: string; message: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xxs }} accessible>
      <Text tone="muted" weight="medium">
        {title}
      </Text>
      <Text size="sm" tone="muted">
        {message}
      </Text>
    </View>
  );
}

function LoggedRow({ set }: { set: ExerciseCardDto["sets"][number] }) {
  const { colors, spacing } = useTheme();
  const value =
    set.weightLbs === null
      ? `${set.reps} reps`
      : `${formatWeight(set.weightLbs)} lbs × ${set.reps}`;
  const rir = rirSuffix(set.rir);
  const spokenValue =
    set.weightLbs === null
      ? `${set.reps} reps`
      : `${formatWeight(set.weightLbs)} pounds, ${set.reps} reps`;
  return (
    <View
      accessible
      accessibilityLabel={`Set ${set.setNumber}${set.extra ? ", extra" : ""}, ${spokenValue}, logged`}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
    >
      <Text style={{ width: 48 }}>Set {set.setNumber}</Text>
      <Text style={{ flex: 1 }}>
        {value}
        {rir ? ` ${rir}` : ""}
        {set.extra ? " · extra" : ""}
      </Text>
      <Symbol
        name="checkmark"
        size={16}
        color={colors.primary}
        weight="semibold"
      />
    </View>
  );
}

type NumberFieldProps = {
  value: string;
  unit: string;
  keyboardType: "decimal-pad" | "number-pad";
  label: string;
  hint?: string;
  invalid: boolean;
  editable: boolean;
  onChangeText: (t: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  ref?: React.RefObject<TextInputInstance | null>;
};

/** A large tabular number input with its unit (design §3 set-entry numerals). */
function NumberField({
  value,
  unit,
  keyboardType,
  label,
  hint,
  invalid,
  editable,
  onChangeText,
  onFocus,
  onBlur,
  ref,
}: NumberFieldProps) {
  const { colors, radius, spacing } = useTheme();
  const [hasFocus, setHasFocus] = useState(false);
  return (
    <Pressable
      onPress={() => ref?.current?.focus()}
      accessible={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        minWidth: 112,
        flexGrow: 1,
        flexBasis: 112,
        minHeight: 52,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        borderWidth: hasFocus || invalid ? 2 : 1,
        borderColor: invalid
          ? colors.destructive
          : hasFocus
            ? colors.ring
            : colors.input,
        backgroundColor: colors.background,
        gap: spacing.xs,
      }}
    >
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        inputAccessoryViewID={KEYPAD_BAR_ID}
        editable={editable}
        selectTextOnFocus
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ disabled: !editable }}
        onFocus={() => {
          setHasFocus(true);
          onFocus();
        }}
        onBlur={() => {
          setHasFocus(false);
          onBlur();
        }}
        placeholderTextColor={colors.mutedForeground}
        style={{
          flex: 1,
          minHeight: 48,
          ...textSize("xl"),
          fontFamily: fontFamily.semibold,
          fontVariant: ["tabular-nums"],
          color: colors.foreground,
          paddingVertical: 0,
        }}
      />
      <Text size="sm" tone="muted">
        {unit}
      </Text>
    </Pressable>
  );
}

/** The bar above the keypad: Next on weight, Log set on reps (design §8). */
function KeypadBar({
  action,
}: {
  action: { label: string; onPress: () => void; disabled?: boolean } | null;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xs,
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {action ? (
        <Button
          label={action.label}
          variant="text"
          disabled={action.disabled}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}
