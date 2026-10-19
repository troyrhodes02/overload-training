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
import { getExerciseProgression } from "@/lib/progression/queries";
import { ProgressTag } from "@/components/progression/progress-tag";
import { SuggestedLoad } from "@/components/progression/suggested-load";
import { GymSelector } from "@/components/progression/gym-selector";
import { E1rmChart } from "@/components/progression/e1rm-chart";
import { requireAccount } from "@/lib/data/account";

/**
 * Per-exercise progression + e1RM trend (Pitch 5, design Screen 4). Derived on
 * read; nothing stored. Gym-variable exercises are scoped to one gym with a
 * selector when more than one gym has history (R13); gym-consistent ones show a
 * single global series. Archived exercises still render their trend.
 */
async function ProgressionSection({
  exerciseId,
  gymId,
}: {
  exerciseId: string;
  gymId?: string;
}) {
  const account = await requireAccount();
  const dto = await getExerciseProgression(account, exerciseId, gymId);
  if (!dto) return null;

  const scope = dto.isGymVariable ? dto.selectedGymName : null;
  const chartLabel = `e1RM trend for ${dto.exerciseName}${scope ? `, ${scope}` : ""}`;

  return (
    <section aria-labelledby="progression-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="progression-heading" className="text-base font-medium">
          Progression
        </h2>
        {dto.isGymVariable && dto.gyms.length > 1 && dto.selectedGymId ? (
          <GymSelector gyms={dto.gyms} value={dto.selectedGymId} />
        ) : null}
      </div>

      {dto.state === "insufficient" ? (
        <p className="text-sm text-muted-foreground">
          Not enough history yet
          {scope ? ` at ${scope}` : ""}.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {dto.tag ? (
            <ProgressTag state={dto.tag} />
          ) : (
            <span className="text-sm text-muted-foreground">Holding</span>
          )}
          {dto.tag === "progress" && dto.suggestion ? (
            <span>
              Suggested next: <SuggestedLoad suggestion={dto.suggestion} />
            </span>
          ) : null}
        </div>
      )}

      {!dto.requiresExternalWeight ? (
        // Bodyweight: no external load, so no e1RM — never a fabricated point.
        <div className="space-y-1">
          <p className="text-sm font-medium">e1RM trend</p>
          <p className="text-sm text-muted-foreground">
            e1RM not available for bodyweight-only logging.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">
              e1RM trend
              {scope ? (
                <span className="text-muted-foreground"> · {scope}</span>
              ) : null}
            </p>
            {dto.currentE1rm != null ? (
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Current</div>
                <div className="text-lg font-semibold tabular-nums tracking-tight">
                  {dto.currentE1rm} lb
                </div>
              </div>
            ) : null}
          </div>
          <E1rmChart points={dto.points} label={chartLabel} />
          {dto.points.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {dto.points.length} session{dto.points.length === 1 ? "" : "s"}
              {scope ? ` at ${scope}` : ""} · Epley estimate
              {dto.points.some((p) => p.scheduledDeload)
                ? " · ▫ deload week"
                : ""}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

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
  const account = await requireAccount();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // Resolves archived exercises too: history and direct links must still work.
  const exercise = await getExercise(account, id);
  if (!exercise) notFound();
  const back = backHref(sp.from);
  const gymParam = Array.isArray(sp.gym) ? sp.gym[0] : sp.gym;

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

          {/* Library exercises are shared and read-only: only the account's
              own custom exercises can be archived (Multi-User Foundation). */}
          {exercise.canArchive && !exercise.isArchived && (
            <ArchiveExerciseButton
              exerciseId={exercise.id}
              name={exercise.name}
              backHref={back}
            />
          )}
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <ProgressionSection exerciseId={exercise.id} gymId={gymParam} />
      </div>
    </section>
  );
}
