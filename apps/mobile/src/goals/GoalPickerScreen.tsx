import { useGoals } from "../api/goals";
import { LibraryScreen } from "../library/LibraryScreen";
import { Chip } from "../ui/Surface";
import { newGoalHref } from "./goal-model";

/**
 * G4 Pick the lift (Pitch 21i design §6): the 21h library — search, All or
 * Favorites, primary muscle; archived exercises never listed — pointed at the
 * goal form. A lift that already has an active goal says so; the form then
 * shows the web's duplicate answer.
 */
export function GoalPickerScreen() {
  const goals = useGoals();
  const withGoal = new Set((goals.data?.active ?? []).map((g) => g.exerciseId));
  return (
    <LibraryScreen
      title="New goal"
      detailHref={(exerciseId) =>
        newGoalHref({ kind: "exercise", exerciseId, gymId: null })
      }
      trailing={(e) =>
        withGoal.has(e.id) ? <Chip label="Goal set" tone="muted" /> : null
      }
      onAddOwn={null}
    />
  );
}
