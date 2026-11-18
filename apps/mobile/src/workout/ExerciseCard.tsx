import { useEffect, useRef, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Pressable,
  TextInput,
  View,
  type HostInstance,
  type TextInputInstance,
} from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ExerciseCardDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";
import { formatRepTarget } from "@overload/shared/plan/rep-target";
import { checkLoggedReps } from "@overload/shared/logging/reps";
import { formatWeight, offerCaption } from "@overload/shared/logging/set-entry";
import { checkWeightLbs } from "@overload/shared/logging/weight";
import { ApiError } from "../api/errors";
import { invalidateTraining, useLogSet, useSetSkipped } from "../api/training";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { Surface } from "../ui/Surface";
import { fontFamily, textSize, tint } from "../ui/theme";
import { useTheme } from "../ui/ThemeProvider";
import { showExerciseActions } from "./exercise-actions";
import { setValueLabel, setValueSpoken } from "./labels";
import { changeFailureMessage, needsRefresh } from "./messages";
import { swapHref } from "./routes";
import {
  cardActiveSet,
  cardContext,
  cardMode,
  cardOffer,
  parseRepsText,
  parseWeightText,
} from "./card-model";

/**
 * One keypad bar per input, with an id unique to that input (OVE-213). React
 * Native's InputAccessoryView attaches its bar to the FIRST text input in the
 * window with its nativeID, once, when the bar mounts. A shared id left reps
 * and every later set's inputs with no bar, so Log set sat under the keyboard.
 * Each bar now mounts beside its own input, inside the set's keyed row.
 */
export function keypadBarId(
  loggedExerciseId: string,
  setNumber: number,
  field: "weight" | "reps",
): string {
  return `overload-set-entry-${loggedExerciseId}-${setNumber}-${field}`;
}

type BarAction = { label: string; onPress: () => void; disabled?: boolean };

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
  activeRowRef,
  onActiveRowLayout,
}: {
  card: ExerciseCardDto;
  workout: WorkoutDto;
  position: { index: number; total: number };
  /** Called when a saved set leaves nothing to log on this card. */
  onPlannedSetsDone?: () => void;
  /** The active set's row, which the screen keeps above the keyboard. */
  activeRowRef?: React.Ref<HostInstance>;
  /** The active row moved or changed size (a set saved, an error showed). */
  onActiveRowLayout?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const client = useQueryClient();
  const logSet = useLogSet();
  const setSkipped = useSetSkipped();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  /** A swap, skip, or undo that failed or was refused (Pitch 21f). */
  const [changeError, setChangeError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const weightRef = useRef<TextInputInstance>(null);
  const repsRef = useRef<TextInputInstance>(null);
  /** The set whose confirmed save should move focus on (review #1). */
  const focusAfter = useRef<number | null>(null);

  const mode = cardMode(card);
  const needsWeight = card.requiresExternalWeight;
  const active = mode === "log" ? cardActiveSet(card) : null;
  const offer = cardOffer(card);
  const draft = active !== null ? (drafts[active] ?? EMPTY) : EMPTY;
  const weightText =
    draft.weight ?? (offer ? formatWeight(offer.weightLbs) : "");
  const showCaption = needsWeight && draft.weight === null && offer !== null;
  const saving = logSet.isPending;
  /** The exercise itself is changing: nothing else on the card may be sent. */
  const changing = setSkipped.isPending;
  const context = cardContext(card, workout);

  // Focus follows the lifter's own save (never on open), and only once the
  // card SHOWS that set confirmed and the inputs are editable again: the next
  // set's reps when its weight is offered, else its weight; after the last
  // planned set the keypad closes.
  useEffect(() => {
    const n = focusAfter.current;
    if (n === null || saving) return;
    if (!card.sets.some((x) => x.setNumber === n && x.saved)) return;
    focusAfter.current = null;
    if (active === null) {
      Keyboard.dismiss();
      onPlannedSetsDone?.();
      return;
    }
    const target = needsWeight && weightText === "" ? weightRef : repsRef;
    target.current?.focus();
  }, [card.sets, saving, active, needsWeight, weightText, onPlannedSetsDone]);

  function setDraft(n: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [n]: { ...(d[n] ?? EMPTY), ...patch } }));
  }

  function fail(error: FieldError) {
    setFieldError(error);
    void haptic.warning();
    (error.field === "weight" ? weightRef : repsRef).current?.focus();
  }

  function openSwap() {
    Keyboard.dismiss();
    setChangeError(null);
    router.push(swapHref(workout.loggedSessionId, card.loggedExerciseId));
  }

  /** Mark not done, or undo that. The card changes only on the server's 200. */
  async function markSkipped(skipped: boolean) {
    if (changing || saving) return;
    setChangeError(null);
    try {
      await setSkipped.mutateAsync({
        loggedSessionId: workout.loggedSessionId,
        loggedExerciseId: card.loggedExerciseId,
        skipped,
      });
      void haptic.light();
    } catch (error) {
      void haptic.warning();
      setChangeError(changeFailureMessage(error, "update this exercise"));
      // Refused because the workout moved on elsewhere: show its real state.
      if (needsRefresh(error)) {
        void invalidateTraining(client, workout.loggedSessionId);
      }
    }
  }

  /** More: the rare things to do to this exercise (design §6, RD-14). */
  async function openMore() {
    // Never open a sheet over a half-covered screen.
    Keyboard.dismiss();
    const action = await showExerciseActions(card, workout);
    if (action === "swap") openSwap();
    else if (action === "skip") await markSkipped(true);
  }

  async function confirm() {
    if (active === null || saving || changing) return;
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
    focusAfter.current = n;
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
    } catch (error) {
      focusAfter.current = null;
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
    <Surface style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text
            size="2xl"
            weight="semibold"
            tone={mode === "not_done" ? "muted" : "default"}
            accessibilityRole="header"
            accessibilityHint={`Exercise ${position.index + 1} of ${position.total}`}
          >
            {card.performedExerciseName}
          </Text>
          <Text tone="muted">{scheme}</Text>
          {card.swapped ? (
            <Text size="xs" tone="muted">
              Swapped from {card.plannedExerciseName}
            </Text>
          ) : null}
        </View>
        {mode !== "unavailable" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More for ${card.performedExerciseName}`}
            accessibilityState={{ disabled: changing }}
            disabled={changing}
            hitSlop={4}
            onPress={() => void openMore()}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: changing ? 0.5 : pressed ? 0.6 : 1,
            })}
          >
            <Symbol
              name="ellipsis.circle"
              size={24}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>

      {changeError ? (
        <Text
          size="sm"
          tone="destructive"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {changeError}
        </Text>
      ) : null}

      {mode === "not_done" ? (
        <View style={{ gap: spacing.md }}>
          <Text tone="muted">
            Not done today. It won&apos;t count toward progression.
          </Text>
          <Button
            label="Undo — I'll log it"
            variant="secondary"
            loading={changing}
            onPress={() => void markSkipped(false)}
          />
        </View>
      ) : mode === "unavailable" ? (
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xxs }}>
            <Text tone="destructive" weight="medium">
              Unavailable — choose a substitute
            </Text>
            <Text size="sm" tone="muted">
              This planned exercise was archived. Pick a substitute to log it.
              Your plan isn&apos;t changed.
            </Text>
          </View>
          <Button
            label="Swap exercise"
            disabled={changing}
            onPress={openSwap}
          />
          <Button
            label="Didn't do this exercise"
            variant="text"
            loading={changing}
            onPress={() => void markSkipped(true)}
          />
        </View>
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <Text size="sm" tone="muted">
              {context.line}
            </Text>
            {context.reference ? (
              // Reference-only history (Prescription-Aware RD): its own panel,
              // never a prefill, so it can't read as this workout's weight.
              <View
                style={{
                  backgroundColor: colors.secondary,
                  borderRadius: radius.lg,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <Text
                  size="sm"
                  tone="muted"
                  accessibilityLabel={context.reference.replace(
                    "For reference:",
                    "For reference,",
                  )}
                >
                  {context.reference}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: spacing.xs }}>
            {card.sets.map((s) =>
              s.saved ? (
                <LoggedRow key={s.setNumber} set={s} />
              ) : s.setNumber === active ? (
                <View
                  key={s.setNumber}
                  ref={activeRowRef}
                  onLayout={onActiveRowLayout}
                  style={{
                    gap: spacing.xs,
                    padding: spacing.sm,
                    borderRadius: radius.lg,
                    backgroundColor: colors.secondary,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text weight="semibold" style={{ width: 48 }}>
                      Set {s.setNumber}
                    </Text>
                    {needsWeight ? (
                      <NumberField
                        ref={weightRef}
                        barId={keypadBarId(
                          card.loggedExerciseId,
                          s.setNumber,
                          "weight",
                        )}
                        barAction={{
                          label: "Next",
                          onPress: () => repsRef.current?.focus(),
                        }}
                        value={weightText}
                        unit="lbs"
                        keyboardType="decimal-pad"
                        label={`Set ${s.setNumber} weight in pounds`}
                        hint={
                          showCaption && offer ? offerCaption(offer) : undefined
                        }
                        invalid={fieldError?.field === "weight"}
                        editable={!saving}
                        onChangeText={(t) => {
                          setDraft(s.setNumber, { weight: t });
                          if (fieldError?.field === "weight")
                            setFieldError(null);
                        }}
                      />
                    ) : null}
                    <NumberField
                      ref={repsRef}
                      barId={keypadBarId(
                        card.loggedExerciseId,
                        s.setNumber,
                        "reps",
                      )}
                      barAction={{
                        label: saving ? "Saving…" : `Log set ${s.setNumber}`,
                        onPress: () => void confirm(),
                        disabled: saving,
                      }}
                      value={draft.reps}
                      unit="reps"
                      keyboardType="number-pad"
                      label={`Set ${s.setNumber} reps`}
                      invalid={fieldError?.field === "reps"}
                      editable={!saving}
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
                  {notice ? (
                    // In the active row, so it stays above the keyboard with
                    // the numbers it kept (OVE-213).
                    <Text
                      size="sm"
                      tone="destructive"
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={{ marginLeft: 56 }}
                    >
                      {notice}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View
                  key={s.setNumber}
                  accessible
                  accessibilityLabel={`Set ${s.setNumber}${s.extra ? ", extra" : ""}, not logged yet`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    minHeight: 44,
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  <Text tone="muted" style={{ width: 48 }}>
                    Set {s.setNumber}
                  </Text>
                  <Text tone="muted">—</Text>
                </View>
              ),
            )}
          </View>

          {notice && active === null ? (
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
              disabled={changing}
              onPress={() => void confirm()}
            />
          ) : (
            <Text size="sm" tone="muted" accessibilityLiveRegion="polite">
              All {card.plannedSets} sets logged.
            </Text>
          )}
        </>
      )}
    </Surface>
  );
}

function LoggedRow({ set }: { set: ExerciseCardDto["sets"][number] }) {
  const { colors, radius, spacing } = useTheme();
  const shown = { ...set, reps: set.reps ?? 0 };
  return (
    <View
      accessible
      accessibilityLabel={`Set ${set.setNumber}${set.extra ? ", extra" : ""}, ${setValueSpoken(shown)}, logged`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: 44,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.lg,
        // A saved set: a quiet primary tint, only after the server's 200.
        backgroundColor: tint(colors.primary, 0.1),
      }}
    >
      <Text tone="muted" style={{ width: 48 }}>
        Set {set.setNumber}
      </Text>
      <Text weight="medium" style={{ flex: 1 }}>
        {setValueLabel(shown)}
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
  /** This input's own keypad bar id and action (OVE-213). */
  barId: string;
  barAction: BarAction;
  value: string;
  unit: string;
  keyboardType: "decimal-pad" | "number-pad";
  label: string;
  hint?: string;
  invalid: boolean;
  editable: boolean;
  onChangeText: (t: string) => void;
  ref?: React.RefObject<TextInputInstance | null>;
};

/** A large tabular number input with its unit (design §3 set-entry numerals). */
function NumberField({
  barId,
  barAction,
  value,
  unit,
  keyboardType,
  label,
  hint,
  invalid,
  editable,
  onChangeText,
  ref,
}: NumberFieldProps) {
  const { colors, radius, spacing } = useTheme();
  const [hasFocus, setHasFocus] = useState(false);
  return (
    <>
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
          backgroundColor: colors.card,
          gap: spacing.xs,
        }}
      >
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          inputAccessoryViewID={barId}
          editable={editable}
          selectTextOnFocus
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: !editable }}
          onFocus={() => setHasFocus(true)}
          onBlur={() => setHasFocus(false)}
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
      {/* After its input, so the bar finds it when both mount (OVE-213). */}
      <InputAccessoryView
        nativeID={barId}
        // The bar shows in the keyboard, but React Native also leaves an empty
        // placeholder view here, absolutely positioned over the inputs. A
        // RECYCLED placeholder comes back unhidden (its layout reset forces
        // hidden = NO after updateProps hid it) and swallowed taps meant for
        // the inputs, so after moving between exercises a field wouldn't focus
        // (OVE-214). With pointerEvents "none" its hit test returns nil. The
        // bar's own buttons live in the keyboard, outside the placeholder.
        style={{ pointerEvents: "none" }}
      >
        <KeypadBar action={barAction} />
      </InputAccessoryView>
    </>
  );
}

/**
 * The bar above the keypad (design §8): Done on the left hides the keyboard
 * and keeps the draft (OVE-214); the primary action on the right is Next on
 * weight, Log set on reps.
 */
function KeypadBar({ action }: { action: BarAction }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xs,
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Button
        label="Done"
        variant="text"
        accessibilityHint="Hides the keyboard. Your numbers stay."
        onPress={() => Keyboard.dismiss()}
      />
      <Button
        label={action.label}
        variant="primary"
        size="md"
        disabled={action.disabled}
        onPress={action.onPress}
      />
    </View>
  );
}
