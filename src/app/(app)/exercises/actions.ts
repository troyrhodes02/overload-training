"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  archiveExercise,
  createCustomExercise,
  restoreExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import { customExerciseInputFromFormData } from "@/lib/exercises/validation";

/*
 * Exercise Library server actions. Each one re-checks the auth session FIRST
 * (never relying on the proxy or layout), then calls the write module.
 */

export async function setExerciseFavoriteAction(
  exerciseId: string,
  isFavorite: boolean,
): Promise<ActionResult<{ id: string; isFavorite: boolean }>> {
  await requireUser();
  // No refresh: the button updates optimistically, and an unstarred row stays
  // put in the Favorites view until the next navigation (design doc Screen 1).
  return toActionResult(
    () => setExerciseFavorite({ exerciseId, isFavorite }),
    "Couldn't update favorites. Try again.",
  );
}

export type CustomExerciseFormState = {
  result: ActionResult<{ id: string }> | null;
  values: {
    name: string;
    primaryMuscle: string;
    equipmentType: string;
    secondaryMuscles: string[];
  };
};

export async function createCustomExerciseAction(
  _prev: CustomExerciseFormState,
  formData: FormData,
): Promise<CustomExerciseFormState> {
  await requireUser();
  const raw = customExerciseInputFromFormData(formData);
  const result = await toActionResult(
    async () => ({ id: (await createCustomExercise(raw)).id }),
    "Couldn't add the exercise. Your entries are still here.",
  );
  if (result.ok) {
    redirect(`/exercises/${result.data.id}?created=1`);
  }
  return {
    result,
    values: {
      name: String(raw.name ?? ""),
      primaryMuscle: String(raw.primaryMuscle ?? ""),
      equipmentType: String(raw.equipmentType ?? ""),
      secondaryMuscles: (raw.secondaryMuscles as FormDataEntryValue[]).map(
        String,
      ),
    },
  };
}

export async function archiveExerciseAction(
  exerciseId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => archiveExercise({ exerciseId }),
    "Couldn't archive. Nothing changed.",
  );
  if (result.ok) refresh();
  return result;
}

export async function restoreExerciseAction(
  exerciseId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const result = await toActionResult(
    () => restoreExercise({ exerciseId }),
    "Couldn't restore. Try again.",
  );
  if (result.ok) refresh();
  return result;
}
