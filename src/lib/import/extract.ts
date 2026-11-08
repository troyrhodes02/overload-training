import "server-only";
import { randomUUID } from "node:crypto";
import type { ImportSession, ImportStatus } from "@prisma/client";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { bumpImportUsage } from "./usage";
import {
  ESTIMATED_ATTEMPT_MICROS,
  reconcileSpend,
  releaseReservation,
  reserveSpend,
} from "./spend";
import { getPlanExtractionPort } from "./extraction";
import type { ExtractionPart, ExtractionResult } from "./extraction/port";
import { matchExercises } from "./match/library";
import { buildImportDraft } from "./draft/build";
import type { SourceTextPart } from "./draft/evidence";
import type { ImportDraft, ImportStatusDto, ImportStep } from "./draft/types";
import { signSourceReadUrls } from "./storage";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the extraction LIFECYCLE
 * (blueprint §4.1/§4.2, spec §6/§11). It gates entry to `extracting` (capability
 * is re-checked by the action; here: quota + spend reservation + lease claim),
 * runs the model call through the port OUTSIDE any Prisma transaction, and writes
 * a terminal/retryable status. A stale lease is reclaimable by compare-and-set so
 * a crashed attempt can never block a retry, and the loser of a race can never
 * overwrite the winner (RD-10).
 *
 * Account isolation: every read and write goes through `account.db`; another
 * account's session id is not-found. The only raw-client writes are the daily
 * quota bump (usage.ts) and the spend reservation (spend.ts), both un-ownable
 * atomic counters.
 *
 * NO `after()`, NO naked promise, NO queue: the Start action awaits the bounded
 * request-owned task before returning, so Vercel does not tear down the work.
 */

/** How long a lease is honoured before it may be reclaimed as stale (ms). */
const LEASE_TTL_MS = 90_000;
/** Hard wall-clock cap on a single provider call (ms). */
const EXTRACTION_TIMEOUT_MS = 60_000;
/** Max started attempts for one session before it is terminal-failed. */
const MAX_ATTEMPTS = 3;

const MAX_TEXT_SNIPPET = 20_000;

function step(status: ImportStatus): ImportStep {
  switch (status) {
    case "created":
    case "uploaded":
      return "source";
    case "extracting":
    case "failed_retryable":
    case "needs_input":
    case "not_a_plan":
    case "failed_final":
      return status === "extracting" || status === "failed_retryable"
        ? "processing"
        : "processing";
    case "review":
    case "confirming":
      return "review";
    case "confirmed":
      return "done";
    default:
      return "processing";
  }
}

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

/** Poll status for the Processing step. */
export async function getImportStatus(
  account: Account,
  sessionId: string,
): Promise<ImportStatusDto> {
  const session = await requireOwnSession(account, sessionId);
  return {
    sessionId: session.id,
    status: session.status,
    step: step(session.status),
    errorCode: session.errorCode,
  };
}

/**
 * Claim the extraction lease for `sessionId` via compare-and-set. Succeeds only
 * when the session is `uploaded`/`failed_retryable`, OR it is `extracting` with
 * an EXPIRED lease (stale reclaim). Returns the lease token on success, null when
 * another live attempt owns it.
 */
async function claimLease(
  account: Account,
  sessionId: string,
): Promise<string | null> {
  const token = randomUUID();
  const now = new Date();
  const leaseDeadline = new Date(now.getTime() - LEASE_TTL_MS);
  const nextExpiry = new Date(now.getTime() + LEASE_TTL_MS);

  // CAS: move to `extracting`, set a fresh lease + bump attemptCount, but only
  // from a claimable state. `updateMany` with a WHERE guard is the atomic claim;
  // the loser of a concurrent race updates 0 rows.
  const result = await account.db.importSession.updateMany({
    where: {
      id: sessionId,
      OR: [
        { status: { in: ["uploaded", "failed_retryable"] } },
        { status: "extracting", leaseExpiresAt: { lt: leaseDeadline } },
      ],
    },
    data: {
      status: "extracting",
      leaseToken: token,
      leaseExpiresAt: nextExpiry,
      errorCode: null,
      attemptCount: { increment: 1 },
    },
  });
  return result.count === 1 ? token : null;
}

/** Load the ordered source parts as extraction parts + text parts for evidence. */
async function loadParts(
  account: Account,
  sessionId: string,
): Promise<{ extraction: ExtractionPart[]; text: SourceTextPart[] }> {
  const parts = await account.db.importSourcePart.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
  });
  const extraction: ExtractionPart[] = [];
  const text: SourceTextPart[] = [];
  // For file parts we need the bytes; but OVE-106 ships the TEXT vertical only.
  // Image/PDF byte loading rides OVE-108 (the file vertical). Here, text parts
  // carry their inline text; file parts are passed as text-less evidence parts
  // (their bytes are fetched by OVE-108's extraction path).
  for (const p of parts) {
    if (p.text != null) {
      extraction.push({ kind: "text", index: p.position, text: p.text });
      text.push({ index: p.position, text: p.text.slice(0, MAX_TEXT_SNIPPET) });
    } else {
      // Non-text parts: evidence can't be verified from held text (image/pdf).
      text.push({ index: p.position, text: null, pageCount: p.pageCount });
      // The byte-bearing extraction part is assembled by OVE-108; omitted here.
    }
  }
  return { extraction, text };
}

/** Write a terminal status for a failure, releasing the spend reservation. */
async function failSession(
  account: Account,
  sessionId: string,
  token: string,
  outcome: Extract<ExtractionResult, { ok: false }>,
  attemptCount: number,
): Promise<void> {
  await releaseReservation(ESTIMATED_ATTEMPT_MICROS).catch(() => {});

  let status: ImportStatus;
  if (outcome.code === "cancelled") {
    status = "discarded"; // handled by discard; defensive
  } else if (outcome.retryable && attemptCount < MAX_ATTEMPTS) {
    status = "failed_retryable";
  } else {
    status = "failed_final";
  }
  // CAS on the lease token: only the owning attempt writes the outcome, so a
  // reclaimed-stale winner can never be overwritten by a late loser.
  await account.db.importSession.updateMany({
    where: { id: sessionId, leaseToken: token },
    data: {
      status,
      errorCode: outcome.code,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
}

/** Write the review draft for a success, reconciling spend. */
async function completeSession(
  account: Account,
  sessionId: string,
  token: string,
  draft: ImportDraft,
  meta: {
    modelId: string;
    promptVersion: string;
    usage: { inputTokens: number; outputTokens: number } | null;
  },
  notAPlan: boolean,
): Promise<void> {
  // Reconcile spend against a conservative actual (usage pricing is owner-set;
  // until a price map ships we keep the reservation as the actual, spec §17.1).
  await reconcileSpend({
    reservedMicros: ESTIMATED_ATTEMPT_MICROS,
    actualMicros: ESTIMATED_ATTEMPT_MICROS,
  }).catch(() => {});

  await account.db.importSession.updateMany({
    where: { id: sessionId, leaseToken: token },
    data: {
      status: notAPlan ? "not_a_plan" : "review",
      draft: notAPlan ? undefined : (draft as object),
      draftVersion: 0,
      modelId: meta.modelId,
      promptVersion: meta.promptVersion,
      inputTokens: meta.usage?.inputTokens ?? null,
      outputTokens: meta.usage?.outputTokens ?? null,
      errorCode: notAPlan ? "not_a_plan" : null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
}

/**
 * Run one bounded, request-owned extraction attempt for a leased session. The
 * MODEL CALL happens here, strictly OUTSIDE any Prisma transaction. On return the
 * session is in a terminal (`review`/`not_a_plan`/`failed_final`) or retryable
 * (`failed_retryable`) state.
 */
async function runExtraction(
  account: Account,
  session: ImportSession,
  token: string,
): Promise<void> {
  const { extraction, text } = await loadParts(account, session.id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  let result: ExtractionResult;
  try {
    const port = getPlanExtractionPort();
    result = await port.extract({
      parts: extraction,
      signal: controller.signal,
    });
  } catch {
    // The port is contracted to never throw; treat an escape as a retryable blip.
    result = { ok: false, code: "provider_unavailable", retryable: true };
  } finally {
    clearTimeout(timer);
  }

  if (!result.ok) {
    await failSession(
      account,
      session.id,
      token,
      result,
      session.attemptCount + 1,
    );
    return;
  }

  // Deterministic interpretation (code decides). Match names over the real
  // library (through account.db), then build the versioned draft.
  const rawNames: string[] = [];
  for (const day of result.observation.days) {
    for (const ex of day.exercises) rawNames.push(ex.name.raw ?? "");
  }
  const matches = result.observation.isWorkoutPlan
    ? await matchExercises(account, rawNames)
    : [];

  const draft = buildImportDraft({
    observation: result.observation,
    matches,
    parts: text,
  });

  await completeSession(
    account,
    session.id,
    token,
    draft,
    {
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      usage: result.usage,
    },
    !result.observation.isWorkoutPlan,
  );
}

/**
 * Begin extraction (the Start action's core). Capability + kill switch are
 * re-checked by the action before this runs. Here: bump the daily quota (started
 * attempt), reserve spend (fail-closed), claim the lease, then run the bounded
 * request-owned task. Returns the status after the attempt.
 */
export async function beginExtraction(
  account: Account,
  input: { sessionId: string; dayKey: string },
): Promise<ImportStatusDto> {
  const session = await requireOwnSession(account, input.sessionId);
  if (session.status === "review" || session.status === "confirmed") {
    // Already past extraction — idempotent: just report where it is.
    return getImportStatus(account, session.id);
  }
  if (session.status !== "uploaded" && session.status !== "failed_retryable") {
    throw new DomainError(
      "invalid_state_transition",
      "This import isn't ready to process.",
    );
  }

  // Daily quota: the started attempt is counted even if it later fails; an
  // idempotent re-poll does not re-count because the claim below gates the work.
  const quota = await bumpImportUsage(account.userId, input.dayKey);
  if (!quota.allowed) {
    throw new DomainError(
      "rate_limited",
      "You've reached today's import limit. Try again tomorrow.",
    );
  }

  // Global spend reservation (fail-closed when the cap is unset or DB blips).
  const spend = await reserveSpend();
  if (!spend.allowed) {
    throw new DomainError(
      "import_unavailable",
      "Plan import is temporarily unavailable.",
    );
  }

  const token = await claimLease(account, session.id);
  if (!token) {
    // Another live attempt owns the lease; release our reservation and report.
    await releaseReservation(ESTIMATED_ATTEMPT_MICROS).catch(() => {});
    return getImportStatus(account, session.id);
  }

  // Reload the leased session so attemptCount reflects the increment.
  const leased = await requireOwnSession(account, session.id);
  await runExtraction(account, leased, token);
  return getImportStatus(account, session.id);
}

/** Retry a retryable failure (bounded attempts). */
export async function retryExtraction(
  account: Account,
  input: { sessionId: string; dayKey: string },
): Promise<ImportStatusDto> {
  const session = await requireOwnSession(account, input.sessionId);
  if (session.status !== "failed_retryable") {
    throw new DomainError(
      "invalid_state_transition",
      "There's nothing to retry.",
    );
  }
  if (session.attemptCount >= MAX_ATTEMPTS) {
    await account.db.importSession.updateMany({
      where: { id: session.id, status: "failed_retryable" },
      data: { status: "failed_final" },
    });
    throw new DomainError(
      "import_unavailable",
      "We couldn't read this after several tries. Nothing was charged.",
    );
  }
  // Retrying is a new started attempt: re-run the begin path (quota + spend + lease).
  return beginExtraction(account, {
    sessionId: session.id,
    dayKey: input.dayKey,
  });
}

/** The source read URLs for the review source pane (short-TTL signed). */
export async function sourceReadUrls(
  account: Account,
  sessionId: string,
): Promise<{ position: number; text: string | null; url: string | null }[]> {
  const parts = await account.db.importSourcePart.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    select: { position: true, text: true, objectPath: true },
  });
  const paths = parts
    .map((p) => p.objectPath)
    .filter((p): p is string => p !== null);
  const signed = await signSourceReadUrls(paths);
  return parts.map((p) => ({
    position: p.position,
    text: p.text,
    url: p.objectPath ? (signed.get(p.objectPath) ?? null) : null,
  }));
}
