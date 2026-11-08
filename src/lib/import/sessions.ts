import "server-only";
import type {
  ImportSession,
  ImportSourceKind,
  ImportStatus,
} from "@prisma/client";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { accountToday } from "@/lib/data/account";
import {
  MAX_PARTS,
  MAX_TEXT_CHARS,
  MAX_TOTAL_BYTES,
  RETENTION_HOURS,
} from "./constants";
import {
  normalizeForStorage,
  removeSourceObjects,
  sourceObjectPath,
  SourceValidationError,
  uploadSourceObject,
} from "./storage";

/**
 * Workout Plan Import & Review (Pitch 22) — the ImportSession write module.
 * Every read and write goes through the account-scoped client (`account.db`),
 * which intersects each query with `userId = acting`; this module never names
 * another account's id and never takes a userId from its caller. It owns the
 * state machine's transitions (compare-and-set), source-part staging, and the
 * stored-object cleanup that rides discard. The extraction trigger, the model
 * call, and confirm live in later slices (OVE-106/107); this slice stops at
 * `uploaded`.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/** When an unconfirmed import expires: at most RETENTION_HOURS from creation. */
function expiresAt(now: Date): Date {
  return new Date(now.getTime() + RETENTION_HOURS * MS_PER_HOUR);
}

/**
 * Create a new import session in `created`, with its retention clock set. The
 * source kind is fixed at creation from the chosen mode (text vs files); a
 * `files` session's kind is refined to `pdf` or `image` when the first part is
 * committed is NOT done here (kept simple: `image` is the generic file kind,
 * `pdf` set on commit of a PDF). The scoped create stamps the acting userId.
 */
export async function createImportSession(
  account: Account,
  input: { mode: "text" | "files" },
): Promise<{ sessionId: string }> {
  const now = new Date();
  const sourceKind: ImportSourceKind = input.mode === "text" ? "text" : "image";
  const session = await account.db.importSession.create({
    data: {
      userId: account.userId,
      status: "created",
      sourceKind,
      expiresAt: expiresAt(now),
    },
    select: { id: true },
  });
  return { sessionId: session.id };
}

/** Load the acting account's session, or not-found (never another account's). */
async function requireOwnSession(
  account: Account,
  sessionId: string,
): Promise<ImportSession> {
  const session = await account.db.importSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw new DomainError("not_found", "That import could not be found.");
  }
  return session;
}

/** A session is still assembling its source while in `created` or `uploaded`. */
function assertStillAssembling(session: ImportSession): void {
  if (session.status !== "created" && session.status !== "uploaded") {
    throw new DomainError(
      "invalid_state_transition",
      "This import has already started and can't be changed.",
    );
  }
}

/**
 * Add (or replace) the pasted/typed text part of a text-mode session, trimmed
 * and length-capped, moving the session to `uploaded`. A text source is a
 * single part at position 0. Re-adding replaces it (idempotent Start).
 */
export async function addText(
  account: Account,
  input: { sessionId: string; text: string },
): Promise<{ sessionId: string }> {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) {
    throw new DomainError("validation_error", "Paste your plan to continue.");
  }
  if (trimmed.length > MAX_TEXT_CHARS) {
    throw new DomainError(
      "validation_error",
      `That's over the ${MAX_TEXT_CHARS.toLocaleString()}-character limit. Trim it to import.`,
    );
  }
  const session = await requireOwnSession(account, input.sessionId);
  assertStillAssembling(session);

  await account.db.$transaction(async (tx) => {
    await tx.importSourcePart.deleteMany({ where: { sessionId: session.id } });
    await tx.importSourcePart.create({
      data: {
        userId: account.userId,
        sessionId: session.id,
        position: 0,
        text: trimmed,
      },
    });
    await tx.importSession.updateMany({
      where: { id: session.id, status: { in: ["created", "uploaded"] } },
      data: { status: "uploaded", sourceKind: "text" },
    });
  });
  return { sessionId: session.id };
}

/**
 * Validate and stage one uploaded file as the next source part: sniff its real
 * type from magic bytes, re-verify size, enforce the per-bundle count and total
 * caps, store it under an owner-prefixed key, and record the part. Returns the
 * stored object path and resolved (post-conversion) content type.
 *
 * This is the "reserve + commit" of the foundation slice folded into one
 * server-validated call: the client hands over the bytes, the server decides
 * everything (type, size, path). The bytes never bypass this validation.
 */
export async function addFilePart(
  account: Account,
  input: { sessionId: string; bytes: Uint8Array; sizeBytes: number },
): Promise<{ objectPath: string; contentType: string; position: number }> {
  const session = await requireOwnSession(account, input.sessionId);
  assertStillAssembling(session);

  const existing = await account.db.importSourcePart.findMany({
    where: { sessionId: session.id },
    select: { position: true, sizeBytes: true, text: true },
    orderBy: { position: "asc" },
  });
  if (existing.some((p) => p.text !== null)) {
    throw new DomainError(
      "invalid_state_transition",
      "This import is a pasted plan. Start a new import to upload files.",
    );
  }
  if (existing.length >= MAX_PARTS) {
    throw new DomainError(
      "validation_error",
      `You can add at most ${MAX_PARTS} files.`,
    );
  }
  const usedBytes = existing.reduce((n, p) => n + (p.sizeBytes ?? 0), 0);
  if (usedBytes + input.sizeBytes > MAX_TOTAL_BYTES) {
    throw new DomainError(
      "validation_error",
      "That's over the total size limit for one import.",
    );
  }

  let normalized;
  try {
    normalized = normalizeForStorage({
      bytes: input.bytes,
      sizeBytes: input.sizeBytes,
    });
  } catch (error) {
    if (error instanceof SourceValidationError) {
      throw new DomainError("validation_error", error.message);
    }
    throw error;
  }

  const position =
    existing.length === 0 ? 0 : existing[existing.length - 1].position + 1;
  const objectPath = sourceObjectPath(
    account.userId,
    session.id,
    position,
    normalized.contentType,
  );

  // Store the bytes first; if the row write then fails, the object is swept so
  // nothing is orphaned. The upload module already removes the object on its own
  // failure.
  await uploadSourceObject(objectPath, normalized);
  try {
    await account.db.$transaction(async (tx) => {
      await tx.importSourcePart.create({
        data: {
          userId: account.userId,
          sessionId: session.id,
          position,
          objectPath,
          contentType: normalized.contentType,
          sizeBytes: input.sizeBytes,
        },
      });
      await tx.importSession.updateMany({
        where: { id: session.id, status: { in: ["created", "uploaded"] } },
        data: {
          status: "uploaded",
          sourceKind:
            normalized.contentType === "application/pdf" ? "pdf" : "image",
        },
      });
    });
  } catch (error) {
    await removeSourceObjects([objectPath]);
    throw error;
  }
  return { objectPath, contentType: normalized.contentType, position };
}

/** Remove one source part by object path, deleting its stored object too. */
export async function removePart(
  account: Account,
  input: { sessionId: string; objectPath: string },
): Promise<{ sessionId: string }> {
  const session = await requireOwnSession(account, input.sessionId);
  assertStillAssembling(session);
  const part = await account.db.importSourcePart.findFirst({
    where: { sessionId: session.id, objectPath: input.objectPath },
    select: { id: true, objectPath: true },
  });
  if (!part) {
    throw new DomainError("not_found", "That file could not be found.");
  }
  await account.db.importSourcePart.deleteMany({ where: { id: part.id } });
  if (part.objectPath) await removeSourceObjects([part.objectPath]);
  return { sessionId: session.id };
}

/**
 * Reorder a session's parts to the given object-path order (parts are referenced
 * by their stored object path or, for a text part, its position token). Positions
 * are rewritten 0..n-1 in two passes to avoid a transient unique collision.
 */
export async function reorderParts(
  account: Account,
  input: { sessionId: string; order: string[] },
): Promise<{ sessionId: string }> {
  const session = await requireOwnSession(account, input.sessionId);
  assertStillAssembling(session);
  const parts = await account.db.importSourcePart.findMany({
    where: { sessionId: session.id },
    select: { id: true, objectPath: true },
  });
  const byPath = new Map(
    parts
      .filter((p) => p.objectPath)
      .map((p) => [p.objectPath as string, p.id]),
  );
  const ids = input.order
    .map((path) => byPath.get(path))
    .filter((id): id is string => id !== undefined);
  if (ids.length !== parts.length) {
    throw new DomainError(
      "validation_error",
      "That order didn't match this import's files.",
    );
  }
  await account.db.$transaction(async (tx) => {
    // Pass 1: move everything out of the 0..n-1 range to avoid colliding on the
    // (session_id, position) unique while reshuffling.
    for (let i = 0; i < ids.length; i++) {
      await tx.importSourcePart.updateMany({
        where: { id: ids[i] },
        data: { position: parts.length + i },
      });
    }
    // Pass 2: settle to the final contiguous order.
    for (let i = 0; i < ids.length; i++) {
      await tx.importSourcePart.updateMany({
        where: { id: ids[i] },
        data: { position: i },
      });
    }
  });
  return { sessionId: session.id };
}

/**
 * Discard an import: delete its session and every source part, and sweep the
 * stored objects. Scoped to the acting account; another account's id is
 * not-found. Only an unconfirmed session may be discarded (a confirmed one owns
 * a real plan and is terminal).
 */
export async function discardImport(
  account: Account,
  input: { sessionId: string },
): Promise<{ sessionId: string }> {
  const session = await requireOwnSession(account, input.sessionId);
  if (session.status === "confirmed") {
    throw new DomainError(
      "invalid_state_transition",
      "This import already created a plan and can't be discarded.",
    );
  }
  const parts = await account.db.importSourcePart.findMany({
    where: { sessionId: session.id },
    select: { objectPath: true },
  });
  const objectPaths = parts
    .map((p) => p.objectPath)
    .filter((p): p is string => p !== null);

  await account.db.$transaction(async (tx) => {
    await tx.importSourcePart.deleteMany({ where: { sessionId: session.id } });
    await tx.importSession.deleteMany({ where: { id: session.id } });
  });
  await removeSourceObjects(objectPaths);
  return { sessionId: session.id };
}

/** The account-local day key for the daily quota (account timezone). */
export function importDayKey(account: Account): string {
  return accountToday(account);
}

/** Expose the status enum values other modules compare against. */
export type { ImportStatus };
