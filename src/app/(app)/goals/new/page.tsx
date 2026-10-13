import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryControls } from "@/components/exercises/library-controls";
import { GoalExercisePicker } from "@/components/goals/goal-exercise-picker";
import { BackLink } from "@/components/plan/plan-bits";
import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import {
  LIBRARY_MAX_LIMIT,
  LIBRARY_PAGE_SIZE,
  libraryQueryString,
  parseLibraryParams,
  type LibraryFilters,
} from "@/lib/exercises/library-params";
import { listExercises, type ExerciseList } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/exercises/taxonomy";
import { activeGoalExerciseMap } from "@/lib/goals/queries";

export const metadata = { title: "New goal · Overload" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BASE = "/goals/new";

/**
 * New goal — pick the lift (design Screen 2). The Exercise Library's own
 * filters and query (active exercises only — archived ones are never listed,
 * R5), pointed at the goal form.
 */
export default async function NewGoalPickerPage({ searchParams }: PageProps) {
  const filters = parseLibraryParams(await searchParams);
  // Reconcile first (request time only) so a goal history has already met is
  // never presented as the "active goal" blocking a new one (R54).
  await connection();
  await reconcileGoalCompletionsSafely();
  const [list, activeGoals] = await Promise.all([
    listExercises(filters),
    activeGoalExerciseMap(),
  ]);
  const href = (f: Partial<LibraryFilters>) =>
    `${BASE}${libraryQueryString(f)}`;

  return (
    <section className="space-y-4 pb-6">
      <div className="space-y-1">
        <BackLink href="/goals" label="Goals" />
        <h1 className="text-lg font-semibold">New goal</h1>
        <p className="text-sm text-muted-foreground">Pick the lift.</p>
      </div>

      <LibraryControls filters={filters} basePath={BASE}>
        <Results
          list={list}
          filters={filters}
          href={href}
          activeGoals={activeGoals}
        />
      </LibraryControls>
    </section>
  );
}

function Results({
  list,
  filters,
  href,
  activeGoals,
}: {
  list: ExerciseList;
  filters: LibraryFilters;
  href: (f: Partial<LibraryFilters>) => string;
  activeGoals: Map<string, string>;
}) {
  const muscleLabel = filters.muscle
    ? MUSCLE_GROUP_LABELS[filters.muscle]
    : null;
  const search = filters.search.trim();

  if (list.items.length === 0) {
    return <PickerEmpty list={list} filters={filters} href={href} />;
  }

  return (
    <div className="space-y-3">
      {(muscleLabel || search) && (
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
            <Link href={href({ view: filters.view })}>Clear</Link>
          </Button>
        </p>
      )}
      <GoalExercisePicker
        items={list.items}
        activeGoalByExercise={activeGoals}
      />
      {list.total > list.items.length && list.limit >= LIBRARY_MAX_LIMIT && (
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          Showing the first {LIBRARY_MAX_LIMIT}. Search or pick a muscle to
          narrow the list.
        </p>
      )}
      {list.total > list.items.length && list.limit < LIBRARY_MAX_LIMIT && (
        <div className="flex justify-center">
          <Button asChild variant="outline" className="h-11">
            <Link
              href={href({
                ...filters,
                limit: Math.min(
                  list.limit + LIBRARY_PAGE_SIZE,
                  LIBRARY_MAX_LIMIT,
                ),
              })}
              scroll={false}
            >
              Show {Math.min(LIBRARY_PAGE_SIZE, list.total - list.items.length)}{" "}
              more
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function PickerEmpty({
  list,
  filters,
  href,
}: {
  list: ExerciseList;
  filters: LibraryFilters;
  href: (f: Partial<LibraryFilters>) => string;
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
        title="No favorites yet. Star exercises in the library to keep them here."
        action={
          <Button asChild variant="outline">
            <Link href={href({ ...filters, view: "all" })}>
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
            <Link href={href({ ...filters, view: "all" })}>
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
          <Link href={href({})}>Clear filters</Link>
        </Button>
      }
    />
  );
}
