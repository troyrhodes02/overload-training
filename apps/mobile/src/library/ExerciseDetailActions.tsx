import { useState } from "react";
import { Alert, View } from "react-native";
import type { ExerciseDetailDto } from "@overload/shared/contracts/exercises";
import { useSetExerciseArchived, useToggleFavorite } from "../api/resources";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { changeFailureMessage } from "../workout/messages";
import type { ExerciseContext } from "./ExerciseScreen";

/** Which of the detail's actions apply (Pitch 21h design X1). Pure. */
export function detailActions(
  e: Pick<ExerciseDetailDto, "isArchived" | "canArchive">,
  context: ExerciseContext,
): { favorite: boolean; archive: boolean } {
  return {
    // The server refuses a star on an archived exercise; the web hides it.
    favorite: !e.isArchived,
    // Only the account's own, never from a workout (RD-13).
    archive: e.canArchive && !e.isArchived && context === "browse",
  };
}

/** The archive confirmation's words. */
export function archiveConfirmation(name: string): {
  title: string;
  message: string;
} {
  return {
    title: `Archive ${name}?`,
    message:
      "It leaves the library and the pickers. Past workouts and plans keep it.",
  };
}

/**
 * X1's favorite and archive (Pitch 21h design §6 X1). Archive asks first;
 * afterwards the screen shows Archived with an Undo that lasts while the
 * screen is open (the native form of the web's undo toast).
 */
export function ExerciseDetailActions({
  exercise: e,
  context,
}: {
  exercise: ExerciseDetailDto;
  context: ExerciseContext;
}) {
  const toggle = useToggleFavorite();
  const setArchived = useSetExerciseArchived();
  const [undoable, setUndoable] = useState(false);
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const show = detailActions(e, context);

  function confirmArchive() {
    const ask = archiveConfirmation(e.name);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: () => void archive(true),
      },
    ]);
  }

  async function archive(archived: boolean) {
    setFailure(null);
    try {
      await setArchived.mutateAsync({ exerciseId: e.id, archived });
      void haptic.success();
      setUndoable(archived);
      setRestored(!archived);
    } catch (error) {
      void haptic.warning();
      setFailure(
        changeFailureMessage(
          error,
          archived ? "archive" : "restore",
          "Nothing changed.",
        ),
      );
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {failure ? <Banner message={failure} /> : null}
      {undoable && e.isArchived ? (
        <Banner
          tone="info"
          message="Archived. Past workouts keep it."
          action={{
            label: "Undo",
            hint: "Puts it back in the library",
            onPress: () => void archive(false),
          }}
        />
      ) : null}
      {restored && !e.isArchived ? (
        <Banner tone="info" message="Restored." />
      ) : null}
      {show.favorite ? (
        <Button
          label={e.isFavorite ? "In favorites" : "Add to favorites"}
          variant="secondary"
          accessibilityHint={
            e.isFavorite ? "Removes it from your favorites" : undefined
          }
          accessibilityState={{ selected: e.isFavorite }}
          onPress={() => {
            setFailure(null);
            void haptic.selection();
            toggle.mutate(
              { exerciseId: e.id, isFavorite: !e.isFavorite },
              {
                onError: (error) =>
                  setFailure(changeFailureMessage(error, "update favorites")),
              },
            );
          }}
        />
      ) : null}
      {show.archive ? (
        <View style={{ alignItems: "flex-start" }}>
          <Button
            label="Archive exercise"
            variant="destructive-text"
            loading={setArchived.isPending}
            onPress={confirmArchive}
          />
        </View>
      ) : null}
    </View>
  );
}
