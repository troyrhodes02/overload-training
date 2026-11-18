import { ActionSheetIOS } from "react-native";
import type {
  ExerciseCardDto,
  WorkoutDto,
} from "@overload/shared/contracts/logging";

/**
 * What the card's More button offers (Pitch 21f design §6, RD-14). The rows
 * come only from the server's facts about this card: whether the workout is
 * in progress and whether a set is saved. The server still decides every
 * write; this only keeps a row the server would refuse off the sheet, and
 * says why.
 */
export type ExerciseAction = "swap" | "skip" | "fewer_sets";

const LABELS: Record<ExerciseAction, string> = {
  swap: "Swap exercise",
  skip: "Didn't do this exercise",
  fewer_sets: "I meant to do fewer sets",
};

export const SETS_LOGGED_MESSAGE =
  "Sets are logged, so this exercise can't be swapped or marked not done.";

export function exerciseActions(
  card: ExerciseCardDto,
  workout: Pick<WorkoutDto, "status">,
): { actions: ExerciseAction[]; message: string | null } {
  if (workout.status !== "in_progress") return { actions: [], message: null };
  const anySaved = card.sets.some((s) => s.saved);
  if (anySaved) {
    // Short of the plan with something logged: it can be counted as planned.
    const short = fewerSetsConfirmation({
      name: card.performedExerciseName,
      plannedSets: card.plannedSets,
      savedWorkingSets: card.sets.filter((s) => s.saved && !s.extra).length,
    });
    return {
      actions: short ? ["fewer_sets"] : [],
      message: SETS_LOGGED_MESSAGE,
    };
  }
  // Marked not done: Undo is on the card; a swap also clears the mark.
  if (card.skipped) return { actions: ["swap"], message: null };
  return { actions: ["swap", "skip"], message: null };
}

/**
 * The native action sheet for one exercise. Resolves with the chosen action,
 * or null for Cancel. An action sheet is the iOS pattern for a short list of
 * things to do to the item just tapped.
 */
export function showExerciseActions(
  card: ExerciseCardDto,
  workout: Pick<WorkoutDto, "status">,
): Promise<ExerciseAction | null> {
  const { actions, message } = exerciseActions(card, workout);
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: card.performedExerciseName,
        message: message ?? undefined,
        options: [...actions.map((a) => LABELS[a]), "Cancel"],
        cancelButtonIndex: actions.length,
      },
      (index) => resolve(actions[index] ?? null),
    );
  });
}

/**
 * The one change here that can't be undone, so it asks first (design P1,
 * RD-12): count the working sets already logged as this workout's plan. The
 * number is always what was logged, so it can never drop below a saved set.
 * Null when it doesn't apply: nothing logged yet, or nothing short.
 */
export function fewerSetsConfirmation(e: {
  name: string;
  plannedSets: number;
  savedWorkingSets: number;
}): {
  title: string;
  message: string;
  confirm: string;
  plannedSets: number;
} | null {
  const n = e.savedWorkingSets;
  if (n < 1 || n >= e.plannedSets) return null;
  const sets = (count: number) => `${count} ${count === 1 ? "set" : "sets"}`;
  return {
    title: `Count ${sets(n)} as the plan for this workout?`,
    message: `${e.name} was planned for ${sets(e.plannedSets)}. This changes this workout only — your plan stays the same, and no logged set is removed. You can't raise it again.`,
    confirm: `Count ${sets(n)}`,
    plannedSets: n,
  };
}
