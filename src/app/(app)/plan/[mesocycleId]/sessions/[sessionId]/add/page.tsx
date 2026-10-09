import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryControls } from "@/components/exercises/library-controls";
import { BackLink } from "@/components/plan/plan-bits";
import { PickerList, type ReplaceTarget } from "@/components/plan/picker-list";
import {
  LIBRARY_MAX_LIMIT,
  LIBRARY_PAGE_SIZE,
  libraryQueryString,
  parseLibraryParams,
  withExtraParams,
  type LibraryFilters,
} from "@/lib/exercises/library-params";
import { listExercises, type ExerciseList } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/exercises/taxonomy";
import { getSessionDetail } from "@/lib/plan/queries";

export const metadata = { title: "Add exercise · Overload" };

type PageProps = {
  params: Promise<{ mesocycleId: string; sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The exercise picker (spec D19, D57): the Exercise Library's own filters and
 * query, pointed at a session. Archived exercises are never listed (the
 * library query filters them), and exercises already in the session can't be
 * chosen again. `?replace=<slot>` swaps an existing slot's exercise.
 */
export default async function PickerPage({ params, searchParams }: PageProps) {
  const [{ mesocycleId, sessionId }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  const session = await getSessionDetail(mesocycleId, sessionId);
  if (!session) notFound();
  const sessionHref = `/plan/${mesocycleId}/sessions/${sessionId}`;
  if (session.mesocycle.status === "archived") redirect(sessionHref);

  const replaceId = first(sp.replace);
  const slot = session.exercises.find((e) => e.id === replaceId);
  // A replace link whose slot is gone (removed in another tab, or Back after a
  // removal) must not quietly turn into "add": say so instead.
  if (replaceId && !slot) {
    return (
      <section className="space-y-4">
        <BackLink href={sessionHref} label={session.name} />
        <EmptyState
          title="That exercise isn't in this session anymore."
          description="Nothing was changed."
          action={
            <Button asChild variant="outline">
              <Link href={sessionHref}>Back to {session.name}</Link>
            </Button>
          }
        />
      </section>
    );
  }
  const replace: ReplaceTarget | null = slot
    ? {
        id: slot.id,
        exerciseName: slot.exerciseName,
        prescription:
          slot.targetRepMin === slot.targetRepMax
            ? `${slot.plannedSets} × ${slot.targetRepMin}`
            : `${slot.plannedSets} × ${slot.targetRepMin}–${slot.targetRepMax}`,
      }
    : null;
  const extraParams = replace ? { replace: replace.id } : undefined;
  const basePath = `${sessionHref}/add`;
  const filters = parseLibraryParams(sp);
  const list = await listExercises(filters);
  const href = (f: Partial<LibraryFilters>) =>
    `${basePath}${withExtraParams(libraryQueryString(f), extraParams)}`;

  return (
    <section className="space-y-4 pb-6">
      <div className="space-y-1">
        <BackLink href={sessionHref} label={session.name} />
        <h1 className="text-lg font-semibold">
          {replace
            ? `Replace ${replace.exerciseName}`
            : `Add to ${session.name}`}
        </h1>
        {replace && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Sets and reps stay {replace.prescription}.
          </p>
        )}
      </div>

      <LibraryControls
        filters={filters}
        basePath={basePath}
        extraParams={extraParams}
      >
        <Results
          list={list}
          filters={filters}
          href={href}
          mesocycleId={mesocycleId}
          sessionId={sessionId}
          inSessionIds={session.exercises.map((e) => e.exerciseId)}
          replace={replace}
        />
      </LibraryControls>
    </section>
  );
}

function Results({
  list,
  filters,
  href,
  mesocycleId,
  sessionId,
  inSessionIds,
  replace,
}: {
  list: ExerciseList;
  filters: LibraryFilters;
  href: (f: Partial<LibraryFilters>) => string;
  mesocycleId: string;
  sessionId: string;
  inSessionIds: string[];
  replace: ReplaceTarget | null;
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
      <PickerList
        mesocycleId={mesocycleId}
        sessionId={sessionId}
        items={list.items}
        inSessionIds={inSessionIds}
        replace={replace}
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
