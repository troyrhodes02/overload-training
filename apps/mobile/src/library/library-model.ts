import type { ExerciseList } from "@overload/shared/contracts/exercises";
import {
  LIBRARY_MAX_LIMIT,
  LIBRARY_PAGE_SIZE,
  type LibraryFilters,
} from "../api/resources";

/**
 * L1 Library's words (Pitch 21h design §6 L1). Pure. The empty states are
 * the web library's own sentences, chosen from the server's answer.
 */

/** "873 exercises" or "Showing 50 of 873". */
export function countLine(list: ExerciseList): string {
  if (list.total === 0) return "";
  if (list.items.length >= list.total) {
    return `${list.total} ${list.total === 1 ? "exercise" : "exercises"}`;
  }
  return `Showing ${list.items.length} of ${list.total}`;
}

export type LibraryEmpty =
  | { kind: "catalog"; title: string }
  | { kind: "no_favorites"; title: string }
  | { kind: "favorites_filtered"; title: string }
  | { kind: "no_match"; title: string; addName: string | null };

/** Which empty state a successful, empty answer is (null: not empty). */
export function emptyStateFor(
  list: ExerciseList,
  filters: LibraryFilters,
): LibraryEmpty | null {
  if (list.items.length > 0) return null;
  if (!list.hasAnyActive) {
    return {
      kind: "catalog",
      title: "The exercise library isn't available yet.",
    };
  }
  if (filters.view === "favorites" && !list.hasAnyFavorites) {
    return {
      kind: "no_favorites",
      title: "No favorites yet. Star exercises you use to keep them here.",
    };
  }
  if (filters.view === "favorites") {
    return {
      kind: "favorites_filtered",
      title: "None of your favorites match these filters.",
    };
  }
  const q = filters.q.trim();
  return {
    kind: "no_match",
    title: q
      ? `No exercises match “${q}”.`
      : "No exercises match these filters.",
    addName: q || null,
  };
}

/** The next page's limit, or null when everything is shown. */
export function nextLimit(list: ExerciseList, current: number): number | null {
  if (list.items.length >= list.total) return null;
  const next = Math.min(current + LIBRARY_PAGE_SIZE, LIBRARY_MAX_LIMIT);
  return next > current ? next : null;
}

/** "Chest · Barbell". */
export function classificationLine(e: {
  primaryMuscleLabel: string;
  equipmentLabel: string;
}): string {
  return `${e.primaryMuscleLabel} · ${e.equipmentLabel}`;
}
