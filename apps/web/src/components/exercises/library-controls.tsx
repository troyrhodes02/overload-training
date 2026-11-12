"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  libraryQueryString,
  withExtraParams,
  type LibraryFilters,
  type LibraryView,
} from "@/lib/exercises/library-params";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  isMuscleGroup,
} from "@/lib/exercises/taxonomy";
import { cn } from "@/lib/utils";

const ANY_MUSCLE = "any";
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The library's three independent narrowings — name search, All/Favorites,
 * and PRIMARY muscle — written to the URL so the server renders the list.
 * Changing one never resets the others. The server-rendered results are passed
 * as children so they can dim while a new combination loads.
 *
 * Reused by the session builder's exercise picker (Split & Mesocycle Builder,
 * spec D57) with a different `basePath` and extra params (e.g. `replace`),
 * so both screens share one set of filter rules.
 */
export function LibraryControls({
  filters,
  children,
  basePath = "/exercises",
  extraParams,
}: {
  filters: Pick<LibraryFilters, "view" | "muscle" | "search">;
  children: ReactNode;
  basePath?: string;
  /** Kept on every navigation (never a filter). */
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search);
  // The search we last wrote to the URL, and the URL value we last rendered.
  const [lastNavigated, setLastNavigated] = useState(filters.search);
  const [renderedSearch, setRenderedSearch] = useState(filters.search);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest URL filters and typed text, for the debounced navigation (a
  // timer must never act on the filters that were current when it was set).
  const latest = useRef({ filters, search });
  useEffect(() => {
    latest.current = { filters, search };
  });

  // Sync the box when the URL changes from ELSEWHERE (back/forward, Clear, an
  // empty-state link) — but never clobber what the lifter is still typing when
  // our own debounced navigation lands.
  if (filters.search !== renderedSearch) {
    setRenderedSearch(filters.search);
    if (filters.search !== lastNavigated) {
      setSearch(filters.search);
      setLastNavigated(filters.search);
    }
  }

  function navigate(
    next: Partial<Pick<LibraryFilters, "view" | "muscle" | "search">>,
    mode: "push" | "replace",
  ) {
    // Any navigation supersedes a pending debounced search.
    if (timer.current) clearTimeout(timer.current);
    const current = latest.current;
    // Only scope, muscle, and search carry over; a new combination starts
    // again at the first page (the expanded "Show more" limit does not stick).
    const merged = {
      view: current.filters.view,
      muscle: current.filters.muscle,
      search: current.search,
      ...next,
    };
    // The URL carries the trimmed search; compare like with like.
    setLastNavigated(merged.search.trim());
    const href = `${basePath}${withExtraParams(libraryQueryString(merged), extraParams)}`;
    startTransition(() => {
      if (mode === "push") router.push(href);
      else router.replace(href);
    });
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    // Reads the latest filters and text when it fires (see `latest`).
    timer.current = setTimeout(
      () => navigate({}, "replace"),
      SEARCH_DEBOUNCE_MS,
    );
  }

  function applySearchNow(value: string) {
    navigate({ search: value }, "replace");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search exercises"
            placeholder="Search exercises"
            className="h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySearchNow(search);
              } else if (e.key === "Escape" && search) {
                e.preventDefault();
                onSearchChange("");
                applySearchNow("");
              }
            }}
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              className="absolute top-1/2 right-0.5 size-10 -translate-y-1/2"
              onClick={() => {
                setSearch("");
                applySearchNow("");
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={filters.view}
            onValueChange={(value) =>
              navigate({ view: value as LibraryView }, "push")
            }
          >
            <TabsList aria-label="Library scope" className="h-10">
              <TabsTrigger value="all" className="px-4">
                All
              </TabsTrigger>
              <TabsTrigger value="favorites" className="px-4">
                Favorites
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={filters.muscle ?? ANY_MUSCLE}
            onValueChange={(value) =>
              navigate({ muscle: isMuscleGroup(value) ? value : null }, "push")
            }
          >
            <SelectTrigger
              aria-label="Primary muscle"
              className="h-10 min-w-40"
            >
              <span className="text-muted-foreground">Muscle:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_MUSCLE}>Any</SelectItem>
              {MUSCLE_GROUPS.map((m) => (
                <SelectItem key={m} value={m}>
                  {MUSCLE_GROUP_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        aria-busy={isPending}
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        {children}
      </div>
    </div>
  );
}
