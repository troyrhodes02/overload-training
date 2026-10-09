/**
 * The Exercise Library's filter state, carried in the URL (spec D2/D31/D32):
 * scope (All / Favorites) × primary muscle × name search, plus a page limit.
 * Pure — used by the server page to query and by the client controls to
 * build URLs, so both always agree.
 */
import { isMuscleGroup, type MuscleGroupValue } from "./taxonomy";

export type LibraryView = "all" | "favorites";

export type LibraryFilters = {
  view: LibraryView;
  /** Primary muscle only. Secondary muscles never participate in filtering. */
  muscle: MuscleGroupValue | null;
  search: string;
  limit: number;
};

export const LIBRARY_PAGE_SIZE = 50;
export const LIBRARY_MAX_LIMIT = 1000;
const MAX_SEARCH_LENGTH = 200;
const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Tolerant: unknown or malformed values fall back to defaults. */
export function parseLibraryParams(params: SearchParams): LibraryFilters {
  const view = first(params.view) === "favorites" ? "favorites" : "all";
  const muscleRaw = first(params.muscle);
  const muscle = isMuscleGroup(muscleRaw) ? muscleRaw : null;
  const search = (first(params.q) ?? "").slice(0, MAX_SEARCH_LENGTH);
  const limitRaw = Number.parseInt(first(params.limit) ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, LIBRARY_PAGE_SIZE), LIBRARY_MAX_LIMIT)
    : LIBRARY_PAGE_SIZE;
  return { view, muscle, search, limit };
}

/** Every whitespace-separated word must appear in the name (any order, case-insensitive). */
export function searchTokens(search: string): string[] {
  return search
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, MAX_TOKENS)
    .map((t) => t.slice(0, MAX_TOKEN_LENGTH));
}

/** Serializes filters back to a query string, omitting defaults. */
export function libraryQueryString(filters: Partial<LibraryFilters>): string {
  const params = new URLSearchParams();
  if (filters.view === "favorites") params.set("view", "favorites");
  if (filters.muscle) params.set("muscle", filters.muscle);
  const q = filters.search?.trim();
  if (q) params.set("q", q);
  if (filters.limit && filters.limit > LIBRARY_PAGE_SIZE)
    params.set("limit", String(filters.limit));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Appends params that ride along with the filters but are not filters (e.g.
 * the session picker's `replace`). Takes and returns "" or "?…".
 */
export function withExtraParams(
  query: string,
  extra?: Record<string, string>,
): string {
  if (!extra || Object.keys(extra).length === 0) return query;
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `?${params.toString()}`;
}
