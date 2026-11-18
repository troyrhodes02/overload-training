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
export type ExerciseAction = "swap" | "skip";

const LABELS: Record<ExerciseAction, string> = {
  swap: "Swap exercise",
  skip: "Didn't do this exercise",
};

export const SETS_LOGGED_MESSAGE =
  "Sets are logged, so this exercise can't be swapped or marked not done.";

export function exerciseActions(
  card: ExerciseCardDto,
  workout: Pick<WorkoutDto, "status">,
): { actions: ExerciseAction[]; message: string | null } {
  if (workout.status !== "in_progress") return { actions: [], message: null };
  const anySaved = card.sets.some((s) => s.saved);
  if (anySaved) return { actions: [], message: SETS_LOGGED_MESSAGE };
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
