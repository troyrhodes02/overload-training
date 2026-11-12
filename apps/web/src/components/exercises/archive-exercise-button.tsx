"use client";

import { useRouter } from "next/navigation";
import {
  archiveExerciseAction,
  restoreExerciseAction,
} from "@/app/(app)/exercises/actions";
import { ArchiveDialog } from "@/components/archive/archive-dialog";
import { Button } from "@/components/ui/button";

export function ArchiveExerciseButton({
  exerciseId,
  name,
  backHref,
}: {
  exerciseId: string;
  name: string;
  backHref: string;
}) {
  const router = useRouter();
  return (
    <ArchiveDialog
      name={name}
      body="It won't appear in the library or in new plans. Past workouts keep it."
      archive={() => archiveExerciseAction(exerciseId)}
      restore={() => restoreExerciseAction(exerciseId)}
      onArchived={() => router.push(backHref)}
      trigger={
        <Button variant="outline" className="h-11 w-full sm:w-auto">
          Archive exercise
        </Button>
      }
    />
  );
}
