import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ArchiveExerciseButton } from "@/components/exercises/archive-exercise-button";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import { FavoriteButton } from "@/components/exercises/favorite-button";
import { CreatedToast } from "@/components/feedback/created-toast";
import {
  libraryQueryString,
  parseLibraryParams,
} from "@/lib/exercises/library-params";
import { getExercise } from "@/lib/exercises/queries";

export const metadata = { title: "Exercise · Overload" };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Rebuild the library URL the lifter came from, from known params only (no open redirect). */
function backHref(from: string | string[] | undefined): string {
  const raw = Array.isArray(from) ? from[0] : from;
  if (!raw) return "/exercises";
  const params = Object.fromEntries(
    new URLSearchParams(raw.replace(/^\?/, "")),
  );
  return `/exercises${libraryQueryString(parseLibraryParams(params))}`;
}

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // Resolves archived exercises too: history and direct links must still work.
  const exercise = await getExercise(id);
  if (!exercise) notFound();
  const back = backHref(sp.from);

  return (
    <section className="space-y-6">
      <CreatedToast show={sp.created === "1"} message="Exercise added" />
      <Link
        href={back}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Exercises
      </Link>

      <div className="space-y-6 md:grid md:grid-cols-[minmax(0,18rem)_1fr] md:gap-8 md:space-y-0">
        <ExerciseThumb
          name={exercise.name}
          imageUrl={exercise.imageUrl}
          size="lg"
        />

        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h1
                className={
                  exercise.isArchived
                    ? "text-xl font-semibold text-muted-foreground"
                    : "text-xl font-semibold"
                }
              >
                {exercise.name}
              </h1>
              <div className="flex gap-2">
                {exercise.isCustom && <Badge variant="outline">Custom</Badge>}
                {exercise.isArchived && (
                  <Badge variant="secondary">Archived</Badge>
                )}
              </div>
            </div>
            {!exercise.isArchived && (
              <FavoriteButton
                // Remount when the server value changes (e.g. starred on another screen).
                key={`${exercise.id}:${exercise.isFavorite}`}
                exerciseId={exercise.id}
                name={exercise.name}
                isFavorite={exercise.isFavorite}
              />
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Primary</dt>
            <dd>{exercise.primaryMuscleLabel}</dd>
            {exercise.secondaryMuscleLabels.length > 0 && (
              <>
                <dt className="text-muted-foreground">Also trains</dt>
                <dd>{exercise.secondaryMuscleLabels.join(", ")}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Equipment</dt>
            <dd>{exercise.equipmentLabel}</dd>
          </dl>

          {!exercise.isArchived && (
            <ArchiveExerciseButton
              exerciseId={exercise.id}
              name={exercise.name}
              backHref={back}
            />
          )}
        </div>
      </div>
    </section>
  );
}
