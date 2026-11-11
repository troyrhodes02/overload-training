"use server";

import { requireAccount } from "@/lib/data/account";
import type { Account } from "@/lib/data/account";
import { DomainError, type ActionResult } from "@/lib/actions/result";
import { importResult } from "@/lib/import/errors";
import { requireCapability } from "@/lib/entitlements/require";
import { isPlanImportEnabled } from "@/lib/import/config";
import {
  MAX_FILE_BYTES,
  MAX_PARTS,
  UPLOAD_ACCEPT_ATTR,
} from "@/lib/import/constants";

const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
import {
  addFilePart,
  addText,
  createImportSession,
  discardImport,
  importDayKey,
  removePart,
  reorderParts,
} from "@/lib/import/sessions";
import {
  beginExtraction,
  getImportStatus,
  retryExtraction,
} from "@/lib/import/extract";
import {
  pickLibraryExercise,
  resolveMatch,
  saveDraftEdit,
  stageCustomExercise,
  type DraftEditPatch,
} from "@/lib/import/review";
import { confirmImport } from "@/lib/import/confirm";
import {
  listExercises,
  type ExerciseListItemDto,
} from "@/lib/exercises/queries";
import { isMuscleGroup } from "@/lib/exercises/taxonomy";
import type { ImportDraftDto, ImportStatusDto } from "@/lib/import/draft/types";

/**
 * Workout Plan Import & Review (Pitch 22) — import server actions (OVE-105
 * foundation slice: source intake + staging). EVERY action:
 *   1. resolves the acting account from the auth session (never client input);
 *   2. re-checks the `plan_import` capability server-side (a Free/expired/anon
 *      direct call gets `plan_required` — hiding the button is never the gate);
 *   3. re-checks the kill switch (OFF by default) and refuses cleanly if off.
 * Then it calls the account-scoped write module. No model call and no plan write
 * ship in this slice (beginExtraction/confirm are OVE-106/107).
 */

/** The server-side gate shared by every import action. Order is load-bearing. */
async function guardImport(): Promise<Account> {
  const account = await requireAccount();
  // Capability first: a Free account must never learn anything more than that
  // this is Pro, even whether the switch is on.
  await requireCapability(account, "plan_import");
  if (!isPlanImportEnabled()) {
    throw new DomainError(
      "import_unavailable",
      "Plan import is turned off right now. Try again later.",
    );
  }
  return account;
}

export async function startImportAction(input: {
  mode: "text" | "files";
}): Promise<ActionResult<{ sessionId: string }>> {
  return importResult(
    "startImportAction",
    async () => {
      const account = await guardImport();
      if (input.mode !== "text" && input.mode !== "files") {
        throw new DomainError(
          "validation_error",
          "Choose how your plan is saved.",
        );
      }
      return createImportSession(account, { mode: input.mode });
    },
    "Couldn't start the import. Nothing was changed.",
  );
}

export async function addTextAction(input: {
  sessionId: string;
  text: string;
}): Promise<ActionResult<{ sessionId: string }>> {
  return importResult(
    "addTextAction",
    async () => {
      const account = await guardImport();
      return addText(account, input);
    },
    "Couldn't save your text. It's still here.",
  );
}

/**
 * Lightweight pre-validation of a chosen file before its bytes are committed:
 * the declared type is in the accept set, the size is within the per-file cap,
 * and the bundle still has room. It reserves nothing on the server beyond this
 * check (the foundation slice commits bytes directly through commitPartAction);
 * the AUTHORITATIVE magic-byte check happens at commit, never here. Returns the
 * accept attribute the client should enforce too.
 */
export async function reserveUploadAction(input: {
  sessionId: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ ok: true; accept: string; maxFileBytes: number }>> {
  return importResult(
    "reserveUploadAction",
    async () => {
      const account = await guardImport();
      if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
        throw new DomainError(
          "validation_error",
          `This file is too large. Choose a file under ${MAX_FILE_MB} MB.`,
        );
      }
      if (!UPLOAD_ACCEPT_ATTR.split(",").includes(input.contentType)) {
        throw new DomainError(
          "validation_error",
          "This file type isn't supported. Upload a PDF or a JPEG, PNG, WebP, or HEIC image.",
        );
      }
      // Confirm the bundle still has room. The count is through account.db, so a
      // session that isn't the acting account's (or doesn't exist) simply counts 0
      // — another account's session is never revealed or reserved against.
      const count = await account.db.importSourcePart.count({
        where: { sessionId: input.sessionId },
      });
      if (count >= MAX_PARTS) {
        throw new DomainError(
          "validation_error",
          `You can add at most ${MAX_PARTS} files.`,
        );
      }
      return {
        ok: true as const,
        accept: UPLOAD_ACCEPT_ATTR,
        maxFileBytes: MAX_FILE_BYTES,
      };
    },
    "Couldn't check that file. Nothing was changed.",
  );
}

/**
 * Commit one uploaded file as the next source part. The File rides the FormData
 * body of the server action; the server reads its bytes and runs the
 * authoritative magic-byte + size validation before anything is stored. The
 * client-declared MIME and filename are never trusted.
 */
export async function commitPartAction(
  _prev: unknown,
  formData: FormData,
): Promise<
  ActionResult<{
    objectPath: string;
    contentType: string;
    position: number;
    pageCount: number | null;
  }>
> {
  return importResult(
    "commitPartAction",
    async () => {
      const account = await guardImport();
      const sessionId = formData.get("sessionId");
      const file = formData.get("file");
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        throw new DomainError("validation_error", "Missing import.");
      }
      if (!(file instanceof File) || file.size === 0) {
        throw new DomainError("validation_error", "Choose a file to upload.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return addFilePart(account, {
        sessionId,
        bytes,
        sizeBytes: file.size,
      });
    },
    "Couldn't add that file. Nothing was changed.",
  );
}

export async function reorderPartsAction(input: {
  sessionId: string;
  order: string[];
}): Promise<ActionResult<{ sessionId: string }>> {
  return importResult(
    "reorderPartsAction",
    async () => {
      const account = await guardImport();
      return reorderParts(account, input);
    },
    "Couldn't reorder. Nothing was changed.",
  );
}

export async function removePartAction(input: {
  sessionId: string;
  objectPath: string;
}): Promise<ActionResult<{ sessionId: string }>> {
  return importResult(
    "removePartAction",
    async () => {
      const account = await guardImport();
      return removePart(account, input);
    },
    "Couldn't remove that file. Nothing was changed.",
  );
}

export async function discardImportAction(input: {
  sessionId: string;
}): Promise<ActionResult<{ sessionId: string }>> {
  return importResult(
    "discardImportAction",
    async () => {
      const account = await guardImport();
      return discardImport(account, input);
    },
    "Couldn't discard. Nothing was changed.",
  );
}

/**
 * OVE-106 — the extraction + review + confirm actions. Every one re-runs
 * guardImport() (capability + kill switch, server-side; a Free/anon direct call
 * is refused before any work) and then calls the account-scoped module. None of
 * them takes a userId from the client — the acting account is from the session.
 */

export async function beginExtractionAction(input: {
  sessionId: string;
}): Promise<ActionResult<ImportStatusDto>> {
  return importResult(
    "beginExtractionAction",
    async () => {
      const account = await guardImport();
      return beginExtraction(account, {
        sessionId: input.sessionId,
        dayKey: importDayKey(account),
      });
    },
    "Couldn't start processing. Nothing was changed.",
  );
}

export async function retryExtractionAction(input: {
  sessionId: string;
}): Promise<ActionResult<ImportStatusDto>> {
  return importResult(
    "retryExtractionAction",
    async () => {
      const account = await guardImport();
      return retryExtraction(account, {
        sessionId: input.sessionId,
        dayKey: importDayKey(account),
      });
    },
    "Couldn't retry. Nothing was changed.",
  );
}

export async function getImportStatusAction(input: {
  sessionId: string;
}): Promise<ActionResult<ImportStatusDto>> {
  return importResult(
    "getImportStatusAction",
    async () => {
      const account = await guardImport();
      return getImportStatus(account, input.sessionId);
    },
    "Couldn't check the import. Nothing was changed.",
  );
}

export async function saveDraftEditAction(input: {
  sessionId: string;
  version: number;
  patch: DraftEditPatch;
}): Promise<ActionResult<ImportDraftDto>> {
  return importResult(
    "saveDraftEditAction",
    async () => {
      const account = await guardImport();
      return saveDraftEdit(account, input);
    },
    "Couldn't save that edit. Nothing was changed.",
  );
}

export async function resolveMatchAction(input: {
  sessionId: string;
  version: number;
  exerciseKey: string;
  exerciseId: string;
}): Promise<ActionResult<ImportDraftDto>> {
  return importResult(
    "resolveMatchAction",
    async () => {
      const account = await guardImport();
      return resolveMatch(account, input);
    },
    "Couldn't set that match. Nothing was changed.",
  );
}

/** Library search page size for the review's "Search library" picker. */
const LIBRARY_SEARCH_PAGE = 50;
const LIBRARY_SEARCH_MAX = 1000;

/**
 * Search the acting account's library (shared + own customs, active only) for
 * the review's library picker. Read-only; scoped by the account's client.
 */
export async function searchImportLibraryAction(input: {
  search: string;
  muscle: string | null;
  limit: number;
}): Promise<
  ActionResult<{ items: ExerciseListItemDto[]; total: number; limit: number }>
> {
  return importResult(
    "searchImportLibraryAction",
    async () => {
      const account = await guardImport();
      const limit = Math.min(
        Math.max(
          Number.isFinite(input.limit) ? Math.trunc(input.limit) : 0,
          LIBRARY_SEARCH_PAGE,
        ),
        LIBRARY_SEARCH_MAX,
      );
      const list = await listExercises(account, {
        view: "all",
        search: String(input.search ?? "").slice(0, 100),
        muscle: isMuscleGroup(input.muscle) ? input.muscle : null,
        limit,
      });
      return { items: list.items, total: list.total, limit };
    },
    "Couldn't search the library. Try again.",
  );
}

export async function pickLibraryExerciseAction(input: {
  sessionId: string;
  version: number;
  exerciseKey: string;
  exerciseId: string;
}): Promise<ActionResult<ImportDraftDto>> {
  return importResult(
    "pickLibraryExerciseAction",
    async () => {
      const account = await guardImport();
      return pickLibraryExercise(account, input);
    },
    "Couldn't use that exercise. Nothing was changed.",
  );
}

export async function stageCustomExerciseAction(input: {
  sessionId: string;
  version: number;
  exerciseKey: string;
  name: string;
  primaryMuscle: string;
  equipmentType: string;
}): Promise<ActionResult<ImportDraftDto>> {
  return importResult(
    "stageCustomExerciseAction",
    async () => {
      const account = await guardImport();
      return stageCustomExercise(account, input);
    },
    "Couldn't stage that exercise. Nothing was changed.",
  );
}

export async function confirmImportAction(input: {
  sessionId: string;
  version: number;
}): Promise<ActionResult<{ mesocycleId: string }>> {
  return importResult(
    "confirmImportAction",
    async () => {
      const account = await guardImport();
      return confirmImport(account, input);
    },
    "Couldn't create the plan. Nothing was changed.",
  );
}
