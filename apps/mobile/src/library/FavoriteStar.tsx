import { Pressable } from "react-native";
import type { ExerciseListItemDto } from "@overload/shared/contracts/exercises";
import { useToggleFavorite } from "../api/resources";
import { haptic } from "../ui/haptics";
import { Symbol } from "../ui/Symbol";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";

/**
 * A library row's favorite toggle (Pitch 21h design L1): 44 × 44, named for
 * the exercise, with its state. It changes at once and goes back if the
 * server refuses; `onFailure` gets the sentence to show.
 */
export function FavoriteStar({
  exercise,
  onFailure,
}: {
  exercise: ExerciseListItemDto;
  onFailure: (message: string) => void;
}) {
  const { colors } = useTheme();
  const toggle = useToggleFavorite();
  const on = exercise.isFavorite;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        on
          ? `Remove ${exercise.name} from favorites`
          : `Add ${exercise.name} to favorites`
      }
      accessibilityState={{ selected: on }}
      onPress={() => {
        void haptic.selection();
        toggle.mutate(
          { exerciseId: exercise.id, isFavorite: !on },
          {
            onError: (error) =>
              onFailure(changeFailureMessage(error, "update favorites")),
          },
        );
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 4,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Symbol
        name={on ? "star.fill" : "star"}
        size={20}
        color={on ? colors.primary : colors.mutedForeground}
      />
    </Pressable>
  );
}
