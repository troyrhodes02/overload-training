import "server-only";
import type { ImportSession } from "@prisma/client";
import { IMPORT_EXPIRED_MESSAGE } from "./errors";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { isEquipment, isMuscleGroup } from "@/lib/exercises/taxonomy";
import { deriveBlockers } from "./draft/build";
import type {
  DraftExercise,
  DraftField,
  ImportDraft,
  ImportDraftDto,
} from "./draft/types";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the review-edit module. It
 * applies the lifter's edits to the stored `ImportDraft` under OPTIMISTIC
 * concurrency: every edit carries the version it was made against, and a stale
 * version is refused as `conflict` (a second tab can't silently clobber). Edits
 * NEVER create a plan, a custom exercise, or a LoggedSet — a staged custom is
 * created only at confirm. Account isolation: everything goes through
 * `account.db`; another account's session is not-found.
 */

async function requireReviewSession(
  account: Account,
  sessionId: string,
): Promise<ImportSession> {
  const session = await account.db.importSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw new DomainError("not_found", "That import could not be found.");
  }
  if (session.status === "expired" || session.status === "purged") {
    throw new DomainError("invalid_state_transition", IMPORT_EXPIRED_MESSAGE);
  }
  if (session.status !== "review") {
    throw new DomainError(
      "invalid_state_transition",
      "This import isn't open for review.",
    );
  }
  return session;
}

function draftOf(session: ImportSession): ImportDraft {
  const draft = session.draft as unknown as ImportDraft | null;
  if (!draft) {
    throw new DomainError("not_found", "There's no draft to edit yet.");
  }
  return draft;
}

/**
 * Persist a mutated draft, bumping both the draft's `version` and the session's
 * `draftVersion` in lockstep, but ONLY if the stored version still equals the
 * one the edit was made against (compare-and-set). A stale edit → `conflict`.
 */
async function saveMutated(
  account: Account,
  session: ImportSession,
  expectedVersion: number,
  mutate: (draft: ImportDraft) => ImportDraft,
): Promise<ImportDraftDto> {
  if (session.draftVersion !== expectedVersion) {
    throw new DomainError(
      "conflict",
      "This import changed in another tab. Reopen it to see the latest.",
    );
  }
  const current = draftOf(session);
  const next = mutate(current);
  next.version = expectedVersion + 1;

  const result = await account.db.importSession.updateMany({
    where: { id: session.id, draftVersion: expectedVersion, status: "review" },
    data: { draft: next as object, draftVersion: expectedVersion + 1 },
  });
  if (result.count !== 1) {
    throw new DomainError(
      "conflict",
      "This import changed in another tab. Reopen it to see the latest.",
    );
  }
  return next;
}

function findExercise(
  draft: ImportDraft,
  exerciseKey: string,
): { dayIndex: number; exIndex: number; ex: DraftExercise } | null {
  for (let d = 0; d < draft.days.length; d++) {
    const exs = draft.days[d].exercises;
    for (let e = 0; e < exs.length; e++) {
      if (exs[e].key === exerciseKey) {
        return { dayIndex: d, exIndex: e, ex: exs[e] };
      }
    }
  }
  return null;
}

function editField<T>(field: DraftField<T>, value: T | null): DraftField<T> {
  return { ...field, value, status: "user_edited" };
}

export type DraftEditPatch =
  | { kind: "title"; value: string }
  | { kind: "dayLabel"; dayKey: string; value: string }
  | {
      kind: "exercise";
      exerciseKey: string;
      sets?: number | null;
      repMin?: number | null;
      repMax?: number | null;
    };

/** Apply one typed edit to the draft under optimistic concurrency. */
export async function saveDraftEdit(
  account: Account,
  input: { sessionId: string; version: number; patch: DraftEditPatch },
): Promise<ImportDraftDto> {
  const session = await requireReviewSession(account, input.sessionId);
  return saveMutated(account, session, input.version, (draft) => {
    const next = structuredClone(draft);
    const patch = input.patch;
    if (patch.kind === "title") {
      next.title = editField(next.title, patch.value.trim());
    } else if (patch.kind === "dayLabel") {
      const day = next.days.find((d) => d.key === patch.dayKey);
      if (!day)
        throw new DomainError("not_found", "That day isn't in this import.");
      day.label = editField(day.label, patch.value.trim());
    } else {
      const loc = findExercise(next, patch.exerciseKey);
      if (!loc) {
        throw new DomainError(
          "not_found",
          "That exercise isn't in this import.",
        );
      }
      const ex = next.days[loc.dayIndex].exercises[loc.exIndex];
      if (patch.sets !== undefined) {
        ex.sets = editField(ex.sets, normalizeInt(patch.sets, 1, 15));
      }
      if (patch.repMin !== undefined) {
        ex.repMin = editField(ex.repMin, normalizeInt(patch.repMin, 1, 999));
      }
      if (patch.repMax !== undefined) {
        ex.repMax = editField(ex.repMax, normalizeInt(patch.repMax, 1, 999));
      }
    }
    return next;
  });
}

function normalizeInt(
  n: number | null,
  min: number,
  max: number,
): number | null {
  if (n == null || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Resolve an ambiguous match to one of its candidates (or re-pick a match). The
 * chosen exercise id MUST be one of the candidate ids the deterministic matcher
 * offered — a client can't smuggle an arbitrary (or another account's) id.
 */
export async function resolveMatch(
  account: Account,
  input: {
    sessionId: string;
    version: number;
    exerciseKey: string;
    exerciseId: string;
  },
): Promise<ImportDraftDto> {
  const session = await requireReviewSession(account, input.sessionId);
  return saveMutated(account, session, input.version, (draft) => {
    const next = structuredClone(draft);
    const loc = findExercise(next, input.exerciseKey);
    if (!loc) {
      throw new DomainError("not_found", "That exercise isn't in this import.");
    }
    const ex = next.days[loc.dayIndex].exercises[loc.exIndex];
    const match = ex.match;
    if (match.kind !== "ambiguous") {
      throw new DomainError(
        "validation_error",
        "That exercise doesn't have alternatives to choose from.",
      );
    }
    const chosen = match.candidates.find(
      (c) => c.exerciseId === input.exerciseId,
    );
    if (!chosen) {
      // Not one of the offered candidates → not-found (never trust a client id).
      throw new DomainError("not_found", "That match isn't an option here.");
    }
    ex.match = {
      kind: "matched",
      exerciseId: chosen.exerciseId,
      name: chosen.name,
    };
    return next;
  });
}

/**
 * Point an imported exercise at ANY exercise the lifter can see in their library
 * (the shared library plus their own custom exercises), chosen from the
 * library search rather than the offered candidates. Works for an ambiguous,
 * unknown, already-matched, or staged-custom row. The id comes from the client,
 * so it is resolved through the account-scoped client: another account's custom
 * exercise, an archived one, or a made-up id is indistinguishable from one that
 * does not exist (not-found), and nothing changes.
 */
export async function pickLibraryExercise(
  account: Account,
  input: {
    sessionId: string;
    version: number;
    exerciseKey: string;
    exerciseId: string;
  },
): Promise<ImportDraftDto> {
  const session = await requireReviewSession(account, input.sessionId);
  const exercise = isUuid(input.exerciseId)
    ? await account.db.exercise.findFirst({
        where: { id: input.exerciseId, deletedAt: null },
        select: { id: true, name: true },
      })
    : null;
  if (!exercise) {
    throw new DomainError("not_found", "That exercise isn't in your library.");
  }
  return saveMutated(account, session, input.version, (draft) => {
    const next = structuredClone(draft);
    const loc = findExercise(next, input.exerciseKey);
    if (!loc) {
      throw new DomainError("not_found", "That exercise isn't in this import.");
    }
    next.days[loc.dayIndex].exercises[loc.exIndex].match = {
      kind: "matched",
      exerciseId: exercise.id,
      name: exercise.name,
    };
    return next;
  });
}

/**
 * Stage a custom exercise for an unknown match. STAGE ONLY — nothing is written
 * to the Exercise table here; the custom is created at confirm, in the same
 * transaction as the plan (so a failed confirm leaves no orphan custom).
 */
export async function stageCustomExercise(
  account: Account,
  input: {
    sessionId: string;
    version: number;
    exerciseKey: string;
    name: string;
    primaryMuscle: string;
    equipmentType: string;
  },
): Promise<ImportDraftDto> {
  const session = await requireReviewSession(account, input.sessionId);
  const name = input.name.trim();
  if (name.length === 0) {
    throw new DomainError(
      "validation_error",
      "Name the exercise to create it.",
    );
  }
  if (!isMuscleGroup(input.primaryMuscle)) {
    throw new DomainError("validation_error", "Choose a muscle group.");
  }
  if (!isEquipment(input.equipmentType)) {
    throw new DomainError("validation_error", "Choose an equipment type.");
  }
  return saveMutated(account, session, input.version, (draft) => {
    const next = structuredClone(draft);
    const loc = findExercise(next, input.exerciseKey);
    if (!loc) {
      throw new DomainError("not_found", "That exercise isn't in this import.");
    }
    next.days[loc.dayIndex].exercises[loc.exIndex].match = {
      kind: "custom_staged",
      name,
      primaryMuscle: input.primaryMuscle,
      equipmentType: input.equipmentType,
    };
    return next;
  });
}

/** Server-side blockers for the stored draft (the authority for Create plan). */
export function draftBlockers(session: ImportSession) {
  return deriveBlockers(draftOf(session));
}
