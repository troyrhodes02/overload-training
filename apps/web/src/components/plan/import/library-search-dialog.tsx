"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ExerciseThumb } from "@/components/exercises/exercise-thumb";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
} from "@overload/shared/exercises/taxonomy";
import type { ExerciseListItemDto } from "@/lib/exercises/queries";
import { searchImportLibraryAction } from "@/app/(app)/plan/import/actions";

/**
 * Workout Plan Import & Review (Pitch 22) — "Search library": a dialog to pick
 * any exercise from the lifter's library (shared + their own customs) for an
 * imported row, instead of only the offered suggestions. Search by name, narrow
 * by muscle, scroll, and load more. Choosing a row hands its id to `onPick`; the
 * server re-checks the id against the account's library before using it.
 */

const PAGE = 50;
const DEBOUNCE_MS = 250;

export function LibrarySearchDialog({
  open,
  onOpenChange,
  importedName,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The name as written in the plan, shown for reference. */
  importedName: string | null;
  onPick: (exercise: ExerciseListItemDto) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [muscle, setMuscle] = React.useState<string>("");
  const [limit, setLimit] = React.useState(PAGE);
  const [items, setItems] = React.useState<ExerciseListItemDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  // Loading is derived: the query on screen differs from the one last answered.
  const [answered, setAnswered] = React.useState<string | null>(null);
  const query = `${search}\u0000${muscle}\u0000${limit}`;
  const loading = open && answered !== query;
  const request = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const id = ++request.current;
    const timer = setTimeout(async () => {
      const res = await searchImportLibraryAction({
        search,
        muscle: muscle || null,
        limit,
      });
      // Only the latest request may update the list.
      if (id !== request.current) return;
      setAnswered(query);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setError(null);
      setItems(res.data.items);
      setTotal(res.data.total);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, search, muscle, limit, query]);

  function reset() {
    setAnswered(null);
    setSearch("");
    setMuscle("");
    setLimit(PAGE);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Search your library</DialogTitle>
          <DialogDescription>
            {importedName ? (
              <>Pick the exercise for &ldquo;{importedName}&rdquo;.</>
            ) : (
              "Pick an exercise from your library."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              autoFocus
              aria-label="Search exercises"
              placeholder="Search exercises"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(PAGE);
              }}
              className="pl-9"
            />
          </div>
          <NativeSelect
            aria-label="Muscle group"
            value={muscle}
            onChange={(e) => {
              setMuscle(e.target.value);
              setLimit(PAGE);
            }}
            className="sm:w-40"
          >
            <option value="">All muscles</option>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {MUSCLE_GROUP_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div
          className="-mx-6 min-h-48 flex-1 overflow-y-auto border-y border-border"
          aria-busy={loading}
        >
          {error ? (
            <p role="alert" className="px-6 py-8 text-center text-sm">
              {error}
            </p>
          ) : items.length === 0 && !loading ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No exercises match. Try fewer words, or create a custom exercise
              instead.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(e);
                      reset();
                    }}
                    className="flex min-h-14 w-full items-center gap-3 px-6 py-1.5 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <ExerciseThumb name={e.name} imageUrl={e.imageUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{e.name}</span>
                        {e.isCustom && (
                          <Badge variant="outline" className="shrink-0">
                            Custom
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {e.primaryMuscleLabel} · {e.equipmentLabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length < total && !error && (
            <div className="px-6 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={loading}
                onClick={() => setLimit((n) => n + PAGE)}
              >
                Show more
              </Button>
            </div>
          )}
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          {loading && (
            <Loader2
              aria-hidden
              className="size-3 animate-spin motion-reduce:animate-none"
            />
          )}
          {loading && items.length === 0
            ? "Loading…"
            : `Showing ${items.length} of ${total}`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
