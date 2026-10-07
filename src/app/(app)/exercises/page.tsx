import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import { FavoriteButton } from "@/components/exercises/favorite-button";
import { LibraryControls } from "@/components/exercises/library-controls";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  LIBRARY_MAX_LIMIT,
  LIBRARY_PAGE_SIZE,
  libraryQueryString,
  parseLibraryParams,
  type LibraryFilters,
} from "@/lib/exercises/library-params";
import { listExercises, type ExerciseList } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/exercises/taxonomy";

export const metadata = { title: "Exercises · Overload" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExerciseLibraryPage({ searchParams }: PageProps) {
  const filters = parseLibraryParams(await searchParams);
  const list = await listExercises(filters);
  const query = libraryQueryString(filters);

  return (
    <section className="space-y-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Exercises</h1>
        <Button asChild variant="outline" className="hidden md:inline-flex">
          <Link href="/exercises/new">
            <Plus aria-hidden />
            Add custom exercise
          </Link>
        </Button>
      </div>

      <LibraryControls filters={filters}>
        <Results list={list} filters={filters} query={query} />
      </LibraryControls>

      {/* Thumb-reach primary action on phones, above the bottom nav. */}
      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Button asChild className="h-11 w-full">
          <Link href="/exercises/new">
            <Plus aria-hidden />
            Add custom exercise
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Results({
  list,
  filters,
  query,
}: {
  list: ExerciseList;
  filters: LibraryFilters;
  query: string;
}) {
  const muscleLabel = filters.muscle
    ? MUSCLE_GROUP_LABELS[filters.muscle]
    : null;
  const search = filters.search.trim();
  const hasFilters = Boolean(muscleLabel || search);

  return (
    <div className="space-y-3">
      {hasFilters && list.hasAnyActive && (
        <p
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground tabular-nums"
        >
          <span>
            {list.total} {list.total === 1 ? "exercise" : "exercises"}
            {muscleLabel && ` · ${muscleLabel}`}
            {search && ` · “${search}”`}
          </span>
          <Button asChild variant="link" size="sm" className="h-auto px-1">
            {/* Clear resets muscle and search but keeps the scope. */}
            <Link
              href={`/exercises${libraryQueryString({ view: filters.view })}`}
            >
              Clear
            </Link>
          </Button>
        </p>
      )}

      {list.items.length > 0 ? (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {list.items.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                <Link
                  href={`/exercises/${e.id}${query ? `?from=${encodeURIComponent(query)}` : ""}`}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ExerciseThumb name={e.name} imageUrl={e.imageUrl} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{e.name}</span>
                      {e.isCustom && (
                        <Badge variant="outline" className="shrink-0">
                          Custom
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.primaryMuscleLabel} · {e.equipmentLabel}
                    </p>
                  </div>
                </Link>
                <FavoriteButton
                  // Remount when the server value changes (e.g. starred on another screen).
                  key={`${e.id}:${e.isFavorite}`}
                  exerciseId={e.id}
                  name={e.name}
                  isFavorite={e.isFavorite}
                />
              </li>
            ))}
          </ul>
          {list.total > list.items.length &&
            list.limit >= LIBRARY_MAX_LIMIT && (
              <p className="text-center text-xs text-muted-foreground tabular-nums">
                Showing the first {LIBRARY_MAX_LIMIT}. Search or pick a muscle
                to narrow the list.
              </p>
            )}
          {list.total > list.items.length && list.limit < LIBRARY_MAX_LIMIT && (
            <div className="flex justify-center">
              <Button asChild variant="outline" className="h-11">
                <Link
                  href={`/exercises${libraryQueryString({ ...filters, limit: Math.min(list.limit + LIBRARY_PAGE_SIZE, LIBRARY_MAX_LIMIT) })}`}
                  scroll={false}
                >
                  Show{" "}
                  {Math.min(LIBRARY_PAGE_SIZE, list.total - list.items.length)}{" "}
                  more
                </Link>
              </Button>
            </div>
          )}
        </>
      ) : (
        <LibraryEmpty list={list} filters={filters} />
      )}
    </div>
  );
}

function LibraryEmpty({
  list,
  filters,
}: {
  list: ExerciseList;
  filters: LibraryFilters;
}) {
  const search = filters.search.trim();
  const muscleLabel = filters.muscle
    ? MUSCLE_GROUP_LABELS[filters.muscle]
    : null;

  if (!list.hasAnyActive) {
    return (
      <EmptyState
        title="The exercise catalog hasn't been imported yet."
        description="You can still add your own."
        action={
          <Button asChild variant="outline">
            <Link href="/exercises/new">Add custom exercise</Link>
          </Button>
        }
      />
    );
  }

  if (filters.view === "favorites" && !list.hasAnyFavorites) {
    return (
      <EmptyState
        title="No favorites yet. Star exercises you use to keep them here."
        action={
          <Button asChild variant="outline">
            <Link
              href={`/exercises${libraryQueryString({ ...filters, view: "all" })}`}
            >
              Browse all exercises
            </Link>
          </Button>
        }
      />
    );
  }

  if (filters.view === "favorites") {
    return (
      <EmptyState
        title="None of your favorites match these filters."
        action={
          <Button asChild variant="outline">
            <Link
              href={`/exercises${libraryQueryString({ ...filters, view: "all" })}`}
            >
              Search all exercises
            </Link>
          </Button>
        }
      />
    );
  }

  if (search) {
    return (
      <EmptyState
        title={`No exercise matches “${search}”.`}
        action={
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-10 whitespace-normal"
          >
            <Link href={`/exercises/new?name=${encodeURIComponent(search)}`}>
              Add “{search}” as a custom exercise
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      title={`No ${muscleLabel ?? ""} exercises in all exercises.`}
      action={
        <Button asChild variant="outline">
          <Link href="/exercises">Clear filters</Link>
        </Button>
      }
    />
  );
}
