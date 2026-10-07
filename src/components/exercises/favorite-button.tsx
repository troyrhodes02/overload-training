"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { setExerciseFavoriteAction } from "@/app/(app)/exercises/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The manual favorite toggle — the ONLY way an exercise becomes a favorite.
 * Optimistic: the star changes immediately and reverts (with an error toast)
 * if the save fails. Unstarring in the Favorites view leaves the row in place
 * until the next navigation, so nothing jumps under the thumb.
 */
export function FavoriteButton({
  exerciseId,
  name,
  isFavorite,
}: {
  exerciseId: string;
  name: string;
  isFavorite: boolean;
}) {
  const [saved, setSaved] = useState(isFavorite);
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setExerciseFavoriteAction(exerciseId, next);
      if (result.ok) {
        setSaved(next);
      } else {
        toast.error(result.error.message, { duration: Infinity });
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 shrink-0"
      aria-pressed={optimistic}
      aria-label={
        optimistic
          ? `Remove ${name} from favorites`
          : `Add ${name} to favorites`
      }
      onClick={toggle}
    >
      <Star
        aria-hidden
        className={cn(
          "size-5",
          optimistic ? "fill-primary text-primary" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
