import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/actions/result";
import { exerciseImageUrl } from "./images";
import {
  LIBRARY_PAGE_SIZE,
  searchTokens,
  type LibraryFilters,
} from "./library-params";
import {
  equipmentLabel,
  muscleGroupLabel,
  type EquipmentValue,
  type MuscleGroupValue,
} from "./taxonomy";

/**
 * Exercise reads for the library (spec "Reads"). Every SELECTION query filters
 * `deletedAt: null`; `getExercise` deliberately does not, because history and
 * direct links must still resolve an archived exercise (CLAUDE.md Layer 1).
 * Data comes from Overload's own tables only — never the source dataset.
 */

export type ExerciseListItemDto = {
  id: string;
  name: string;
  primaryMuscle: MuscleGroupValue;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isCustom: boolean;
  isFavorite: boolean;
  imageUrl: string | null;
};

export type ExerciseDetailDto = ExerciseListItemDto & {
  equipmentType: EquipmentValue;
  secondaryMuscleLabels: string[];
  isArchived: boolean;
};

export type ExerciseList = {
  items: ExerciseListItemDto[];
  total: number;
  limit: number;
  /** Any active exercise exists at all (distinguishes "catalog not imported"). */
  hasAnyActive: boolean;
  /** Any active favorite exists at all (distinguishes "no favorites yet"). */
  hasAnyFavorites: boolean;
};

const listSelect = {
  id: true,
  name: true,
  primaryMuscle: true,
  equipmentType: true,
  isCustom: true,
  isFavorite: true,
  imageRef: true,
} satisfies Prisma.ExerciseSelect;

type ListRow = Prisma.ExerciseGetPayload<{ select: typeof listSelect }>;

function toListItem(row: ListRow): ExerciseListItemDto {
  return {
    id: row.id,
    name: row.name,
    primaryMuscle: row.primaryMuscle,
    primaryMuscleLabel: muscleGroupLabel(row.primaryMuscle),
    equipmentLabel: equipmentLabel(row.equipmentType),
    isCustom: row.isCustom,
    isFavorite: row.isFavorite,
    imageUrl: row.isCustom ? null : exerciseImageUrl(row.imageRef),
  };
}

/**
 * Prisma passes `contains` straight into LIKE without escaping, so a search
 * for "%" or "_" would act as a wildcard. Escape LIKE metacharacters (Postgres
 * uses backslash as the default LIKE escape) so search text is literal.
 */
function escapeLike(token: string): string {
  return token.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** The composable library filter: active ∧ scope ∧ primary muscle ∧ every search word. */
export function libraryWhere(
  filters: Pick<LibraryFilters, "view" | "muscle" | "search">,
): Prisma.ExerciseWhereInput {
  return {
    deletedAt: null,
    ...(filters.view === "favorites" ? { isFavorite: true } : {}),
    // Primary muscle ONLY: secondaryMuscles is never consulted here.
    ...(filters.muscle ? { primaryMuscle: filters.muscle } : {}),
    AND: searchTokens(filters.search).map((token) => ({
      name: { contains: escapeLike(token), mode: "insensitive" as const },
    })),
  };
}

export async function listExercises(
  filters: Partial<LibraryFilters> = {},
): Promise<ExerciseList> {
  const resolved = {
    view: filters.view ?? "all",
    muscle: filters.muscle ?? null,
    search: filters.search ?? "",
  } as const;
  const limit = filters.limit ?? LIBRARY_PAGE_SIZE;
  const where = libraryWhere(resolved);

  const [rows, total, anyActive, anyFavorite] = await Promise.all([
    prisma.exercise.findMany({
      where,
      select: listSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    }),
    prisma.exercise.count({ where }),
    prisma.exercise.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    }),
    prisma.exercise.findFirst({
      where: { deletedAt: null, isFavorite: true },
      select: { id: true },
    }),
  ]);

  return {
    items: rows.map(toListItem),
    total,
    limit,
    hasAnyActive: anyActive !== null,
    hasAnyFavorites: anyFavorite !== null,
  };
}

/** Resolves an exercise by id, INCLUDING archived ones (history must still resolve). */
export async function getExercise(
  id: string,
): Promise<ExerciseDetailDto | null> {
  if (!isUuid(id)) return null;
  const row = await prisma.exercise.findUnique({
    where: { id },
    select: { ...listSelect, secondaryMuscles: true, deletedAt: true },
  });
  if (!row) return null;
  return {
    ...toListItem(row),
    equipmentType: row.equipmentType,
    secondaryMuscleLabels: row.secondaryMuscles.map(muscleGroupLabel),
    isArchived: row.deletedAt !== null,
  };
}
