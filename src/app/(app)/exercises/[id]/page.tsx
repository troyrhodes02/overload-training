import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ArchiveExerciseButton } from "@/components/exercises/archive-exercise-button";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import { FavoriteButton } from "@/components/exercises/favorite-button";
import { ExerciseGoals } from "@/components/exercises/history/exercise-goals";
import { ExerciseRecords } from "@/components/exercises/history/exercise-records";
import { ExerciseTrend } from "@/components/exercises/history/exercise-trend";
import { SessionHistoryList } from "@/components/exercises/history/session-history-list";
import { CreatedToast } from "@/components/feedback/created-toast";
import { GymSelector } from "@/components/progression/gym-selector";
import { ProgressTag } from "@/components/progression/progress-tag";
import { Recommendation } from "@/components/progression/recommendation";
import { requireAccount } from "@/lib/data/account";
import {
  libraryQueryString,
  parseLibraryParams,
} from "@/lib/exercises/library-params";
import { getExercise } from "@/lib/exercises/queries";
import { getExerciseGoals } from "@/lib/goals/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";

export const metadata = { title: "Exercise · Overload" };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/** Rebuild the library URL the lifter came from, from known params only (no open redirect). */
function backHref(from: string | string[] | undefined): string {
  const raw = first(from);
  if (!raw) return "/exercises";
  const params = Object.fromEntries(
    new URLSearchParams(raw.replace(/^\?/, "")),
  );
  return `/exercises${libraryQueryString(parseLibraryParams(params))}`;
}

/**
 * The exercise's history (Exercise History & PR Intelligence design doc §7,
 * Screens 1–6; preview §01–§08; spec §7.1): what to do next, the records, the
 * trend, every session with the call it led to, and the goals on the lift.
 * Everything is computed on this read from the logged sets — nothing is
 * stored and nothing here writes (the only actions are the existing favourite
 * and archive-custom-exercise controls). A machine or cable shows one gym's
 * book at a time (`?gym=`); `?sessions=all` lists every session.
 */
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
  const scopeParam = first(sp.gym) ?? null;
  const allSessions = first(sp.sessions) === "all";

  const [history, goals] = await Promise.all([
    getExerciseHistory(account, exercise.id, {
      scope: scopeParam,
      allSessions,
    }),
    getExerciseGoals(account, exercise.id),
  ]);
  if (!history) notFound();

  const selected = history.selectedScope;
  const scopeName = history.gymVariable && selected ? selected.label : null;
  const noGymScope = history.gymVariable && selected?.key === "none";

  // Links that keep the page's other params (gym, back-link context).
  const hrefWith = (sessions: "all" | null) => {
    const q = new URLSearchParams();
    for (const key of ["gym", "from"] as const) {
      const v = first(sp[key]);
      if (v) q.set(key, v);
    }
    if (sessions) q.set("sessions", sessions);
    const s = q.toString();
    return `/exercises/${exercise.id}${s ? `?${s}` : ""}`;
  };

  // "Set a goal" opens the existing form; a machine pre-selects the gym the
  // page shows when that gym is still active (R19).
  const newGoalHref = goals.newGoalEligible
    ? `/goals/new/${exercise.id}${
        history.gymVariable &&
        selected &&
        selected.key !== "none" &&
        !selected.archived
          ? `?gymId=${selected.key}`
          : ""
      }`
    : null;

  return (
    <section className="space-y-6 pb-8">
      <CreatedToast show={sp.created === "1"} message="Exercise added" />
      <Link
        href={back}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Exercises
      </Link>

      <div className="flex items-start gap-3">
        <ExerciseThumb
          name={exercise.name}
          imageUrl={exercise.imageUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h1
            className={
              exercise.isArchived
                ? "text-xl font-semibold text-muted-foreground"
                : "text-xl font-semibold"
            }
          >
            {exercise.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {exercise.primaryMuscleLabel} · {exercise.equipmentLabel}
          </p>
          {exercise.isCustom || exercise.isArchived ? (
            <div className="flex gap-2">
              {exercise.isCustom && <Badge variant="outline">Custom</Badge>}
              {exercise.isArchived && (
                <Badge variant="secondary">Archived</Badge>
              )}
            </div>
          ) : null}
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

      {history.gymVariable && selected ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">History at</span>
            {history.scopes.length > 1 ? (
              <GymSelector
                options={history.scopes.map((s) => ({
                  value: s.key,
                  label: s.label,
                }))}
                value={selected.key}
              />
            ) : (
              <span className="font-medium">{selected.label}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Machines differ between gyms, so each gym keeps its own records.
          </p>
        </div>
      ) : null}

      {/*
        One column at every width, in the lifter's order (spec R30): the
        app shell keeps every page in one centered column, so on desktop the
        chart gains height, not a second column.
      */}
      <div className="flex flex-col gap-8">
        {!history.hasHistory ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No sets logged yet. Log it in a workout and its sessions, records,
            and trend show up here.
          </div>
        ) : (
          <section aria-labelledby="next-heading" className="space-y-2">
            <h2 id="next-heading" className="text-base font-medium">
              Next time
            </h2>
            {history.next?.kind === "no_gym" ? (
              <p className="text-sm text-muted-foreground">
                Calls for machines are made per gym.
              </p>
            ) : history.next?.kind === "call" &&
              history.next.insufficientNote ? (
              <p className="text-sm text-muted-foreground">
                {history.next.insufficientNote}
              </p>
            ) : history.next?.kind === "call" ? (
              <div>
                {history.next.tag ? (
                  <ProgressTag state={history.next.tag} />
                ) : null}
                <Recommendation recommendation={history.next.recommendation} />
              </div>
            ) : null}
          </section>
        )}
        {history.records ? (
          <ExerciseRecords records={history.records} scopeName={scopeName} />
        ) : null}
        {history.hasHistory ? (
          <>
            <ExerciseTrend
              e1rm={history.trend.e1rm}
              weight={history.trend.weight}
              reps={history.trend.reps}
              scopeName={scopeName}
            />
            <SessionHistoryList
              rows={history.sessions.rows}
              total={history.sessions.total}
              showingAll={history.sessions.showingAll}
              externalLoad={history.externalLoad}
              noGymScope={noGymScope}
              viewAllHref={hrefWith("all")}
              recentOnlyHref={hrefWith(null)}
              scopeName={scopeName}
            />
          </>
        ) : null}
        <ExerciseGoals goals={goals} newGoalHref={newGoalHref} />
        <section aria-labelledby="about-heading" className="space-y-3">
          <h2 id="about-heading" className="text-base font-medium">
            About
          </h2>
          <ExerciseThumb
            name={exercise.name}
            imageUrl={exercise.imageUrl}
            size="lg"
          />
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
        </section>
      </div>
    </section>
  );
}
