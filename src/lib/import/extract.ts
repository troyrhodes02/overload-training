import "server-only";
import { randomUUID } from "node:crypto";
import type { ImportSession, ImportStatus } from "@prisma/client";
import {
  EXTRACTION_UNAVAILABLE_MESSAGE,
  IMPORT_EXPIRED_MESSAGE,
} from "./errors";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { bumpImportUsage, refundImportUsage } from "./usage";
import {
  ESTIMATED_ATTEMPT_MICROS,
  reconcileSpend,
  releaseReservation,
  reserveSpend,
} from "./spend";
import { getPlanExtractionPort } from "./extraction";
import { providerMayHaveBilled } from "./provider-billing";
import { logDiagnostic } from "./diagnostics";
import type { ExtractionPart, ExtractionResult } from "./extraction/port";
import type { ExtractedPlanObservation } from "./extraction/schema";
import { matchExercises } from "./match/library";
import { buildImportDraft } from "./draft/build";
import type { SourceTextPart } from "./draft/evidence";
import type { ImportDraft, ImportStatusDto, ImportStep } from "./draft/types";
import { downloadSourceObject, signSourceReadUrls } from "./storage";
import { inspectPdf, isTextLayerDefensible } from "./pdf";

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

/**
 * Hard wall-clock cap on a single provider call (ms). A long plan is thousands
 * of output tokens, which a 60 s cap aborted mid-answer; this stays under the
 * page's maxDuration (plan/import/page.tsx) with room for the surrounding work.
 */
const EXTRACTION_TIMEOUT_MS = 240_000;
/**
 * How long a lease is honoured before it may be reclaimed as stale (ms). It must
 * OUTLAST the call: if it expired mid-call, a second request could reclaim the
 * session and run a second billable extraction concurrently.
 */
const LEASE_TTL_MS = EXTRACTION_TIMEOUT_MS + 45_000;
/**
 * Max started (billable) attempts for one session before it is terminal-failed:
 * the first try plus ONE retry. (The old value, 3, never took effect: the count
 * handed to failSession already included the attempt being failed, so the third
 * attempt was unreachable. Two is now stated outright, keeping spend bounded.)
 */
const MAX_ATTEMPTS = 2;

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
  if (session.status === "expired" || session.status === "purged") {
    throw new DomainError("invalid_state_transition", IMPORT_EXPIRED_MESSAGE);
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
  const nextExpiry = new Date(now.getTime() + LEASE_TTL_MS);

  // CAS: move to `extracting`, set a fresh lease + bump attemptCount, but only
  // from a claimable state. `updateMany` with a WHERE guard is the atomic claim;
  // the loser of a concurrent race updates 0 rows. A session is claimable when it
  // is `uploaded`/`failed_retryable`, OR it is `extracting` with an EXPIRED lease
  // (`leaseExpiresAt < now` — the owning request crashed/was torn down). This is
  // the SAME threshold `beginExtraction` uses to decide a lease is no longer live,
  // so there is no dead zone between "reported in-progress" and "reclaimable".
  const result = await account.db.importSession.updateMany({
    where: {
      id: sessionId,
      OR: [
        { status: { in: ["uploaded", "failed_retryable"] } },
        { status: "extracting", leaseExpiresAt: { lt: now } },
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

/** Join per-page text with page markers the model can cite (1-indexed). */
function pagedText(pages: string[]): string {
  return pages
    .map((page, i) => `--- PAGE ${i + 1} ---\n${page}`)
    .join("\n\n")
    .slice(0, MAX_TEXT_SNIPPET);
}

/**
 * Load the ordered source parts as the model-facing extraction parts plus the
 * text parts the offline evidence check uses.
 *
 * Path selection per part is by ACTUAL source characteristics, not the file
 * extension (blueprint §3.2, RD-14):
 *  - a pasted-text part → a text extraction part;
 *  - a PDF whose text layer is defensible (every page has text, enough volume)
 *    → a TEXT extraction part carrying the per-page text with `--- PAGE n ---`
 *    markers, and a text evidence part so quotes can be verified against the
 *    text and page numbers bounded by the real page count;
 *  - a PDF whose text layer can't be defended (scanned / image-only / ambiguous
 *    columns) → a VISION/PDF extraction part carrying the raw BYTES (never a
 *    signed URL), with a text-less evidence part bounded only by page count;
 *  - an image part → a VISION extraction part carrying the raw bytes.
 *
 * A file part whose bytes cannot be downloaded is skipped from the extraction
 * payload (it still appears as an evidence part) rather than failing the whole
 * import; the review surfaces that nothing was read from it.
 */
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

  for (const p of parts) {
    if (p.text != null) {
      extraction.push({ kind: "text", index: p.position, text: p.text });
      text.push({ index: p.position, text: p.text.slice(0, MAX_TEXT_SNIPPET) });
      continue;
    }
    if (!p.objectPath) {
      text.push({ index: p.position, text: null, pageCount: p.pageCount });
      continue;
    }
    const bytes = await downloadSourceObject(p.objectPath);
    if (!bytes) {
      // The object is gone (cleaned up / never stored). Keep it as an unreadable
      // evidence part; it simply contributes nothing to the model payload.
      text.push({ index: p.position, text: null, pageCount: p.pageCount });
      continue;
    }

    if (p.contentType === "application/pdf") {
      let pages: string[] | null = null;
      let pageCount = p.pageCount ?? null;
      try {
        const inspection = await inspectPdf(bytes);
        pages = inspection.pages;
        pageCount = inspection.pageCount;
      } catch {
        // Intake already refused encrypted/malformed PDFs; a re-inspection failure
        // here means the stored bytes changed shape. Fall back to the vision path
        // with the bytes so we don't lose the part silently.
        pages = null;
      }

      if (pages && isTextLayerDefensible(pages)) {
        // Text path: send the per-page text, page-marked for citation.
        extraction.push({
          kind: "text",
          index: p.position,
          text: pagedText(pages),
        });
        text.push({
          index: p.position,
          text: pages.join("\n"),
          pageCount,
        });
      } else {
        // Vision/PDF fallback: raw bytes, never a signed URL.
        extraction.push({
          kind: "pdf",
          index: p.position,
          bytes,
          pageCount: pageCount ?? undefined,
        });
        text.push({ index: p.position, text: null, pageCount });
      }
      continue;
    }

    // Images (jpeg/png/webp): vision path with raw bytes. The screenshot/photo
    // slice (OVE-108) refines rotation/resize; here the bytes are sent as stored.
    if (
      p.contentType === "image/jpeg" ||
      p.contentType === "image/png" ||
      p.contentType === "image/webp"
    ) {
      extraction.push({
        kind: "image",
        index: p.position,
        bytes,
        mime: p.contentType,
      });
    }
    text.push({ index: p.position, text: null, pageCount: p.pageCount });
  }
  return { extraction, text };
}

/** Write a terminal status for a failure (billing-aware spend handling below). */
async function failSession(
  account: Account,
  sessionId: string,
  token: string,
  outcome: Extract<ExtractionResult, { ok: false }>,
  attemptCount: number,
): Promise<void> {
  // A failure BEFORE the provider could have done billable work releases the
  // reservation. A failure AFTER it may have (a timeout or abort, a truncated or
  // unusable answer, a refusal) keeps the estimate as spent: the provider may
  // already have billed it, and the global cap must not drift below reality.
  if (providerMayHaveBilled(outcome.code)) {
    await reconcileSpend({
      reservedMicros: ESTIMATED_ATTEMPT_MICROS,
      actualMicros: ESTIMATED_ATTEMPT_MICROS,
    }).catch(() => {});
  } else {
    await releaseReservation(ESTIMATED_ATTEMPT_MICROS).catch(() => {});
  }

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
    await failSession(account, session.id, token, result, session.attemptCount);
    return;
  }

  // Deterministic interpretation (code decides). Match names over the real
  // library (through account.db), then build the versioned draft. The provider
  // call has ALREADY happened (and may have been billed), so a failure here must
  // end the attempt cleanly. Left to escape, it would strand the session in
  // `extracting` until the lease went stale and a refresh re-ran (and re-billed)
  // the whole extraction.
  let draft: ImportDraft;
  try {
    draft = await interpretObservation(account, result.observation, text);
  } catch {
    logDiagnostic({ event: "draft_build_failed", code: "draft_build_failed" });
    await failSession(
      account,
      session.id,
      token,
      { ok: false, code: "draft_build_failed", retryable: false },
      session.attemptCount,
    );
    return;
  }

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

async function interpretObservation(
  account: Account,
  observation: ExtractedPlanObservation,
  text: SourceTextPart[],
): Promise<ImportDraft> {
  const rawNames: string[] = [];
  for (const day of observation.days) {
    for (const ex of day.exercises) rawNames.push(ex.name.raw ?? "");
  }
  const matches = observation.isWorkoutPlan
    ? await matchExercises(account, rawNames)
    : [];

  const draft = buildImportDraft({
    observation,
    matches,
    parts: text,
  });
  return draft;
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
  // Durable recovery (RD-10): a session stuck in `extracting` whose lease is still
  // LIVE is an in-progress attempt — report its status (interruption-safe resume),
  // never start a second. A session whose lease has EXPIRED (the owning request
  // crashed or was torn down) is STALE and reclaimable by the compare-and-set
  // claim below; it is NOT an error. Only a truly non-startable state is refused.
  if (session.status === "extracting") {
    const leaseLive =
      session.leaseExpiresAt != null &&
      session.leaseExpiresAt.getTime() > Date.now();
    if (leaseLive) {
      return getImportStatus(account, session.id);
    }
    // else: stale lease — fall through to reclaim it via claimLease.
  } else if (session.status === "created") {
    // Nothing has been added yet (no text, no file): say what to do, not that
    // the import is "not ready".
    throw new DomainError(
      "invalid_state_transition",
      "Add your plan text or a file before processing.",
    );
  } else if (
    session.status !== "uploaded" &&
    session.status !== "failed_retryable"
  ) {
    throw new DomainError(
      "invalid_state_transition",
      "This import isn't ready to process.",
    );
  }

  // Daily quota: the started attempt is counted even if it later fails; an
  // idempotent re-poll does not re-count because the claim below gates the work
  // and the quota is REFUNDED on a lost-lease race (see below).
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
    // No work will run: refund the quota slot we just counted so a refused
    // reservation never costs the lifter one of the day's imports.
    await refundImportUsage(account.userId, input.dayKey).catch(() => {});
    throw new DomainError("import_unavailable", EXTRACTION_UNAVAILABLE_MESSAGE);
  }

  const token = await claimLease(account, session.id);
  if (!token) {
    // Another live attempt owns the lease; no work runs here. Release BOTH our
    // spend reservation AND the quota slot we counted, so a lost double-click /
    // two-tab race leaks neither: exactly one real attempt consumes exactly one
    // slot and one reservation (review fix — the bump previously leaked a slot).
    await releaseReservation(ESTIMATED_ATTEMPT_MICROS).catch(() => {});
    await refundImportUsage(account.userId, input.dayKey).catch(() => {});
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
      "We couldn't read this after several tries. Try a smaller import, or paste the text.",
    );
  }
  // Retrying is a new started attempt: re-run the begin path (quota + spend + lease).
  return beginExtraction(account, {
    sessionId: session.id,
    dayKey: input.dayKey,
  });
}

/** One source part as the review pane renders it (text, image, or a PDF link). */
export type SourceReadPart = {
  position: number;
  text: string | null;
  url: string | null;
  contentType: string | null;
  pageCount: number | null;
};

/** The source read URLs for the review source pane (short-TTL signed). */
export async function sourceReadUrls(
  account: Account,
  sessionId: string,
): Promise<SourceReadPart[]> {
  const parts = await account.db.importSourcePart.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      text: true,
      objectPath: true,
      contentType: true,
      pageCount: true,
    },
  });
  const paths = parts
    .map((p) => p.objectPath)
    .filter((p): p is string => p !== null);
  const signed = await signSourceReadUrls(paths);
  return parts.map((p) => ({
    position: p.position,
    text: p.text,
    url: p.objectPath ? (signed.get(p.objectPath) ?? null) : null,
    contentType: p.contentType,
    pageCount: p.pageCount,
  }));
}
